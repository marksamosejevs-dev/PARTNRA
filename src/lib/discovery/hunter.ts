import { Candidate, ContactStatus } from "./types";

const SOCIAL_HOSTS = new Set([
  "youtube.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "linkedin.com",
  "pinterest.com",
]);

export function isHunterConfigured(): boolean {
  return !!process.env.HUNTER_API_KEY;
}

/** A creator's social profile isn't a business domain Hunter can search — only a genuine website/blog domain is eligible. */
function extractEligibleDomain(candidate: Candidate): string | null {
  if (!candidate.profileUrl) return null;
  try {
    const host = new URL(candidate.profileUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return SOCIAL_HOSTS.has(host) ? null : host;
  } catch {
    return null;
  }
}

interface HunterEnrichment {
  contact: string | null;
  contactStatus: ContactStatus;
}

/**
 * Only ever called for already-verified candidates (post-classification,
 * post-dedupe, capped to the final shortlist) -- never spend a Hunter credit
 * on a candidate that hasn't already cleared the evidence bar.
 */
export async function enrichContact(candidate: Candidate, signal: AbortSignal): Promise<HunterEnrichment> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return { contact: null, contactStatus: "not_attempted" };

  const domain = extractEligibleDomain(candidate);
  if (!domain || !candidate.name) return { contact: null, contactStatus: "not_attempted" };

  try {
    const url = new URL("https://api.hunter.io/v2/email-finder");
    url.searchParams.set("domain", domain);
    url.searchParams.set("full_name", candidate.name);
    url.searchParams.set("api_key", apiKey);

    const res = await fetch(url, { signal });
    if (!res.ok) return { contact: null, contactStatus: "not_found" };

    const data = (await res.json()) as { data?: { email?: string | null; score?: number } };
    const email = data.data?.email;
    const score = data.data?.score ?? 0;

    // Never fabricate or guess: only Hunter's own returned email counts, and
    // only above a confidence threshold it reports itself.
    if (email && score >= 50) {
      return { contact: email, contactStatus: "found" };
    }
    return { contact: null, contactStatus: "not_found" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { contact: null, contactStatus: "not_found" };
  }
}
