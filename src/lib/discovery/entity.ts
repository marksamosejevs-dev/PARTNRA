import { CandidateType, NON_PARTNER_TYPES, RelationshipDirection, SignalStrength, SourceItem } from "./types";

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

/**
 * Ordered so a more specific/higher-signal rule wins when text matches
 * more than one (e.g. "affiliate program for our distributors" should read
 * as Affiliate before Distributor). Content-based only -- deliberately
 * NEVER keyed on `item.source`/`item.platform`: which platform surfaced
 * this evidence says nothing about what the entity behind it commercially
 * is. A law firm's own YouTube video is still evidence of a law firm.
 */
const TYPE_KEYWORD_RULES: Array<{ type: CandidateType; test: RegExp }> = [
  { type: "Professional services firm", test: /\b(law firm|legal services|attorneys?|advocates?|law offices?|solicitors?|llp)\b|\b(tax advis(?:er|or)s?|chartered accountants?|audit firm|accounting firm|compliance consultanc(?:y|ies)|corporate services? provider)\b/i },
  { type: "Affiliate Network", test: /affiliate network|performance marketing network|cpa network/i },
  { type: "Affiliate", test: /affiliate program|become an affiliate|partner program|advertiser sign[- ]?up|join our affiliate/i },
  { type: "Coupon publisher", test: /promo code|discount code|coupon|% off|deal(s)?\b/i },
  // Checked BEFORE Wholesaler/Importer/Distributor below: a sourcing
  // platform's own page routinely mentions "buyers", "importers" and
  // "wholesalers" as the THIRD PARTIES using it (e.g. "buy requests from
  // ENplus pellet buyers, importers and wholesalers") -- that incidental
  // mention shouldn't make the platform ITSELF a Wholesaler/Importer; the
  // explicit marketplace/buy-request/sourcing-platform language is the
  // stronger, more specific signal of what the entity actually is.
  { type: "Marketplace", test: /marketplace|\bbuy request(?:s)?\b|\bbuyer(?:s)? directory\b|b2b sourcing platform/i },
  { type: "Wholesaler", test: /wholesale(r)?/i },
  { type: "Importer", test: /\bimporter\b|import(?:s|ed)? (?:from|of)\b/i },
  { type: "Distributor", test: /distributor/i },
  { type: "Trader", test: /\btrader\b|commodity trading/i },
  { type: "Reseller", test: /\breseller\b/i },
  { type: "Commercial buyer", test: /\b(procurement|sourcing|bulk buyer|purchasing department|request a quote|rfq)\b/i },
  { type: "Referral partner", test: /\breferral partner\b|refer (?:a )?client|client referral/i },
];

/**
 * Softer, more ambiguous signals -- "review", "shop"/"store", "newsletter",
 * "community" -- that a single creator's own video/post can trigger
 * incidentally ("my honest review", "link in my shop") without that making
 * the CREATOR a "Review site"/"Retailer"/etc business. Checked only AFTER
 * the Creator-native-platform check below, so an individual's own channel
 * on YouTube/Instagram/TikTok is read as a Creator first; a real
 * review-website/newsletter/retailer/community found on the open web (or
 * whose name reads as a company) still gets these types normally, since
 * the Creator check only fires for creator-native platforms in the first
 * place.
 */
const AMBIGUOUS_KEYWORD_RULES: Array<{ type: CandidateType; test: RegExp }> = [
  { type: "Review site", test: /\breview(s)?\b|comparison|\bvs\.?\b|best .{0,40}\b(for|of)\b/i },
  { type: "Newsletter", test: /newsletter|subscribe to our/i },
  { type: "Retailer", test: /\bshop\b|\bstore\b|buy now|add to cart/i },
  { type: "Community", test: /\bforum\b|community|subreddit/i },
];

