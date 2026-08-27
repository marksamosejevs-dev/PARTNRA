import { BusinessProfile } from "./business";
import { ClassifiedResult, SourceItem } from "./types";
import {
  classifyCategoryResults,
  scoreUnverified,
  scoreUnverifiedIfSignal,
  sampleAcrossSources,
  MAX_CLASSIFY_INPUT,
  BusinessContext,
  PartnerTypeIntent,
} from "./classify";
import { discoverCategoryFromWeb } from "./sources/web";
import { discoverCategoryFromOpenAI } from "./sources/openai";
import { discoverCategoryFromYoutube } from "./sources/youtube";
import { withFallback, raceWithTimeout } from "./timeout";
import { createScanLogger } from "./scanLogger";

const MAX_CATEGORY_POOL = 24;

export interface CategoryPool {
  pool: SourceItem[];
  itemsSearched: number;
}

/**
 * Fetches the category/product-signal search pool only -- no classification.
 * Deliberately kicked off as soon as the business's category is known,
 * concurrently with Strategy A (competitor-based discovery), rather than
 * only after Strategy A turns out to be weak: Strategy A's own resolve +
 * discover + classify stages already take longer than this in the typical
 * case, so running this in parallel costs nothing when it isn't needed,
 * while saving the full source-fetch latency on the path that matters most
 * -- the one where competitor signals are weak and every second counts
 * against the overall safety net. Never throws; every source degrades to no
 * results on its own failure.
 *
 * Excludes only the business's own domain at this stage -- which resolved
 * competitor domains to also exclude isn't known yet, since that resolution
 * runs concurrently as part of Strategy A. Callers should filter the
 * returned pool against those domains too, right before classifying it.
 */
export async function fetchCategoryPool(
  profile: BusinessProfile,
  ownDomain: string,
  sourceMs: number,
  log: ReturnType<typeof createScanLogger>
): Promise<CategoryPool> {
  const category = profile.category;
  if (!category) {
    return { pool: [], itemsSearched: 0 };
  }
  const keywords = profile.keywords;
  const concepts = profile.commercialIntentConcepts;

  log.mark("category_discovery_start", { category });
  const [webResult, openai, youtube] = await Promise.all([
    withFallback((signal) => discoverCategoryFromWeb(category, keywords, signal, concepts), sourceMs, "category web search", []),
    withFallback((signal) => discoverCategoryFromOpenAI(category, keywords, signal, concepts), sourceMs, "category OpenAI search", []),
    withFallback((signal) => discoverCategoryFromYoutube(category, keywords, signal, concepts), sourceMs, "category YouTube search", []),
  ]);
  log.mark("category_discovery_end", {
    foundWeb: webResult.length,
    foundOpenai: openai.length,
    foundYoutube: youtube.length,
  });

  const combined: SourceItem[] = [...webResult, ...openai, ...youtube];

  const pool: SourceItem[] = [];
  const seenUrls = new Set<string>();
  for (const item of combined) {
    let host: string;
    try {
      host = new URL(item.url).hostname.replace(/^www\./i, "");
    } catch {
      continue;
    }
    if (host === ownDomain) continue;
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    pool.push(item);
    if (pool.length >= MAX_CATEGORY_POOL) break;
  }

  return { pool, itemsSearched: combined.length };
}

/** Per-strategy counts for the exact discovery->classification funnel -- same shape used by route.ts for Strategy A, logged so a real deployed run can be audited stage by stage. */
export interface StrategyFunnel {
  totalCandidates: number;
  deduplicated: number;
  sentToAI: number;
  aiClassified: number;
  /** Classification call itself failed/timed out -- the FULL pool was scored deterministically, not just AI-rejected items. */
  timedOutFallbackScored: number;
  /** AI call succeeded, but these specific items were rejected (validCandidate:false) or never sent (past the AI input cap) and got rescued because they still showed a real keyword signal. */
  rescuedScored: number;
  rejectedWeakEvidence: number;
}

export interface CategoryClassifyResult {
  classified: ClassifiedResult[];
  funnel: StrategyFunnel;
}

