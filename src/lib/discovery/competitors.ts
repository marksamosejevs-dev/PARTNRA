/**
 * Resolves an AI-suggested competitor brand name to a real domain via a live
 * web search -- never trusts the model's suggestion blindly, and never
 * fabricates a domain. If no plausible official-site result is found, the
 * competitor is dropped rather than guessed.
 */

const EXCLUDED_HOSTS = new Set([
  "wikipedia.org",
  "en.wikipedia.org",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "amazon.com",
  "amazon.co.uk",
  "ebay.com",
  "google.com",
  "crunchbase.com",
  "bloomberg.com",
  "trustpilot.com",
]);

function isExcludedHost(hostname: string): boolean {
  if (EXCLUDED_HOSTS.has(hostname)) return true;
  return Array.from(EXCLUDED_HOSTS).some((h) => hostname.endsWith(`.${h}`));
}

export interface ResolvedCompetitor {
  name: string;
  domain: string;
  url: string;
}

/** Returns null on any failure or if no eligible result is found -- never throws, never fabricates. */
export async function resolveCompetitorDomain(
  name: string,
  signal: AbortSignal
): Promise<ResolvedCompetitor | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: `${name} official website`, num: 5 }),
      signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { organic?: Array<{ link?: string }> };
    const organic = Array.isArray(data.organic) ? data.organic : [];

    for (const result of organic) {
      if (typeof result.link !== "string") continue;
      let hostname: string;
      try {
        hostname = new URL(result.link).hostname.replace(/^www\./i, "").toLowerCase();
      } catch {
        continue;
      }
      if (isExcludedHost(hostname)) continue;
      return { name, domain: hostname, url: `https://${hostname}` };
    }
    return null;
  } catch {
    return null;
  }
}
