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

/**
 * Title phrasing that indicates the page itself IS an application/signup
 * route -- not that the page merely discusses one. Deliberately excludes
 * bare "sign in"/"login" (that presupposes an existing account, it isn't a
 * new-application entry point) and requires an actual apply/join/register/
 * signup/become verb alongside the program noun, so a review that happens
 * to say "...and their affiliate partner program..." in passing doesn't
 * qualify -- only a page whose own declared subject is the application.
 */
const APPLICATION_TITLE_PATTERNS: RegExp[] = [
  /\baffiliate (program|sign[- ]?up|application|registration)\b/i,
  /\bbecome an affiliate\b/i,
  /\bjoin (our|the) affiliate\b/i,
  /\bpartner (program|application)\b/i,
  /\bbecome a partner\b/i,
  /\badvertiser (sign[- ]?up|registration|application)\b/i,
  /\bmerchant (sign[- ]?up|registration|application)\b/i,
  /\bcreator (application|program sign[- ]?up)\b/i,
  /\breseller (application|program)\b/i,
  /\bdistributor (application|program)\b/i,
  /\bbecome a (reseller|distributor)\b/i,
];

/**
 * URL path segments that structurally identify a signup/application page --
 * matched as a WHOLE path segment (split on "/"), never a substring, so
 * "/affiliate-marketing-tips-for-beginners" or "/reviews/our-partners"
 * don't false-positive just because they contain "affiliate" or "partners"
 * somewhere in a longer slug.
 */
const APPLICATION_PATH_SLUGS = new Set([
  "affiliate", "affiliates", "affiliate-program", "become-an-affiliate",
  "affiliate-signup", "affiliate-sign-up", "affiliate-application", "affiliate-registration",
  "partner", "partners", "partner-program", "partner-application", "become-a-partner",
  "apply", "application", "applications",
  "signup", "sign-up", "register", "registration",
  "advertise", "advertisers", "advertiser-signup", "advertiser-registration",
  "merchant", "merchants", "merchant-signup", "merchant-registration",
  "reseller", "resellers", "reseller-application", "reseller-program",
  "distributor", "distributors", "distributor-application", "distributor-program",
  "creator-application", "creator-signup",
]);

function hasApplicationPathSlug(url: string): boolean {
  try {
    const segments = new URL(url).pathname.toLowerCase().split("/").filter(Boolean);
    return segments.some((segment) => APPLICATION_PATH_SLUGS.has(segment));
  } catch {
    return false;
  }
}

/**
 * An affiliate/partner/advertiser/merchant/creator/reseller signup or
 * application page is itself an actionable next step -- more useful than a
 * generic contact form. Only awarded when the page's OWN title declares
 * itself as that application route, or its URL path is structurally one
 * (e.g. /affiliate-program, /become-an-affiliate) -- never from snippet/
 * body text alone, since a review or article merely *mentioning* a brand's
 * affiliate program in passing is not itself an application route. When
 * uncertain, this returns null rather than guessing.
 */
/** A page titled e.g. "Affiliate Program - Sign In" still names an existing-account login, not a new application, even though "affiliate program" also appears in the title -- this exclusion wins over any positive title match. */
const SIGN_IN_TITLE_PATTERN = /\bsign[- ]?in\b|\blog[- ]?in\b/i;

export function findApplicationUrl(item: SourceItem): string | null {
  if (SIGN_IN_TITLE_PATTERN.test(item.title)) return null;
  const titleIsApplicationPage = APPLICATION_TITLE_PATTERNS.some((pattern) => pattern.test(item.title));
  if (titleIsApplicationPage || hasApplicationPathSlug(item.url)) {
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