/** A platform, not a commercial entity in itself -- resolving an entity name from the host alone (e.g. "Linkedin") would fabricate a fake "partner". Only usable as evidence when the provider supplied a real entityName for whoever posted there. */
const NON_ENTITY_PLATFORM_HOSTS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "medium.com",
  "wikipedia.org",
  "en.wikipedia.org",
  "facebook.com",
  "pinterest.com",
  "quora.com",
  // A YouTube/Instagram/TikTok URL discovered through the YouTube provider
  // (source==="YouTube") always carries a real entityName (the channel
  // title, see sources/youtube.ts) and so never hits this exclusion --
  // this specifically catches the same URL surfacing through a DIFFERENT
  // path (e.g. Serper's generic web search indexing a youtube.com result,
  // source==="Web", no entityName), where deriving a name from the domain
  // alone would fabricate the platform itself ("Youtube") as a fake
  // partner entity.
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "google.com",
]);

function isNonEntityPlatformHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  return Array.from(NON_ENTITY_PLATFORM_HOSTS).some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * A directory/ranking/profile page describes OTHER named entities, not
 * the resolved entity's own commercial activity -- a page titled "Clifford
 * Chance lawyer profile" resolves an entity from the page's OWN domain
 * (e.g. legal500.com), but the professional-services keywords in that
 * text describe Clifford Chance, not Legal500. Generic (not tied to any
 * one industry's directory site) so it applies wherever this pattern
 * shows up, not just legal directories.
 */
const DIRECTORY_OR_PROFILE_SIGNALS =
  /\b(directory|rankings?|ranked|find a lawyer|find a firm|browse (?:law firms|lawyers|attorneys|firms)|firm profile|lawyer profile|attorney profile|company profile)\b/i;

/**
 * An institutional/research/regulatory publisher (a national health
 * institute, a peer-reviewed journal, a government agency) can be genuine,
 * useful evidence that a category/compound/technology is real and
 * commercially discussed -- it is never itself a recruitable commercial
 * partner. Generic role-logic, not a named-institution denylist: a `.gov`
 * (or equivalent government) domain, or peer-reviewed/clinical-research
 * language wherever it's hosted, both mean the same thing regardless of
 * which specific agency or journal it is.
 */
const INSTITUTIONAL_SOURCE_SIGNALS =
  /\b(peer[- ]reviewed|clinical trial(?:s)?|systematic review|meta-analysis|randomized controlled trial|cochrane review|published in the journal|national institutes? of health|regulatory (?:agency|authority|body)|government agency|official statistics)\b/i;

function isInstitutionalHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  const govLikeTlds = [".gov", ".gov.uk", ".gc.ca", ".govt.nz", ".gov.au"];
  if (govLikeTlds.some((tld) => host.endsWith(tld))) return true;
  // A small set of major research-database/health-authority domains whose
  // OWN hosting of a page (rather than content elsewhere merely mentioning
  // them) makes that page institutional evidence -- these are database
  // platforms, not commercial entities under any TLD pattern.
  const researchDatabaseHosts = new Set(["nih.gov", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "who.int", "clinicaltrials.gov"]);
  return Array.from(researchDatabaseHosts).some((h) => host === h || host.endsWith(`.${h}`));
}

