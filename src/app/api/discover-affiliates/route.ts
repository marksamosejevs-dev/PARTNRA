import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import { normalizeCompetitorUrl, deriveBrandName } from "@/lib/discovery/domain";
import { buildSearchQueries } from "@/lib/discovery/queries";
import { searchWeb, isSearchConfigured, SearchProviderError } from "@/lib/discovery/search";
import { classifyResults, isClassifierConfigured, ClassifierError } from "@/lib/discovery/classify";
import { dedupeCandidates } from "@/lib/discovery/dedupe";
import { getMockCandidates } from "@/lib/discovery/mock";
import { DiscoverResponse, SearchResult } from "@/lib/discovery/types";

const SCAN_BUDGET_MS = 20_000;
const MAX_CANDIDATE_POOL = 20;
const MAX_RESULTS_RETURNED = 5;
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

  const { competitorUrl } = (body ?? {}) as { competitorUrl?: unknown };
  if (typeof competitorUrl !== "string") {
    return errorResponse("competitorUrl is required.", 400);
  }

  const url = normalizeCompetitorUrl(competitorUrl);
  if (!url) {
    return errorResponse("Enter a valid competitor URL, e.g. competitor.com", 400);
  }

  const domain = url.hostname.replace(/^www\./i, "");
  const brand = deriveBrandName(url.hostname);

  if (!(await domainLooksReachable(url.hostname))) {
    return errorResponse("We couldn't find that domain. Check the URL and try again.", 422);
  }

  const mockMode = process.env.PARTNRA_MOCK_MODE === "true";

  if (mockMode) {
    const candidates = getMockCandidates(brand);
    const response: DiscoverResponse = {
      mock: true,
      brand,
      domain,
      queriesRun: buildSearchQueries(brand, domain).length,
      totalFound: candidates.length,
      candidates: candidates.slice(0, MAX_RESULTS_RETURNED),
    };
    return NextResponse.json(response);
  }

  if (!isSearchConfigured()) {
    return errorResponse("Search API is not configured.", 501);
  }
  if (!isClassifierConfigured()) {
    return errorResponse("AI classification is not configured.", 501);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_BUDGET_MS);

  try {
    const queries = buildSearchQueries(brand, domain);

    const settled = await Promise.allSettled(
      queries.map((q) => searchWeb(q, controller.signal))
    );

    const pool: SearchResult[] = [];
    const seenUrls = new Set<string>();
    for (const outcome of settled) {
      if (outcome.status !== "fulfilled") continue;
      for (const result of outcome.value) {
        let resultHost: string;
        try {
          resultHost = new URL(result.url).hostname.replace(/^www\./i, "");
        } catch {
          continue;
        }
        if (resultHost === domain) continue; // the competitor's own site, not an affiliate
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);
        pool.push(result);
        if (pool.length >= MAX_CANDIDATE_POOL) break;
      }
      if (pool.length >= MAX_CANDIDATE_POOL) break;
    }

    const everyQueryFailed = settled.every((outcome) => outcome.status === "rejected");
    if (everyQueryFailed) {
      throw new SearchProviderError("All search queries failed");
    }

    if (pool.length === 0) {
      const response: DiscoverResponse = {
        mock: false,
        brand,
        domain,
        queriesRun: queries.length,
        totalFound: 0,
        candidates: [],
      };
      return NextResponse.json(response);
    }

    const classified = await classifyResults(pool, brand, domain, controller.signal);
    const deduped = dedupeCandidates(classified);

    const response: DiscoverResponse = {
      mock: false,
      brand,
      domain,
      queriesRun: queries.length,
      totalFound: deduped.length,
      candidates: deduped.slice(0, MAX_RESULTS_RETURNED),
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
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
    clearTimeout(timeout);
  }
}
