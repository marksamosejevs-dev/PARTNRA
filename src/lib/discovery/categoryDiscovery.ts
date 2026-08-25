import { BusinessProfile } from "./business";
import { ClassifiedResult, SourceItem } from "./types";
import { classifyCategoryResults } from "./classify";
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

  log.mark("category_discovery_start", { category });
  const [webResult, openai, youtube] = await Promise.all([
    withFallback((signal) => discoverCategoryFromWeb(category, keywords, signal), sourceMs, "category web search", []),
    withFallback((signal) => discoverCategoryFromOpenAI(category, keywords, signal), sourceMs, "category OpenAI search", []),
    withFallback((signal) => discoverCategoryFromYoutube(category, keywords, signal), sourceMs, "category YouTube search", []),
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

export interface CategoryClassifyResult {
  classified: ClassifiedResult[];
  /** True only on a genuine infra-level failure (e.g. classifier down) -- never set just because evidence turned out to be weak or absent. */
  infraFailed: boolean;
}

/**
 * Classifies an already-fetched category pool (see fetchCategoryPool).
 * Split out so the caller can decide, only after seeing how Strategy A did,
 * whether this -- comparatively the more expensive step -- is worth
 * spending at all.
 */
export async function classifyCategoryPool(
  pool: SourceItem[],
  category: string,
  parentSignal: AbortSignal,
  classifyMs: number,
  log: ReturnType<typeof createScanLogger>
): Promise<CategoryClassifyResult> {
  if (pool.length === 0) {
    return { classified: [], infraFailed: false };
  }

  log.mark("category_classification_start", { poolSize: pool.length });
  try {
    const classified = await raceWithTimeout(
      (signal) => classifyCategoryResults(pool, category, signal),
      classifyMs,
      "category classification",
      parentSignal
    );
    log.mark("category_classification_end", { classified: classified.length });
    return { classified, infraFailed: false };
  } catch (err) {
    log.fail("category_classification", err, { required: false });
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { classified: [], infraFailed: true };
  }
}
