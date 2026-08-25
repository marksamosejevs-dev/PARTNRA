import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { promises as dns } from "dns";
import { normalizeBrandUrl, deriveBrandName } from "@/lib/discovery/domain";
import { discoverFromWeb, isWebSearchConfigured, SearchProviderError } from "@/lib/discovery/sources/web";
import { discoverFromOpenAI } from "@/lib/discovery/sources/openai";
import { discoverFromYoutube } from "@/lib/discovery/sources/youtube";
import {
  classifyResults,
  scoreUnverified,
  scoreUnverifiedIfSignal,
  sampleAcrossSources,
  isClassifierConfigured,
  ClassifierError,
  MAX_CLASSIFY_INPUT,
} from "@/lib/discovery/classify";
import { dedupeCandidates, minConfidenceFor } from "@/lib/discovery/dedupe";
import { enrichContact, isHunterConfigured } from "@/lib/discovery/hunter";
import { getMockCandidates } from "@/lib/discovery/mock";
import {
  fetchHomepageText,
  fetchBusinessContextFromWeb,
  identifyBusiness,
  isBusinessAnalysisConfigured,
  BusinessAnalysisError,
} from "@/lib/discovery/business";
import { resolveCompetitorDomain, ResolvedCompetitor } from "@/lib/discovery/competitors";
import { fetchCategoryPool, classifyCategoryPool, StrategyFunnel } from "@/lib/discovery/categoryDiscovery";
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
// A bit more generous than the other source-timeout budgets: this one
// fallback call now covers two Serper queries plus an OpenAI web-search
// round trip (search + synthesize), run in parallel -- and it only ever
// runs on the homepage-fetch-failure path, not on every scan.
const BUSINESS_CONTEXT_SEARCH_TIMEOUT_MS = 6_000;
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

function emptyFunnel(): StrategyFunnel {
  return { totalCandidates: 0, deduplicated: 0, sentToAI: 0, aiClassified: 0, timedOutFallbackScored: 0, rescuedScored: 0, rejectedWeakEvidence: 0 };
}

function emptyResponse(
  brand: string,
  domain: string,
  profile: { category: string | null; market: string | null; keywords: string[] },
  competitorsAnalyzed: string[],
  queriesRun: number,
  discoveryStrategiesUsed: Array<"competitor" | "category">
): DiscoverResponse {
  return {
    mock: false,
    brand,
    domain,
    queriesRun,
    totalFound: 0,
    candidates: [],
    businessCategory: profile.category,
    businessMarket: profile.market,
    businessKeywords: profile.keywords,
    competitorsAnalyzed,
    discoveryStrategiesUsed,
  };
}

/**
 * Runs source discovery + classification for one resolved competitor. Web,
 * OpenAI and YouTube each get their own bounded timeout and run in
 * parallel. Web search (Serper) is the primary source, but its failure is
 * captured rather than left to reject the surrounding Promise.all -- a
 * Promise.all rejects as soon as ANY input rejects, which would otherwise
 * throw away OpenAI/YouTube's results too even when they succeeded. Serper
 * failing only actually fails this competitor once OpenAI and YouTube also
 * came back with nothing to offer instead.
 */
