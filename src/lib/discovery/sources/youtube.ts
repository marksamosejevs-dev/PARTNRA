import { SourceItem } from "../types";
import { buildYoutubeQueries } from "../queries";

interface YoutubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
  };
}

async function searchYoutube(query: string, apiKey: string, signal: AbortSignal): Promise<SourceItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "5");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { signal });
  if (!res.ok) return [];

  const data = (await res.json()) as { items?: YoutubeSearchItem[] };
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item): SourceItem | null => {
      const videoId = item.id?.videoId;
      if (!videoId) return null;
      const snippet = item.snippet ?? {};
      return {
        source: "YouTube",
        platform: "YouTube",
        title: snippet.title ?? "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        profileUrl: snippet.channelId
          ? `https://www.youtube.com/channel/${snippet.channelId}`
          : null,
        snippet: (snippet.description ?? "").slice(0, 300),
      };
    })
    .filter((x): x is SourceItem => x !== null);
}

export function isYoutubeConfigured(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}

/** Optional source — unconfigured or failing is not fatal to the scan. */
export async function discoverFromYoutube(brand: string, signal: AbortSignal): Promise<SourceItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    const queries = buildYoutubeQueries(brand);
    const batches = await Promise.all(queries.map((q) => searchYoutube(q, apiKey, signal)));
    return batches.flat();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return [];
  }
}
