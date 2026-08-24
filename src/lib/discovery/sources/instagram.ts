import { SourceItem } from "../types";
import { runApifyActor } from "../apify";

const DEFAULT_ACTOR_ID = "apify/instagram-hashtag-scraper";

interface InstagramItem {
  url?: string;
  caption?: string;
  ownerUsername?: string;
}

function toHashtag(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isInstagramConfigured(): boolean {
  return !!process.env.APIFY_API_TOKEN;
}

/** Optional source — unconfigured or failing is not fatal to the scan. */
export async function discoverFromInstagram(brand: string, signal: AbortSignal): Promise<SourceItem[]> {
  const token = process.env.APIFY_API_TOKEN;
  const hashtag = toHashtag(brand);
  if (!token || !hashtag) return [];

  const actorId = process.env.APIFY_INSTAGRAM_ACTOR_ID || DEFAULT_ACTOR_ID;

  try {
    const items = (await runApifyActor(
      actorId,
      { hashtags: [hashtag], resultsLimit: 5 },
      token,
      signal
    )) as InstagramItem[];

    return items
      .map((item): SourceItem | null => {
        const url = typeof item.url === "string" ? item.url : null;
        if (!url) return null;
        const username = typeof item.ownerUsername === "string" ? item.ownerUsername : null;
        const caption = typeof item.caption === "string" ? item.caption : "";
        return {
          source: "Instagram",
          platform: "Instagram",
          title: username ? `@${username}` : "Instagram post",
          url,
          profileUrl: username ? `https://instagram.com/${username}` : null,
          snippet: caption.slice(0, 300),
        };
      })
      .filter((x): x is SourceItem => x !== null);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return [];
  }
}
