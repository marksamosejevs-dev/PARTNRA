import { CandidateType, SignalStrength, SourceItem } from "./types";

/**
 * A search result is evidence; the entity it's evidence FOR is the site,
 * channel or company that published it -- not the page/video title. This
 * module resolves that entity deterministically from real signals (the
 * domain, or a provider-supplied authoritative name like a YouTube channel
 * title) rather than trusting an AI classifier's own free-text guess, which
 * tends to just copy the page title back ("Peptide Sciences Promo Code
 * August 2026 - 30% OFF" as the "partner name"). Applied uniformly to every
 * classification path (AI-classified and deterministic fallback alike) so
 * entity identity is consistent regardless of which path produced a result
 * -- which is also what makes cross-source, cross-strategy dedup by entity
 * (rather than by URL) actually work.
 */

function titleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Derives a human-readable entity name from a URL's domain alone -- honest about what we actually know (the domain), never inventing a "clean" brand name we can't verify. */
export function deriveEntityNameFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    const labels = hostname.split(".");
    // Drop the TLD (and a second-level country suffix like ".co.uk") to get
    // the registrable/brand label -- e.g. "hotdeals" from "hotdeals.com" or
    // "peptidestack" from "peptidestack.com".
    const knownSecondLevel = new Set(["co", "com", "org", "net", "gov", "ac"]);
    let labelsToKeep = labels;
    if (labels.length >= 3 && knownSecondLevel.has(labels[labels.length - 2])) {
      labelsToKeep = labels.slice(0, -2);
    } else if (labels.length >= 2) {
      labelsToKeep = labels.slice(0, -1);
    }
    const brandLabel = labelsToKeep[labelsToKeep.length - 1];
    if (!brandLabel) return hostname;
    return titleCaseFromSlug(brandLabel);
  } catch {
    return null;
  }
}

function rootUrlFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.replace(/^www\./i, "")}`;
  } catch {
    return null;
  }
}

const TYPE_KEYWORD_RULES: Array<{ type: CandidateType; test: RegExp }> = [
  { type: "Affiliate", test: /affiliate program|become an affiliate|partner program|advertiser sign[- ]?up|join our affiliate/i },
  { type: "Coupon publisher", test: /promo code|discount code|coupon|% off|deal(s)?\b/i },
  { type: "Newsletter", test: /newsletter|subscribe to our/i },
  { type: "Review site", test: /\breview(s)?\b|comparison|\bvs\.?\b|best .* (for|of)/i },
  { type: "Retailer", test: /\bshop\b|\bstore\b|buy now|add to cart/i },
  { type: "Distributor", test: /distributor|wholesale/i },
  { type: "Marketplace", test: /marketplace/i },
  { type: "Community", test: /\bforum\b|community|subreddit/i },
];

/**
 * Coarse, keyword/source-based partner-type classification -- never claims
 * a type it can't support from the actual title/snippet/source; falls back
 * to "Publisher" (a generic real-site bucket) or "Creator" (YouTube) rather
 * than a more specific claim it hasn't earned.
 */
export function classifyPartnerType(item: SourceItem): CandidateType {
  if (item.source === "YouTube") return "Creator";
  const text = `${item.title} ${item.snippet}`;
  for (const rule of TYPE_KEYWORD_RULES) {
    if (rule.test.test(text)) return rule.type;
  }
  return "Publisher";
}

/** An affiliate/partner program or advertiser signup page is itself an actionable next step -- more useful than a generic contact form. */
export function findApplicationUrl(item: SourceItem): string | null {
  const text = `${item.title} ${item.snippet} ${item.url}`;
  if (/affiliate program|become an affiliate|partner program|advertiser sign[- ]?up|\/affiliate|\/partners?\b|\/advertise/i.test(text)) {
    return item.url;
  }
  return null;
}

export interface ResolvedEntity {
  name: string | null;
  profileUrl: string | null;
  type: CandidateType;
  applicationUrl: string | null;
}

/**
 * Resolves the entity behind a source item: prefers a provider-supplied
 * authoritative name (e.g. a YouTube channel title) over a domain-derived
 * guess, and never falls back to the raw page title -- if neither a real
 * name nor a usable domain is available, name is null rather than guessed.
 */
export function resolveEntity(item: SourceItem): ResolvedEntity {
  const name = item.entityName ?? deriveEntityNameFromUrl(item.url);
  const profileUrl = item.profileUrl ?? rootUrlFromUrl(item.url);
  const type = classifyPartnerType(item);
  const applicationUrl = findApplicationUrl(item);
  return { name, profileUrl, type, applicationUrl };
}

const HIGH_VALUE_TYPES = new Set<CandidateType>(["Affiliate", "Creator", "Review site", "Distributor", "Reseller"]);
const LOW_VALUE_TYPES = new Set<CandidateType>(["Coupon publisher"]);

/**
 * A transparent, explainable weighted sum over real, already-known signals
 * -- not a black-box score. Distinct from evidence confidence (how sure we
 * are the relationship/evidence is real): fit is about how attractive this
 * entity is as a partner prospect *given* that evidence, so a Coupon
 * publisher and an Affiliate-infrastructure site with otherwise-identical
 * evidence strength do not rank the same.
 */
export function computeFitScore(input: {
  signalStrength: SignalStrength;
  verified: boolean;
  type: CandidateType | null;
  sourceCount: number;
  hasApplicationRoute: boolean;
}): number {
  const strengthBase: Record<SignalStrength, number> = { strong: 60, medium: 45, potential: 28 };
  let score = strengthBase[input.signalStrength];
  if (input.type && HIGH_VALUE_TYPES.has(input.type)) score += 15;
  else if (input.type && LOW_VALUE_TYPES.has(input.type)) score -= 10;
  score += input.verified ? 5 : 0;
  score += Math.min((input.sourceCount - 1) * 5, 15);
  score += input.hasApplicationRoute ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Plain-language evidence confidence, kept separate from the numeric Fit score -- how sure we are the evidence itself is real, not how good a prospect it makes. */
export function evidenceConfidenceLabel(signalStrength: SignalStrength, verified: boolean): "strong" | "medium" | "weak" {
  if (!verified) return "weak";
  return signalStrength === "strong" ? "strong" : "medium";
}
