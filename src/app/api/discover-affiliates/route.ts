import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import { normalizeBrandUrl, deriveBrandName } from "@/lib/discovery/domain";
import { discoverFromWeb, isWebSearchConfigured, SearchProviderError } from "@/lib/discovery/sources/web";
import { discoverFromYoutube } from "@/lib/discovery/sources/youtube";
import { discoverFromInstagram } from "@/lib/discovery/sources/instagram";
import { discoverFromTikTok } from "@/lib/discovery/sources/tiktok";
import { classifyResults, isClassifierConfigured, ClassifierError } from "@/lib/discovery/classify";
import { dedupeCandidates } from "@/lib/discovery/dedupe";
import { enrichContact, isHunterConfigured } from "@/lib/discovery/hunter";
import { getMockCandidates } from "@/lib/discovery/mock";
import {
  fetchHomepageText,
  identifyBusiness,
  isBusinessAnalysisConfigured,
  BusinessAnalysisError,
} from "@/lib/discovery/business";
import { resolveCompetitorDomain, ResolvedCompetitor } from "@/lib/discovery/competitors";
import { raceWithTimeout, withFallback, StageTimeoutError } from "@/lib/discovery/timeout";
import { DiscoverResponse, SourceItem, ClassifiedResult } from "@/lib/discovery/types";

// Every external call below is individually bounded -- no single slow
// secondary call (in practice, Apify's synchronous actor-run endpoint) can
// hang and take the rest of the scan down with it, the way one shared
// AbortController + Promise.all used to. This outer figure is a last-resort
// circuit breaker only, sized comfortably above the sum of the stage
// timeouts below, so it should essentially never fire in normal operation.
const OVERALL_SAFETY_NET_MS = 55_000;

const HOMEPAGE_FETCH_TIMEOUT_MS = 6_000;
const BUSINESS_ANALYSIS_TIMEOUT_MS = 9_000;
const COMPETITOR_RESOLVE_TIMEOUT_MS = 5_000;
const SOURCE_TIMEOUT_MS = 7_000;
const CLASSIFY_TIMEOUT_MS = 9_000;
const ENRICH_TIMEOUT_MS = 5_000;

const MAX_COMPETITORS = 2;
const MAX_CANDIDATE_POOL = 30;
const MAX_RESULTS_RETURNED = 5;
const MAX_ENRICHED = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

// Best-effort only: this Map lives in a single serverless instance's memory,
// so it resets on cold start and doesn't share state across instances. Good
// enough to blunt casual button-mashing, not a real abuse defense.
const rateLimitHits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateLimitHits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(key, hits);
  return hits.length > RATE_LIMIT_MAX;
}

