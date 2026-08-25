import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { promises as dns } from "dns";
import { normalizeBrandUrl, deriveBrandName } from "@/lib/discovery/domain";
import { discoverFromWeb, isWebSearchConfigured, SearchProviderError } from "@/lib/discovery/sources/web";
import { discoverFromOpenAI } from "@/lib/discovery/sources/openai";
import { discoverFromYoutube } from "@/lib/discovery/sources/youtube";
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
import { raceWithTimeout, withFallback, raceValueWithTimeout, StageTimeoutError } from "@/lib/discovery/timeout";
import { createScanLogger } from "@/lib/discovery/scanLogger";
import { DiscoverResponse, SourceItem, ClassifiedResult } from "@/lib/discovery/types";

// NOTE on Instagram/TikTok (Apify): deliberately NOT wired into this route.
// Apify's synchronous run-sync-get-dataset-items endpoint is the confirmed
// bottleneck behind repeated production timeouts -- actor cold starts alone
// can take longer than this entire route's budget below. There's no job
// queue/database in this project to genuinely run them out-of-band and
// enrich results afterward, so rather than keep a fundamentally slow
// synchronous call in the critical path "with a timeout on it" (which just
// re-creates the same failure mode with smaller numbers), they're removed
// from the request path entirely for now. The provider modules themselves
// (src/lib/discovery/sources/instagram.ts, tiktok.ts) are untouched and
// ready to be re-attached once background enrichment exists.
//
// Every remaining external call below is individually bounded. This outer
// figure is a last-resort circuit breaker sized to fire BEFORE Netlify's own
// ~26s hard ceiling on synchronous functions would kill the process outright
// -- if this fires, the user still gets this route's own honest JSON error
// instead of a raw platform-level gateway timeout. The margin below 26s is
// deliberately generous: this in-process timer only starts once our code is
// already running, after whatever invocation/proxy overhead Netlify itself
// adds on top, which this route has no visibility into.
const OVERALL_SAFETY_NET_MS = 20_000;

const DNS_LOOKUP_TIMEOUT_MS = 3_000;
const HOMEPAGE_FETCH_TIMEOUT_MS = 4_000;
const BUSINESS_ANALYSIS_TIMEOUT_MS = 7_000;
const COMPETITOR_RESOLVE_TIMEOUT_MS = 3_500;
const SOURCE_TIMEOUT_MS = 5_000;
const CLASSIFY_TIMEOUT_MS = 6_000;
const ENRICH_TIMEOUT_MS = 3_500;

// Kept at 1 for now: competitors already run in parallel with each other,
// but real-world provider concurrency/rate limits don't always behave like
// the theoretical parallel case, and each additional competitor doubles the
// classification cost. Quality over quantity while reliability is the
// priority -- easy to raise once real deployed timings confirm headroom.
const MAX_COMPETITORS = 1;
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

