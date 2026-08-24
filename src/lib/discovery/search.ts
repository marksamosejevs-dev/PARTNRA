import { SearchResult } from "./types";

export class SearchProviderError extends Error {}

async function searchSerper(query: string, apiKey: string, signal: AbortSignal): Promise<SearchResult[]> {
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
      title: r.title ?? "",
      url: r.link,
      snippet: r.snippet ?? "",
    }));
}

/**
 * Provider is deliberately swappable via SEARCH_PROVIDER — Serper is the
 * only one wired up today, but callers never need to know that.
 */
export async function searchWeb(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const provider = (process.env.SEARCH_PROVIDER || "serper").toLowerCase();
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    throw new SearchProviderError("SERPER_API_KEY is not configured");
  }

  switch (provider) {
    case "serper":
      return searchSerper(query, apiKey, signal);
    default:
      throw new SearchProviderError(`Unknown SEARCH_PROVIDER "${provider}"`);
  }
}

export function isSearchConfigured(): boolean {
  return !!process.env.SERPER_API_KEY;
}
