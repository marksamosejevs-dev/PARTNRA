import { SourceItem } from "../types";
import { buildSearchQueries, buildCategoryQueries } from "../queries";

export class SearchProviderError extends Error {}

/**
 * A generic entry point onto the same Serper query runner discoverFromWeb
 * already uses internally -- for callers with their own already-built
 * query strings (e.g. Deep Discovery's entity-expansion "does entity X
 * also show evidence of Y" search) rather than the brand/category-shaped
 * queries buildSearchQueries/buildCategoryQueries generate. Same honest
 * "throws only if EVERY query failed" contract.
 */
export async function discoverFromQueries(queries: string[], signal: AbortSignal): Promise<SourceItem[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new SearchProviderError("SERPER_API_KEY is not configured");
  const provider = (process.env.SEARCH_PROVIDER || "serper").toLowerCase();
  if (provider !== "serper") throw new SearchProviderError(`Unknown SEARCH_PROVIDER "${provider}"`);
  return runSerperQueries(queries, apiKey, signal);
}

async function runSerperQueries(queries: string[], apiKey: string, signal: AbortSignal): Promise<SourceItem[]> {
  const settled = await Promise.allSettled(queries.map((q) => searchSerper(q, apiKey, signal)));

  if (settled.every((outcome) => outcome.status === "rejected")) {
    throw new SearchProviderError("All Serper queries failed");
  }

  return settled.flatMap((outcome) => (outcome.status === "fulfilled" ? outcome.value : []));
}

async function searchSerper(query: string, apiKey: string, signal: AbortSignal): Promise<SourceItem[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: 5 }),
    signal,
  });

  if (!res.ok) {
    throw new SearchProviderError(`Serper returned ${res.status}`);
  }

  const data = (await res.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  return (data.organic ?? [])
    .filter((r): r is { title: string; link: string; snippet?: string } => !!r.link)
    .map((r) => ({
      source: "Web" as const,
      platform: "Web",
      title: r.title ?? "",
      url: r.link,
      profileUrl: null,
      snippet: r.snippet ?? "",
    }));
}

export function isWebSearchConfigured(): boolean {
  return !!process.env.SERPER_API_KEY;
}

/**
 * The one required source — if this fails outright (not just zero results),
 * the whole scan fails, unlike the optional YouTube/Instagram/TikTok sources.
 */
export async function discoverFromWeb(
  brand: string,
  domain: string,
  signal: AbortSignal,
  commercialIntentConcepts: string[] = []
): Promise<SourceItem[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new SearchProviderError("SERPER_API_KEY is not configured");
  }

  const provider = (process.env.SEARCH_PROVIDER || "serper").toLowerCase();
  if (provider !== "serper") {
    throw new SearchProviderError(`Unknown SEARCH_PROVIDER "${provider}"`);
  }

  const queries = buildSearchQueries(brand, domain, commercialIntentConcepts);
  return runSerperQueries(queries, apiKey, signal);
}

/**
 * Category-based fallback source — never throws. This runs when
 * competitor-based discovery is unavailable or too weak on its own, so a
 * failure here must degrade to no results rather than take down a scan that
 * would otherwise still complete honestly.
 */
export async function discoverCategoryFromWeb(
  category: string,
  keywords: string[],
  signal: AbortSignal,
  commercialIntentConcepts: string[] = []
): Promise<SourceItem[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  try {
    const queries = buildCategoryQueries(category, keywords, commercialIntentConcepts);
    return await runSerperQueries(queries, apiKey, signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return [];
  }
}
