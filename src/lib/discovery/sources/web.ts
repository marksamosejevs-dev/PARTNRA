import { SourceItem } from "../types";
import { buildSearchQueries } from "../queries";

export class SearchProviderError extends Error {}

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
export async function discoverFromWeb(brand: string, domain: string, signal: AbortSignal): Promise<SourceItem[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new SearchProviderError("SERPER_API_KEY is not configured");
  }

  const provider = (process.env.SEARCH_PROVIDER || "serper").toLowerCase();
  if (provider !== "serper") {
    throw new SearchProviderError(`Unknown SEARCH_PROVIDER "${provider}"`);
  }

  const queries = buildSearchQueries(brand, domain);
  const settled = await Promise.allSettled(queries.map((q) => searchSerper(q, apiKey, signal)));

  if (settled.every((outcome) => outcome.status === "rejected")) {
    throw new SearchProviderError("All Serper queries failed");
  }

  return settled.flatMap((outcome) => (outcome.status === "fulfilled" ? outcome.value : []));
}
