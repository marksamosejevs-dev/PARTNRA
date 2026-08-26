/**
 * The Partnership Graph's deterministic identity key for a brand/entity --
 * the registrable domain when known (the strongest, least ambiguous
 * identity: publisher.com/review, publisher.com/coupon and
 * publisher.com/affiliate must all resolve to ONE entity), else a
 * normalized-name fallback for the rare case a real domain isn't known
 * yet. Pure string normalization only -- never guesses a domain that
 * wasn't actually provided.
 */

export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const cleaned = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return cleaned || null;
}

export function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function graphIdentityKey(input: { domain?: string | null; name: string }): string {
  const domain = normalizeDomain(input.domain);
  return domain ?? `name:${normalizeNameKey(input.name)}`;
}