async function domainLooksReachable(hostname: string): Promise<boolean> {
  try {
    await dns.lookup(hostname);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    return true; // transient resolver issue — don't block the scan on it
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Production must never silently serve mock data, regardless of a stray env var. */
function mockModeEnabled(): boolean {
  return process.env.PARTNRA_MOCK_MODE === "true" && process.env.NODE_ENV !== "production";
}

function emptyResponse(brand: string, domain: string, businessCategory: string | null, competitorsAnalyzed: string[], queriesRun: number): DiscoverResponse {
  return {
    mock: false,
    brand,
    domain,
    queriesRun,
    totalFound: 0,
    candidates: [],
    businessCategory,
    competitorsAnalyzed,
  };
}

/**
 * Runs the full source-discovery + classification pass for one resolved
 * competitor. Each of the four sources is individually time-boxed and
 * gracefully degrades to an empty list rather than rejecting -- only the
 * classification step can still produce a genuine failure, since without it
 * we have nothing to return for this competitor.
 */
async function discoverForCompetitor(
  competitor: ResolvedCompetitor,
  parentSignal: AbortSignal
): Promise<{ classified: ClassifiedResult[]; itemsSearched: number }> {
  const [webResult, youtube, instagram, tiktok] = await Promise.all([
    raceWithTimeout(
      (signal) => discoverFromWeb(competitor.name, competitor.domain, signal),
      SOURCE_TIMEOUT_MS,
      `web search (${competitor.domain})`,
      parentSignal
    ).catch((err) => {
      // The required source: a real failure or timeout here is reported
      // distinctly below, not silently swallowed into "zero results".
      throw err;
    }),
    withFallback(
      (signal) => discoverFromYoutube(competitor.name, signal),
      SOURCE_TIMEOUT_MS,
      `YouTube search (${competitor.domain})`,
      []
    ),
    withFallback(
      (signal) => discoverFromInstagram(competitor.name, signal),
      SOURCE_TIMEOUT_MS,
      `Instagram search (${competitor.domain})`,
      []
    ),
    withFallback(
      (signal) => discoverFromTikTok(competitor.name, signal),
      SOURCE_TIMEOUT_MS,
      `TikTok search (${competitor.domain})`,
      []
    ),
  ]);

  const combined: SourceItem[] = [...webResult, ...youtube, ...instagram, ...tiktok];

  const pool: SourceItem[] = [];
  const seenUrls = new Set<string>();
  for (const item of combined) {
    let itemHost: string;
    try {
      itemHost = new URL(item.url).hostname.replace(/^www\./i, "");
    } catch {
      continue;
    }
    if (itemHost === competitor.domain) continue; // the competitor's own site, not a partner
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    pool.push(item);
    if (pool.length >= MAX_CANDIDATE_POOL) break;
  }

  if (pool.length === 0) {
    return { classified: [], itemsSearched: combined.length };
  }

  const classified = await raceWithTimeout(
    (signal) => classifyResults(pool, competitor.name, competitor.domain, signal),
    CLASSIFY_TIMEOUT_MS,
    `AI classification (${competitor.domain})`,
    parentSignal
  );

  return { classified, itemsSearched: combined.length };
}

export async function POST(request: NextRequest) {
  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(clientKey)) {
    return errorResponse("Too many scans from this connection. Please try again in a few minutes.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { brandUrl } = (body ?? {}) as { brandUrl?: unknown };
  if (typeof brandUrl !== "string") {
    return errorResponse("brandUrl is required.", 400);
  }

  const url = normalizeBrandUrl(brandUrl);
  if (!url) {
    return errorResponse("Enter a valid website, e.g. yourbrand.com", 400);
  }

  const domain = url.hostname.replace(/^www\./i, "");
  const brand = deriveBrandName(url.hostname);

  if (!(await domainLooksReachable(url.hostname))) {
    return errorResponse("We couldn't find that website. Check the URL and try again.", 422);
  }

  if (mockModeEnabled()) {
    const candidates = getMockCandidates(brand);
    const response: DiscoverResponse = {
      mock: true,
      brand,
      domain,
      queriesRun: 1,
      totalFound: candidates.length,
      candidates: candidates.slice(0, MAX_RESULTS_RETURNED),
      businessCategory: "Sports nutrition supplements",
      competitorsAnalyzed: ["examplecompetitor.com"],
    };
    return NextResponse.json(response);
  }

  if (!isWebSearchConfigured()) {
    return errorResponse("Search API is not configured.", 501);
  }
  if (!isClassifierConfigured() || !isBusinessAnalysisConfigured()) {
    return errorResponse("AI classification is not configured.", 501);
  }

  const controller = new AbortController();
  const safetyNet = setTimeout(() => controller.abort(), OVERALL_SAFETY_NET_MS);

  try {
    // Stage 1: understand what this business actually sells, grounded in
    // their real homepage content where we can fetch it. A fetch failure
    // degrades to analysing from the domain-derived name alone rather than
    // failing outright.
    const page = await withFallback(
      (signal) => fetchHomepageText(url, signal),
      HOMEPAGE_FETCH_TIMEOUT_MS,
      "homepage fetch",
      null
    );

    let profile;
    try {
      profile = await raceWithTimeout(
        (signal) => identifyBusiness(brand, domain, page, signal),
        BUSINESS_ANALYSIS_TIMEOUT_MS,
        "business analysis",
        controller.signal
      );
    } catch (err) {
      if (err instanceof StageTimeoutError || err instanceof BusinessAnalysisError) {
        return errorResponse("We couldn't analyse your business right now. Please try again in a moment.", 502);
      }
      throw err;
    }

    if (profile.competitorNames.length === 0) {
      return NextResponse.json(emptyResponse(brand, domain, profile.category, [], 0));
    }

    // Stage 2: resolve each suggested brand name to a real, live domain —
    // never trust the model's name alone. Resolution failures just drop
    // that candidate competitor rather than fabricating a domain.
    const resolvedOrNull = await Promise.all(
      profile.competitorNames.slice(0, MAX_COMPETITORS).map((name) =>
        withFallback(
          (signal) => resolveCompetitorDomain(name, signal),
          COMPETITOR_RESOLVE_TIMEOUT_MS,
          `resolve competitor "${name}"`,
          null
        )
      )
    );
    const competitors = resolvedOrNull.filter((c): c is ResolvedCompetitor => c !== null);

    if (competitors.length === 0) {
      return NextResponse.json(emptyResponse(brand, domain, profile.category, [], 0));
    }

    // Stage 3 + 4: for each resolved competitor, discover who already
    // promotes them and classify the evidence — in parallel across
    // competitors. One competitor's pipeline failing outright (the required
    // web source genuinely broken/timed out) doesn't sink the others.
    const perCompetitor = await Promise.allSettled(
      competitors.map((c) => discoverForCompetitor(c, controller.signal))
    );

    const allClassified: ClassifiedResult[] = [];
    let queriesRun = 0;
    let anyCompetitorSucceeded = false;
    let sourceFailure: unknown = null;

    for (const outcome of perCompetitor) {
      if (outcome.status === "fulfilled") {
        anyCompetitorSucceeded = true;
        allClassified.push(...outcome.value.classified);
        queriesRun += outcome.value.itemsSearched;
      } else {
        sourceFailure = outcome.reason;
      }
    }

    if (!anyCompetitorSucceeded) {
      const err = sourceFailure;
      if (err instanceof StageTimeoutError || err instanceof SearchProviderError) {
        return errorResponse("We couldn't complete the search right now. Please try again in a moment.", 502);
      }
      if (err instanceof ClassifierError) {
        return errorResponse("We couldn't verify the evidence right now. Please try again in a moment.", 502);
      }
      throw err;
    }

    const deduped = dedupeCandidates(allClassified);

    if (deduped.length === 0) {
      return NextResponse.json(
        emptyResponse(brand, domain, profile.category, competitors.map((c) => c.domain), queriesRun)
      );
    }

    const shortlist = deduped.slice(0, MAX_ENRICHED);

    // Enrichment runs only on the already-verified shortlist, after dedupe —
    // never spend a Hunter credit on a weak or duplicate candidate. Each
    // lookup is individually bounded, so one slow/hanging contact lookup
    // degrades that single candidate to contactStatus "not_attempted"
    // instead of holding up or breaking the rest of an otherwise-successful
    // result.
    const enriched = isHunterConfigured()
      ? await Promise.all(
          shortlist.map(async (candidate) => {
            const { contact, contactStatus } = await withFallback(
              (signal) => enrichContact(candidate, signal),
              ENRICH_TIMEOUT_MS,
              `contact enrichment for ${candidate.name ?? "candidate"}`,
              { contact: null, contactStatus: "not_attempted" as const }
            );
            return { ...candidate, contact, contactStatus };
          })
        )
      : shortlist;

    const response: DiscoverResponse = {
      mock: false,
      brand,
      domain,
      queriesRun,
      totalFound: deduped.length,
      candidates: enriched.slice(0, MAX_RESULTS_RETURNED),
      businessCategory: profile.category,
      competitorsAnalyzed: competitors.map((c) => c.domain),
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse("The scan took too long. Please try again.", 504);
    }
    if (err instanceof StageTimeoutError) {
      return errorResponse("The scan took too long. Please try again.", 504);
    }
    if (err instanceof SearchProviderError) {
      return errorResponse("We couldn't complete the search right now. Please try again in a moment.", 502);
    }
    if (err instanceof ClassifierError) {
      return errorResponse("We couldn't verify the evidence right now. Please try again in a moment.", 502);
    }
    return errorResponse("Something went wrong. Please try again.", 500);
  } finally {
    clearTimeout(safetyNet);
  }
}