/**
 * Classifies an already-fetched category pool (see fetchCategoryPool).
 * Kicked off concurrently with Strategy A's own classification, not after
 * it -- classification is the single most expensive/slowest stage in the
 * whole pipeline, and serializing two classify calls back-to-back is what
 * exhausted a real deployed scan's request budget (Strategy A's timed out
 * at 6s, then Strategy B's started with almost no budget left and was
 * aborted almost immediately). Whether Strategy B's results are actually
 * needed is decided by the caller after both finish, using signalStrength-
 * based ranking -- not by gating whether this runs at all.
 *
 * Never throws except on the outer AbortError from the safety net with
 * nothing to fall back on: if AI classification itself fails or times out
 * but the pool is non-empty, it degrades to deterministic, clearly
 * unverified scoring over the full pool (see classify.ts's scoreUnverified)
 * rather than discarding real, already-discovered evidence.
 */
export async function classifyCategoryPool(
  pool: SourceItem[],
  category: string,
  businessContext: BusinessContext,
  parentSignal: AbortSignal,
  classifyMs: number,
  log: ReturnType<typeof createScanLogger>,
  /** totalCandidates/deduplicated come from the earlier fetch+filter stages (fetchCategoryPool + the competitor-domain filter), which this function doesn't see directly -- passed in so the returned funnel covers the whole strategy, not just this stage. */
  priorFunnel: { totalCandidates: number; deduplicated: number },
  intent?: PartnerTypeIntent
): Promise<CategoryClassifyResult> {
  const funnel: StrategyFunnel = { ...priorFunnel, sentToAI: 0, aiClassified: 0, timedOutFallbackScored: 0, rescuedScored: 0, rejectedWeakEvidence: 0 };

  if (pool.length === 0) {
    return { classified: [], funnel };
  }

  // Backstop phrase list for the deterministic fallback scorer -- a plain
  // keyword scorer can't truly disambiguate "same word, different
  // category" the way the AI classification prompt above now can (see
  // classify.ts's buildBusinessContextBlock); this only down-weights items
  // with NO overlap at all with this business's own vocabulary.
  const categoryPhrases = [category, ...businessContext.commercialIntentConcepts];

  const classifyInput = sampleAcrossSources(pool, MAX_CLASSIFY_INPUT);
  const classifyInputUrls = new Set(classifyInput.map((i) => i.url));
  const overflow = pool.filter((i) => !classifyInputUrls.has(i.url));
  funnel.sentToAI = classifyInput.length;

  log.mark("category_classification_start", { poolSize: pool.length, sentToAI: classifyInput.length });
  try {
    const aiResult = await raceWithTimeout(
      (signal) => classifyCategoryResults(classifyInput, category, businessContext, signal, intent),
      classifyMs,
      "category classification",
      parentSignal
    );
    funnel.aiClassified = aiResult.length;

    const aiRejectedUrls = new Set(aiResult.filter((r) => !r.validCandidate).map((r) => r.sourceUrl));
    const rejectedItems = classifyInput.filter((item) => aiRejectedUrls.has(item.url));
    const rescued = scoreUnverifiedIfSignal([...rejectedItems, ...overflow], { categoryPhrases, intent, market: businessContext.market, businessModel: businessContext.businessModel });
    funnel.rescuedScored = rescued.length;
    funnel.rejectedWeakEvidence = aiRejectedUrls.size + overflow.length - rescued.length;

    const classified = [...aiResult, ...rescued];
    log.mark("category_classification_end", {
      aiClassified: aiResult.length,
      validFromAI: aiResult.filter((r) => r.validCandidate).length,
      rescued: rescued.length,
    });
    return { classified, funnel };
  } catch (err) {
    log.fail("category_classification", err);
    const classified = scoreUnverified(pool, { categoryPhrases, intent, market: businessContext.market, businessModel: businessContext.businessModel });
    funnel.timedOutFallbackScored = classified.length;
    log.mark("category_classification_end", { classified: classified.length, verified: false });
    return { classified, funnel };
  }
}