/** Node's dns.lookup has no AbortSignal support -- bounded explicitly instead of left to hang. */
async function domainLooksReachable(hostname: string): Promise<boolean> {
  try {
    await raceValueWithTimeout(dns.lookup(hostname), DNS_LOOKUP_TIMEOUT_MS, "reachability DNS lookup");
    return true;
  } catch (err) {
    if (err instanceof StageTimeoutError) return true; // transient/slow resolver — don't block the scan on it
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    return true;
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Production must never silently serve mock data, regardless of a stray env var. */
function mockModeEnabled(): boolean {
  return process.env.PARTNRA_MOCK_MODE === "true" && process.env.NODE_ENV !== "production";
}

function emptyResponse(
  brand: string,
  domain: string,
  businessCategory: string | null,
  competitorsAnalyzed: string[],
  queriesRun: number
): DiscoverResponse {
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
 * Runs source discovery + classification for one resolved competitor. Web,
 * OpenAI and YouTube each get their own bounded timeout and run in
 * parallel; only the required web source can still fail this outright,
 * since without it there's nothing to classify for this competitor.
 */
async function discoverForCompetitor(
  competitor: ResolvedCompetitor,
  parentSignal: AbortSignal,
  log: ReturnType<typeof createScanLogger>
): Promise<{ classified: ClassifiedResult[]; itemsSearched: number }> {
  log.mark("web_discovery_start", { domain: competitor.domain });
  log.mark("openai_discovery_start", { domain: competitor.domain });
  log.mark("youtube_discovery_start", { domain: competitor.domain });

  const [webResult, openai, youtube] = await Promise.all([
    raceWithTimeout(
      (signal) => discoverFromWeb(competitor.name, competitor.domain, signal),
      SOURCE_TIMEOUT_MS,
      `web search (${competitor.domain})`,
      parentSignal
    ).catch((err) => {
      log.fail("web_discovery", err, { domain: competitor.domain, provider: "serper", required: true });
      // The required source: a real failure or timeout here is reported
      // distinctly below, not silently swallowed into "zero results".
      throw err;
    }),
    withFallback(
      (signal) => discoverFromOpenAI(competitor.name, signal),
      SOURCE_TIMEOUT_MS,
      `OpenAI web search (${competitor.domain})`,
      []
    ),
    withFallback(
      (signal) => discoverFromYoutube(competitor.name, signal),
      SOURCE_TIMEOUT_MS,
      `YouTube search (${competitor.domain})`,
      []
    ),
  ]);
  log.mark("web_discovery_end", { domain: competitor.domain, found: webResult.length });
  log.mark("openai_discovery_end", { domain: competitor.domain, found: openai.length });
  log.mark("youtube_discovery_end", { domain: competitor.domain, found: youtube.length });

  const combined: SourceItem[] = [...webResult, ...openai, ...youtube];

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

  log.mark("classification_start", { domain: competitor.domain, poolSize: pool.length });
  const classified = await raceWithTimeout(
    (signal) => classifyResults(pool, competitor.name, competitor.domain, signal),
    CLASSIFY_TIMEOUT_MS,
    `AI classification (${competitor.domain})`,
    parentSignal
  ).catch((err) => {
    log.fail("classification", err, { domain: competitor.domain, provider: "anthropic", required: true });
    throw err;
  });
  log.mark("classification_end", { domain: competitor.domain, classified: classified.length });

  return { classified, itemsSearched: combined.length };
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const log = createScanLogger(requestId);
  log.mark("request_received");

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
    log.mark("rejected_unreachable_domain", { domain });
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
    log.mark("homepage_fetch_start");
    const page = await withFallback(
      (signal) => fetchHomepageText(url, signal),
      HOMEPAGE_FETCH_TIMEOUT_MS,
      "homepage fetch",
      null
    );
    log.mark("homepage_fetch_end", { fetched: page !== null });

    let profile;
    log.mark("business_analysis_start");
    try {
      profile = await raceWithTimeout(
        (signal) => identifyBusiness(brand, domain, page, signal),
        BUSINESS_ANALYSIS_TIMEOUT_MS,
        "business analysis",
        controller.signal
      );
    } catch (err) {
      log.fail("business_analysis", err, { provider: "anthropic", required: true });
      if (err instanceof StageTimeoutError || err instanceof BusinessAnalysisError) {
        return errorResponse("We couldn't analyse your business right now. Please try again in a moment.", 502);
      }
      throw err;
    }
    log.mark("business_analysis_end", {
      category: profile.category,
      suggestedCompetitors: profile.competitorNames.length,
    });

    if (profile.competitorNames.length === 0) {
      log.mark("response_sent", { outcome: "no_competitors_identified" });
      return NextResponse.json(emptyResponse(brand, domain, profile.category, [], 0));
    }

    // Stage 2: resolve each suggested brand name to a real, live domain —
    // never trust the model's name alone. Resolution failures just drop
    // that candidate competitor rather than fabricating a domain.
    log.mark("competitor_resolution_start", { candidates: profile.competitorNames.length });
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
    log.mark("competitor_resolution_end", { resolved: competitors.map((c) => c.domain) });

    if (competitors.length === 0) {
      log.mark("response_sent", { outcome: "no_competitors_resolved" });
      return NextResponse.json(emptyResponse(brand, domain, profile.category, [], 0));
    }

    // Stage 3 + 4: for each resolved competitor, discover who already
    // promotes them and classify the evidence — in parallel across
    // competitors. One competitor's pipeline failing outright (the required
    // web source genuinely broken/timed out) doesn't sink the others.
    const perCompetitor = await Promise.allSettled(
      competitors.map((c) => discoverForCompetitor(c, controller.signal, log))
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
      log.mark("response_sent", { outcome: "all_competitors_failed" });
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
      log.mark("response_sent", { outcome: "no_candidates_after_dedupe" });
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
    log.mark("enrichment_start", { shortlistSize: shortlist.length });
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
    log.mark("enrichment_end", { found: enriched.filter((c) => c.contactStatus === "found").length });

    log.mark("response_serialization_start");
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
    log.mark("response_sent", { outcome: "success", totalFound: deduped.length });
    return NextResponse.json(response);
  } catch (err) {
    log.fail("unhandled", err, { required: true });
    log.mark("response_sent", { outcome: "error" });
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
