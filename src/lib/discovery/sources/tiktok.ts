import { SourceItem } from "../types";
import { runApifyActor } from "../apify";

const DEFAULT_ACTOR_ID = "clockworks/tiktok-scraper";

interface TikTokItem {
  webVideoUrl?: string;
  url?: string;
  text?: string;
  authorMeta?: { name?: string };
}

export function isTikTokConfigured(): boolean {
  return !!process.env.APIFY_API_TOKEN;
}

/** Optional source — unconfigured or failing is not fatal to the scan. */
export async function discoverFromTikTok(brand: string, signal: AbortSignal): Promise<SourceItem[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  const actorId = process.env.APIFY_TIKTOK_ACTOR_ID || DEFAULT_ACTOR_ID;

  try {
    const items = (await runApifyActor(
      actorId,
      { searchQueries: [brand], resultsPerPage: 5, searchSection: "/video" },
      token,
      signal
    )) as TikTokItem[];

    return items
      .map((item): SourceItem | null => {
        const url = typeof item.webVideoUrl === "string"
          ? item.webVideoUrl
          : typeof item.url === "string" ? item.url : null;
        if (!url) return null;
        const username = item.authorMeta && typeof item.authorMeta.name === "string"
          ? item.authorMeta.name
          : null;
        const text = typeof item.text === "string" ? item.text : "";
        return {
          source: "TikTok",
          platform: "TikTok",
          title: username ? `@${username}` : "TikTok video",
          url,
          profileUrl: username ? `https://www.tiktok.com/@${username}` : null,
          snippet: text.slice(0, 300),
        };
      })
      .filter((x): x is SourceItem => x !== null);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return [];
  }
}
