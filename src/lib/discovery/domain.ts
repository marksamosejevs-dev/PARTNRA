const PRIVATE_HOSTNAME_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/i;

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "::1" || lower === "[::1]") return true;
  if (PRIVATE_HOSTNAME_RE.test(lower)) return true;
  const rfc1918 = lower.match(/^172\.(\d{1,3})\./);
  if (rfc1918) {
    const second = Number(rfc1918[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Normalizes a user-supplied competitor URL and rejects anything that isn't a
 * plausible public http(s) hostname. We never fetch this URL server-side
 * ourselves (evidence links open client-side), but we still refuse private/
 * internal targets before they end up embedded in search queries or logs.
 */
export function normalizeCompetitorUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  if (isPrivateHostname(url.hostname)) return null;

  return url;
}

/** Best-effort brand name guess from a domain, e.g. "nutra-labs.co.uk" -> "Nutra Labs". */
export function deriveBrandName(hostname: string): string {
  const withoutWww = hostname.replace(/^www\./i, "");
  const firstLabel = withoutWww.split(".")[0] ?? withoutWww;
  return firstLabel
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