/** A PDF/document URL is evidence, not a commercial entity to resolve a partner from. */
function isDocumentUrl(url: string): boolean {
  try {
    return /\.(pdf|docx?|xlsx?|pptx?)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Company-ish name signals (legal-entity suffixes, professional-services
 * words, obviously corporate/geographic branding) used to tell an
 * individual creator's channel apart from a company's own channel on the
 * same creator-native platform -- content-based, not platform-based.
 */
const COMPANY_NAME_PATTERN =
  /\b(law|legal|attorneys?|advocates?|llp|llc|gmbh|ltd\.?|inc\.?|corp\.?|co\.?|partners|group|associates|solutions|technologies|systems|international|worldwide|holdings)\b/i;

/**
 * Platforms whose native content is typically an individual's own channel
 * (a person publishing under their own identity) rather than a company's
 * official presence -- used only as one input alongside the resolved
 * entity name's shape, never on its own, to decide Creator vs. a company
 * that merely also has a channel there.
 */
const CREATOR_NATIVE_SOURCES = new Set(["YouTube", "Instagram", "TikTok"]);

/**
 * Resolves the entity's commercial role from real content/structure --
 * never from which source platform surfaced it (see the module doc and
 * types.ts's CandidateType comment: `source`/`platform` is WHERE, `type`
 * is WHAT). A law firm's YouTube video is still a law firm; an
 * independent reviewer's YouTube video is still a Creator -- the
 * difference is read from the entity's own name/content, not the
 * platform. Never claims a type it can't support from the actual
 * evidence; falls back to "Evidence source" for a platform post/document
 * with no resolvable entity identity, or "Publisher" (a generic real-site
 * bucket) otherwise.
 */
export function classifyPartnerType(item: SourceItem): CandidateType {
  let hostname: string | null = null;
  try {
    hostname = new URL(item.url).hostname;
  } catch {
    hostname = null;
  }

  if (isDocumentUrl(item.url)) return "Evidence source";
  if (hostname && isNonEntityPlatformHost(hostname) && !item.entityName) return "Evidence source";

  const text = `${item.title} ${item.snippet}`;

  // A government/research-database host, or peer-reviewed/clinical-research
  // language wherever it appears, describes institutional/scientific
  // evidence -- real and useful for understanding a category, but never
  // itself an independent commercial partner. Checked before the keyword
  // rules below so shared topical/technical vocabulary (the same compound,
  // molecule, or scientific term this business's category also uses)
  // can't promote a research institute into e.g. "Review site".
  if ((hostname && isInstitutionalHost(hostname)) || INSTITUTIONAL_SOURCE_SIGNALS.test(text)) {
    return "Evidence source";
  }

  // A directory/ranking/profile page's professional-services (or other
  // role) keywords describe the THIRD PARTY it profiles, not the
  // directory's own commercial activity -- checked before the keyword
  // rules below so "Clifford Chance lawyer profile" doesn't make the
  // resolved entity (the directory site itself) a "Professional services
  // firm" just because the text it hosts is about one.
  if (DIRECTORY_OR_PROFILE_SIGNALS.test(text)) return "Evidence source";

  // Strong, specific commercial-role signals win regardless of platform --
  // checked FIRST so e.g. a law firm's own YouTube video is never
  // miscategorized just because it's on a creator-native platform.
  for (const rule of TYPE_KEYWORD_RULES) {
    if (rule.test.test(text)) return rule.type;
  }

  // On a creator-native platform, an individual's own channel (name doesn't
  // read as a company) is a Creator -- checked BEFORE the softer, more
  // ambiguous rules below, since "review"/"shop"/"newsletter"-type words
  // show up incidentally in a huge share of ordinary creator content
  // without that making the creator a distinct review-site/retailer/
  // newsletter business.
  if (
    CREATOR_NATIVE_SOURCES.has(item.source) &&
    item.entityName &&
    !COMPANY_NAME_PATTERN.test(item.entityName)
  ) {
    return "Creator";
  }

  for (const rule of AMBIGUOUS_KEYWORD_RULES) {
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

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolves the entity behind a source item: prefers a provider-supplied
 * authoritative name (e.g. a YouTube channel title) over a domain-derived
 * guess, and never falls back to the raw page title. Deriving a name from
 * the domain is only valid when the domain IS the entity (a real business's
 * own site) -- for a platform host (linkedin.com, a PDF/document, etc.)
 * with no provider-supplied entityName, deriving "Linkedin" as the "entity"
 * would fabricate a fake partner out of the platform itself, so name and
 * profileUrl stay null and applicationUrl is never set from platform-hosted
 * evidence either -- an "Apply" button should never point at someone's
 * LinkedIn post.
 */
export function resolveEntity(item: SourceItem): ResolvedEntity {
  const hostname = hostnameOf(item.url);
  const isNonEntityEvidence =
    isDocumentUrl(item.url) || (!!hostname && isNonEntityPlatformHost(hostname) && !item.entityName);

  const name = item.entityName ?? (isNonEntityEvidence ? null : deriveEntityNameFromUrl(item.url));
  const profileUrl = item.profileUrl ?? (isNonEntityEvidence ? null : rootUrlFromUrl(item.url));
  const type = classifyPartnerType(item);
  const applicationUrl = isNonEntityEvidence ? null : findApplicationUrl(item);
  return { name, profileUrl, type, applicationUrl };
}

const HIGH_VALUE_TYPES = new Set<CandidateType>([
  "Affiliate",
  "Affiliate Network",
  "Creator",
  "Review site",
  "Distributor",
  "Wholesaler",
  "Importer",
  "Reseller",
  "Trader",
  "Marketplace",
  "Commercial buyer",
  "Referral partner",
  "Professional services firm",
]);
const LOW_VALUE_TYPES = new Set<CandidateType>(["Coupon publisher"]);

/**
 * A transparent, explainable weighted sum over real, already-known signals
 * -- not a black-box score. Distinct from evidence confidence (how sure we
 * are the relationship/evidence is real): fit is about how attractive this
 * entity is as a partner prospect *given* that evidence, so a Coupon
 * publisher and an Affiliate-infrastructure site with otherwise-identical
 * evidence strength do not rank the same.
 *
 * `prioritizedTypes`/`deprioritizedTypes` are this specific business's
 * Partner Intent Profile (see business.ts) -- generated dynamically per
 * scan, never hardcoded per industry. The same "Creator" type is worth
 * more for a DTC supplement brand than for an industrial B2B wholesaler;
 * this is where that difference actually changes the ranking, without any
 * per-domain branching in code.
 */
const SELF_PROMOTION_OR_DOCUMENTATION_DIRECTIONS = new Set<RelationshipDirection>([
  "operates_affiliate_program",
  "recruits_affiliates",
  "publishes_about",
]);
const CHANNEL_FIT_DIRECTIONS = new Set<RelationshipDirection>([
  "accepts_referrals_from",
  "refers_clients_to",
  "distributes_brand",
  "buys_product",
]);

/**
 * A lightweight, generic region-alias lookup -- not exhaustive geopolitics,
 * just enough to tell whether a business's own stated market and a
 * candidate's evidence text are talking about the same, an adjacent, or a
 * clearly different geography. Grouped by broad market names rather than
 * every individual country, and deliberately small: the goal is "does this
 * evidence's geography plausibly serve this business's market", not a
 * precise geopolitical classifier.
 */
const REGION_ALIASES: Record<string, string[]> = {
  "united states": ["united states", "u.s.a.", "u.s.", "usa", "america", "american", "stateside"],
  canada: ["canada", "canadian"],
  "united kingdom": ["united kingdom", "u.k.", " uk ", "britain", "british", "england", "scotland", "wales"],
  "european union": ["european union", " eu ", "europe", "european"],
  australia: ["australia", "australian"],
  "new zealand": ["new zealand"],
};
const GLOBAL_MARKET_SIGNALS = /\b(worldwide|globally|international(?:ly)?|multiple countries|ships internationally)\b/i;
// UK and EU markets have enough real commercial/trade overlap (freight,
// import routes, shared regulatory language) to treat evidence from one as
// an adjacent (not mismatched) market for a business based in the other --
// still not an exact match, but not a penalty either.
const ADJACENT_REGION_PAIRS: Array<[string, string]> = [["united kingdom", "european union"]];

function detectRegions(text: string): Set<string> {
  const padded = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const [region, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some((alias) => padded.includes(alias))) found.add(region);
  }
  return found;
}

export type MarketFit = "exact" | "global" | "adjacent" | "mismatch" | "unknown";

/**
 * "unknown" (never a penalty) whenever either side's geography isn't
 * confidently detectable -- this must never exclude a globally useful
 * entity just because neither the business's own market nor a candidate's
 * evidence text happened to name a region explicitly. Only an explicit,
 * clearly DIFFERENT (and non-adjacent) region on both sides is a real
 * mismatch -- e.g. a business whose stated market is the EU/UK, given
 * evidence that explicitly describes a US-only distribution footprint.
 */
export function assessMarketFit(evidenceText: string, businessMarket: string | null): MarketFit {
  if (!businessMarket) return "unknown";
  const businessRegions = detectRegions(businessMarket);
  if (businessRegions.size === 0) return "unknown";
  if (GLOBAL_MARKET_SIGNALS.test(evidenceText)) return "global";
  const evidenceRegions = detectRegions(evidenceText);
  if (evidenceRegions.size === 0) return "unknown";
  if (Array.from(evidenceRegions).some((r) => businessRegions.has(r))) return "exact";
  const isAdjacent = ADJACENT_REGION_PAIRS.some(
    ([a, b]) => (businessRegions.has(a) && evidenceRegions.has(b)) || (businessRegions.has(b) && evidenceRegions.has(a))
  );
  return isAdjacent ? "adjacent" : "mismatch";
}

export function computeFitScore(input: {
  signalStrength: SignalStrength;
  verified: boolean;
  type: CandidateType | null;
  sourceCount: number;
  hasApplicationRoute: boolean;
  prioritizedTypes?: ReadonlySet<CandidateType>;
  deprioritizedTypes?: ReadonlySet<CandidateType>;
  /**
   * "This company HAS partners" and "this company CAN BE MY partner" are
   * different claims -- see relationshipDirection.ts. A candidate should
   * not score well merely because category keywords and an application
   * page were found; the direction of the relationship the evidence
   * actually shows is a meaningful input to Fit, not just to the label.
   */
  relationshipDirection?: RelationshipDirection;
  /**
   * False when there's essentially no real title/snippet text behind
   * this candidate (e.g. a bare channel name with no description) --
   * category/type/strength signals alone shouldn't buy a normal Fit
   * score when there's nothing substantive backing them. Defaults true
   * so existing callers/tests that don't pass it are unaffected.
   */
  hasSufficientEvidence?: boolean;
  /**
   * How well this evidence's geography fits the scanning business's own
   * stated market -- see assessMarketFit. "unknown" (the default) is
   * neutral, never a penalty; only an explicit, clearly different and
   * non-adjacent geography reduces Fit.
   */
  marketFit?: MarketFit;
}): number {
  const strengthBase: Record<SignalStrength, number> = { strong: 60, medium: 45, potential: 28 };
  let score = strengthBase[input.signalStrength];
  if (input.type && HIGH_VALUE_TYPES.has(input.type)) score += 15;
  else if (input.type && LOW_VALUE_TYPES.has(input.type)) score -= 10;
  if (input.type && input.prioritizedTypes?.has(input.type)) score += 12;
  if (input.type && input.deprioritizedTypes?.has(input.type)) score -= 12;
  score += input.verified ? 5 : 0;
  score += Math.min((input.sourceCount - 1) * 5, 15);
  score += input.hasApplicationRoute ? 10 : 0;

  if (input.relationshipDirection === "supplies_product") score -= 12;
  else if (input.relationshipDirection && CHANNEL_FIT_DIRECTIONS.has(input.relationshipDirection)) score += 10;

  // Market/geography fit -- "unknown" (the default) never penalizes, so a
  // globally useful entity is never excluded merely for not naming a
  // region. Only an explicit, clearly different and non-adjacent geography
  // (e.g. a US-only distribution footprint for a business whose stated
  // market is the EU/UK) meaningfully reduces Fit.
  if (input.marketFit === "exact") score += 8;
  else if (input.marketFit === "global") score += 4;
  else if (input.marketFit === "mismatch") score -= 15;

  // Competitor-owned infrastructure, a directly comparable business, a
  // non-entity evidence source (see NON_PARTNER_TYPES), or evidence that
  // the entity merely operates its OWN program / documents someone
  // else's is never a normal "Potential Partner" opportunity, however
  // strong its raw evidence looks -- this is a defense-in-depth cap, not
  // the primary mechanism (route.ts excludes NON_PARTNER_TYPES from the
  // Potential Partners list outright, and relationshipDirection.ts's
  // applyRelationshipDirection retypes self-promotion/documentation
  // evidence into one of those types; this just keeps the number honest
  // wherever it's read before or independent of that retyping).
  if (input.type && NON_PARTNER_TYPES.has(input.type)) score = Math.min(score, 20);
  if (input.relationshipDirection && SELF_PROMOTION_OR_DOCUMENTATION_DIRECTIONS.has(input.relationshipDirection)) {
    score = Math.min(score, 20);
  }

  // A candidate with essentially no real evidence text shouldn't claim
  // strong commercial relevance just because its category/type/strength
  // signals look plausible -- capped, not zeroed, so a genuinely good
  // company with thin evidence still surfaces as a low-confidence lead
  // rather than fabricating confidence it hasn't earned.
  if (input.hasSufficientEvidence === false) score = Math.min(score, 40);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Plain-language evidence confidence, kept separate from the numeric Fit score -- how sure we are the evidence itself is real, not how good a prospect it makes. */
export function evidenceConfidenceLabel(
  signalStrength: SignalStrength,
  verified: boolean,
  hasSufficientEvidence: boolean = true
): "strong" | "medium" | "weak" {
  // No real evidence text behind the candidate is weak evidence by
  // definition, whatever a model or keyword match otherwise concluded.
  if (!verified || !hasSufficientEvidence) return "weak";
  return signalStrength === "strong" ? "strong" : "medium";
}

export function isSameRegistrableDomain(hostname: string, rootDomain: string): boolean {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  const r = rootDomain.replace(/^www\./i, "").toLowerCase();
  return h === r || h.endsWith(`.${r}`);
}

function normalizedBrandToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Detects a competitor's OWN affiliate/partner infrastructure -- distinct
 * from an independent third party that merely promotes the competitor.
 * "Bet365 Partners" tells you bet365 operates an affiliate program (real,
 * valuable competitor intelligence); it is not itself a recruitable
 * partner for a different business, since the user can't sign THEIR
 * business up for a competitor's own program.
 *
 * Two signals, either sufficient on its own:
 * 1. The resolved entity's domain is the competitor's own domain or a
 *    subdomain of it (e.g. partners.bet365.com) -- proves ownership
 *    regardless of page content.
 * 2. The resolved entity's name starts with the competitor's own brand
 *    name AND the page reads as an official application/signup page (see
 *    findApplicationUrl) -- covers a competitor's program hosted on a
 *    separately branded domain (e.g. "bet365partners.com"), which domain
 *    matching alone can't catch.
 *
 * Generic and parameterized by whichever competitor this scan actually
 * resolved -- never a hardcoded brand/domain. Reclassifies the item's
 * `type` to "Competitor affiliate program" (see NON_PARTNER_TYPES) rather
 * than removing it outright, so it's still visible as competitor
 * intelligence, just never as an independent, recruitable partner; its
 * applicationUrl is cleared (it's the competitor's own signup, not one the
 * user could use) and fitScore is capped low.
 */
export function flagCompetitorOwnedInfrastructure<
  T extends {
    name: string | null;
    profileUrl: string | null;
    sourceUrl: string;
    type: CandidateType | null;
    applicationUrl: string | null;
    fitScore: number;
  },
>(items: T[], competitor: { name: string; domain: string }): T[] {
  const competitorToken = normalizedBrandToken(competitor.name);

  return items.map((item) => {
    const candidateHostname = hostnameOf(item.profileUrl ?? item.sourceUrl);
    const isOwnDomain = !!candidateHostname && isSameRegistrableDomain(candidateHostname, competitor.domain);

    const entityToken = item.name ? normalizedBrandToken(item.name) : "";
    const isBrandedInfra =
      !isOwnDomain && competitorToken.length > 2 && entityToken.startsWith(competitorToken) && !!item.applicationUrl;

    if (!isOwnDomain && !isBrandedInfra) return item;

    return {
      ...item,
      type: "Competitor affiliate program" as CandidateType,
      applicationUrl: null,
      fitScore: Math.min(item.fitScore, 20),
    };
  });
}