async function discoverForCompetitor(
  competitor: ResolvedCompetitor,
  parentSignal: AbortSignal,
  log: ReturnType<typeof createScanLogger>
): Promise<{ classified: ClassifiedResult[]; itemsSearched: number; funnel: StrategyFunnel }> {
  log.mark("web_discovery_start", { domain: competitor.domain });
  log.mark("openai_discovery_start", { domain: competitor.domain });
  log.mark("youtube_discovery_start", { domain: competitor.domain });

  const [webOutcome, openai, youtube] = await Promise.all([
    raceWithTimeout(
      (signal) => discoverFromWeb(competitor.name, competitor.domain, signal),
      SOURCE_TIMEOUT_MS,
      `web search (${competitor.domain})`,
      parentSignal
    )
      .then((items) => ({ ok: true as const, items }))
      .catch((err) => {
        log.fail("web_discovery", err, { domain: competitor.domain, provider: "serper" });
        return { ok: false as const, error: err };
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
  const webResult = webOutcome.ok ? webOutcome.items : [];
  log.mark("web_discovery_end", {
    domain: competitor.domain,
    found: webResult.length,
    failed: !webOutcome.ok,
  });
  log.mark("openai_discovery_end", { domain: competitor.domain, found: openai.length });
  log.mark("youtube_discovery_end", { domain: competitor.domain, found: youtube.length });

  const combined: SourceItem[] = [...webResult, ...openai, ...youtube];
  const funnel = emptyFunnel();
  funnel.totalCandidates = combined.length;

  if (combined.length === 0) {
    // Nothing came back from any source for this competitor. If web search
    // specifically errored (rather than just legitimately finding zero
    // results) and nothing else filled in either, that's the honest reason
    // to report -- but only now, once every alternative has had its chance.
    if (!webOutcome.ok) throw webOutcome.error;
    return { classified: [], itemsSearched: 0, funnel };
  }

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
  funnel.deduplicated = combined.length - pool.length;

  if (pool.length === 0) {
    return { classified: [], itemsSearched: combined.length, funnel };
  }

  // Classification latency scales with pool size (both the prompt and,
  // more, the structured output the model has to produce). Cap what
  // actually goes to the AI call for speed, sampled evenly across sources
  // so a naive prefix slice can't silently exclude an entire provider (e.g.
  // every YouTube item) just because Serper's results happened to come
  // first in the combined pool.
  const classifyInput = sampleAcrossSources(pool, MAX_CLASSIFY_INPUT);
  const classifyInputUrls = new Set(classifyInput.map((i) => i.url));
  const overflow = pool.filter((i) => !classifyInputUrls.has(i.url));
  funnel.sentToAI = classifyInput.length;

  log.mark("classification_start", { domain: competitor.domain, poolSize: pool.length, sentToAI: classifyInput.length });
  let classified: ClassifiedResult[];
  try {
    const aiResult = await raceWithTimeout(
      (signal) => classifyResults(classifyInput, competitor.name, competitor.domain, signal),
      CLASSIFY_TIMEOUT_MS,
      `AI classification (${competitor.domain})`,
      parentSignal
    );
    funnel.aiClassified = aiResult.length;

    // Items the AI evaluated but didn't confirm as strong-enough evidence,
    // plus anything past the AI input cap that was never evaluated at all,
    // still get an honest, deterministic second look: real search signal
    // must not just vanish because the AI's stricter competitor-relationship
    // bar wasn't met. Only items that ALSO show a real keyword signal are
    // rescued -- a plain brand mention with nothing else stays excluded.
    const aiRejectedUrls = new Set(aiResult.filter((r) => !r.validCandidate).map((r) => r.sourceUrl));
    const rejectedItems = classifyInput.filter((item) => aiRejectedUrls.has(item.url));
    const rescued = scoreUnverifiedIfSignal([...rejectedItems, ...overflow]);
    funnel.rescuedScored = rescued.length;
    funnel.rejectedWeakEvidence = aiRejectedUrls.size + overflow.length - rescued.length;

    classified = [...aiResult, ...rescued];
    log.mark("classification_end", {
      domain: competitor.domain,
      aiClassified: aiResult.length,
      validFromAI: aiResult.filter((r) => r.validCandidate).length,
      rescued: rescued.length,
    });
  } catch (err) {
    // AI classification failing or timing out must never throw away a real,
    // already-discovered evidence pool -- degrade to deterministic,
    // clearly-unverified scoring over the full pool instead of rejecting.
    log.fail("classification", err, { domain: competitor.domain, provider: "anthropic" });
    classified = scoreUnverified(pool);
    funnel.timedOutFallbackScored = classified.length;
    log.mark("classification_end", { domain: competitor.domain, classified: classified.length, verified: false });
  }

  return { classified, itemsSearched: combined.length, funnel };
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
      businessMarket: "United States",
      businessKeywords: ["protein powder", "electrolyte mix"],
      competitorsAnalyzed: ["examplecompetitor.com"],
      discoveryStrategiesUsed: ["competitor"],
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
    // falls back to a web search for the domain/brand instead of leaving
    // business analysis with nothing but the bare domain name to guess from.
    log.mark("homepage_fetch_start");
    const page = await withFallback(
      (signal) => fetchHomepageText(url, signal, log),
      HOMEPAGE_FETCH_TIMEOUT_MS,
      "homepage fetch",
      null
    );
    log.mark("homepage_fetch_end", { fetched: page !== null });

    let searchContext: string | null = null;
    if (!page) {
      log.mark("business_context_search_start");
      searchContext = await withFallback(
        (signal) => fetchBusinessContextFromWeb(brand, domain, signal),
        BUSINESS_CONTEXT_SEARCH_TIMEOUT_MS,
        "business context web search",
        null
      );
      log.mark("business_context_search_end", { found: searchContext !== null });
    }

    let profile;
    log.mark("business_analysis_start");
    try {
      profile = await raceWithTimeout(
        (signal) => identifyBusiness(brand, domain, page, searchContext, signal),
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

    // Category/product-signal search is kicked off now, concurrently with
    // competitor resolution below -- it doesn't depend on which competitors
    // resolve.
    const categoryPoolPromise = fetchCategoryPool(profile, domain, SOURCE_TIMEOUT_MS, log);

    // Resolve competitors -- a high-value signal, not a hard prerequisite.
    // Resolution failures just drop that candidate competitor rather than
    // fabricating a domain. Needed before the concurrent block below both
    // for Strategy A's own discovery and to filter competitor domains out
    // of the category pool.
    let competitors: ResolvedCompetitor[] = [];
    if (profile.competitorNames.length > 0) {
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
      competitors = resolvedOrNull.filter((c): c is ResolvedCompetitor => c !== null);
      log.mark("competitor_resolution_end", { resolved: competitors.map((c) => c.domain) });
    }

    // Strategy A (competitor discovery+classification) and Strategy B/C/D
    // (category discovery+classification) now run FULLY concurrently --
    // confirmed root cause of a real deployed scan failing: they ran
    // sequentially, Strategy A's classification alone consumed the request
    // budget down to the wire, and Strategy B's classification started with
    // almost no time left before the overall safety net aborted it.
    // Neither strategy depends on the other's outcome; both are merged
    // afterward and ranked by signal strength (see dedupeCandidates), so a
    // strong Strategy A result always outranks a Strategy B one without
    // needing to decide in advance which to bother running.
    const [perCompetitorOutcomes, categoryOutcome] = await Promise.all([
      Promise.allSettled(competitors.map((c) => discoverForCompetitor(c, controller.signal, log))),
      (async (): Promise<{ classified: ClassifiedResult[]; itemsSearched: number; funnel: StrategyFunnel }> => {
        const { pool: categoryPool, itemsSearched } = await categoryPoolPromise;
        if (!profile.category || categoryPool.length === 0) {
          return { classified: [], itemsSearched, funnel: emptyFunnel() };
        }
        // Competitor domains weren't known when the pool was fetched --
        // filter them out now, so a resolved competitor's own site never
        // gets classified as a partner.
        const competitorDomains = new Set(competitors.map((c) => c.domain));
        const filteredPool = categoryPool.filter((item) => {
          try {
            return !competitorDomains.has(new URL(item.url).hostname.replace(/^www\./i, ""));
          } catch {
            return false;
          }
        });
        const priorFunnel = { totalCandidates: categoryPool.length, deduplicated: categoryPool.length - filteredPool.length };
        if (filteredPool.length === 0) {
          return { classified: [], itemsSearched, funnel: { ...priorFunnel, sentToAI: 0, aiClassified: 0, timedOutFallbackScored: 0, rescuedScored: 0, rejectedWeakEvidence: 0 } };
        }
        const { classified, funnel } = await classifyCategoryPool(
          filteredPool,
          profile.category,
          controller.signal,
          CLASSIFY_TIMEOUT_MS,
          log,
          priorFunnel
        );
        return { classified, itemsSearched, funnel };
      })(),
    ]);

    const strategyAClassified: ClassifiedResult[] = [];
    let strategyAQueriesRun = 0;
    let anyCompetitorSucceeded = false;
    const strategyAFunnel = emptyFunnel();
    for (const outcome of perCompetitorOutcomes) {
      if (outcome.status === "fulfilled") {
        anyCompetitorSucceeded = true;
        strategyAClassified.push(...outcome.value.classified);
        strategyAQueriesRun += outcome.value.itemsSearched;
        strategyAFunnel.totalCandidates += outcome.value.funnel.totalCandidates;
        strategyAFunnel.deduplicated += outcome.value.funnel.deduplicated;
        strategyAFunnel.sentToAI += outcome.value.funnel.sentToAI;
        strategyAFunnel.aiClassified += outcome.value.funnel.aiClassified;
        strategyAFunnel.timedOutFallbackScored += outcome.value.funnel.timedOutFallbackScored;
        strategyAFunnel.rescuedScored += outcome.value.funnel.rescuedScored;
        strategyAFunnel.rejectedWeakEvidence += outcome.value.funnel.rejectedWeakEvidence;
      }
    }
    const strategyAInfraFailed = competitors.length > 0 && !anyCompetitorSucceeded;

    const strategyBClassified = categoryOutcome.classified;
    const strategyBQueriesRun = categoryOutcome.itemsSearched;
    const strategyBFunnel = categoryOutcome.funnel;

    const allClassified = [...strategyAClassified, ...strategyBClassified];
    const queriesRun = strategyAQueriesRun + strategyBQueriesRun;
    const discoveryStrategiesUsed: Array<"competitor" | "category"> = [
      ...(competitors.length > 0 ? (["competitor"] as const) : []),
      ...(strategyBClassified.length > 0 ? (["category"] as const) : []),
    ];

    // A hard error is reserved for genuine infrastructure failure -- never
    // for legitimately weak or absent evidence, which still returns an
    // honest (possibly empty) result below. Classification itself can no
    // longer fail outright (a timeout/error degrades to deterministic,
    // clearly-unverified scoring over the full pool instead -- see
    // classify.ts's scoreUnverified), so the only failure mode left is the
    // required discovery source genuinely breaking for every resolved
    // competitor while category discovery also turned up nothing at all.
    // (One known, pre-existing gap: if the required search provider itself
    // is fully down, competitor resolution and the category fallback's web
    // search both already degrade to "found nothing" rather than
    // surfacing that as an infra failure here -- the structured logs above
    // capture the real HTTP status/error either way.)
    const allAttemptsInfraFailed = strategyAInfraFailed && allClassified.length === 0;

    if (allAttemptsInfraFailed) {
      log.mark("response_sent", { outcome: "all_strategies_failed" });
      return errorResponse("We couldn't complete the search right now. Please try again in a moment.", 502);
    }

    const deduped = dedupeCandidates(allClassified);

    // Full discovery -> classification funnel, logged once per scan so a
    // real run can be audited stage by stage without guessing where
    // candidates disappeared. "removedByConfidence" replicates dedupe.ts's
    // own gate rather than exposing it as a side channel from that
    // function -- verified:false candidates are never actually gated by
    // confidence (see minConfidenceFor), so this is expected to be 0 for
    // them and only ever count real AI-verified rejections.
    const verifiedTrueCount = allClassified.filter((c) => c.validCandidate && c.verified).length;
    const verifiedFalseCount = allClassified.filter((c) => c.validCandidate && !c.verified).length;
    const removedByConfidence = allClassified.filter(
      (c) => c.validCandidate && c.confidence < minConfidenceFor(c.signalStrength, c.verified)
    ).length;
    log.mark("funnel_summary", {
      totalCandidates: strategyAFunnel.totalCandidates + strategyBFunnel.totalCandidates,
      removedForDomainOrDuplicate: strategyAFunnel.deduplicated + strategyBFunnel.deduplicated,
      sentToAI: strategyAFunnel.sentToAI + strategyBFunnel.sentToAI,
      aiClassified: strategyAFunnel.aiClassified + strategyBFunnel.aiClassified,
      timedOutUsedFullPoolFallback: strategyAFunnel.timedOutFallbackScored + strategyBFunnel.timedOutFallbackScored,
      rescuedFromAiRejectionOrOverflow: strategyAFunnel.rescuedScored + strategyBFunnel.rescuedScored,
      verifiedTrueCount,
      verifiedFalseCount,
      rejectedWeakEvidenceNotRescued: strategyAFunnel.rejectedWeakEvidence + strategyBFunnel.rejectedWeakEvidence,
      removedByMinimumConfidence: removedByConfidence,
      finalReturned: Math.min(deduped.length, MAX_RESULTS_RETURNED),
      totalFoundBeforeSlice: deduped.length,
    });

    if (deduped.length === 0) {
      log.mark("response_sent", { outcome: "no_candidates_found" });
      return NextResponse.json(
        emptyResponse(brand, domain, profile, competitors.map((c) => c.domain), queriesRun, discoveryStrategiesUsed)
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
      businessMarket: profile.market,
      businessKeywords: profile.keywords,
      competitorsAnalyzed: competitors.map((c) => c.domain),
      discoveryStrategiesUsed,
    };
    log.mark("response_sent", {
      outcome: "success",
      totalFound: deduped.length,
      strategiesUsed: discoveryStrategiesUsed,
    });
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
