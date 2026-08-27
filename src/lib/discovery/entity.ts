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
 * A generic, non-exhaustive geography gazetteer -- broad commercial regions
 * (never a specific business/domain) plus enough individual countries to
 * tell "same country" (exact) apart from "same region, different country"
 * (regional) apart from "clearly elsewhere" (mismatch). Aliases are matched
 * as plain substrings against lowercased text padded with a leading/
 * trailing space, so a short alias like " uk " doesn't match inside an
 * unrelated word.
 */
type Region = "uk" | "eu" | "europe_other" | "us" | "canada" | "latam" | "mena" | "apac";

interface GeoAlias {
  country: string;
  region: Region;
  alias: string;
}

const GEO_ALIASES: GeoAlias[] = [
  { country: "uk", region: "uk", alias: "united kingdom" },
  { country: "uk", region: "uk", alias: "u.k." },
  { country: "uk", region: "uk", alias: " uk " },
  { country: "uk", region: "uk", alias: "britain" },
  { country: "uk", region: "uk", alias: "british" },
  { country: "uk", region: "uk", alias: "england" },
  { country: "uk", region: "uk", alias: "scotland" },
  { country: "uk", region: "uk", alias: "wales" },
  { country: "eu", region: "eu", alias: "european union" },
  { country: "eu", region: "eu", alias: " eu " },
  { country: "eu", region: "eu", alias: "europe" },
  { country: "eu", region: "eu", alias: "european" },
  { country: "germany", region: "eu", alias: "germany" },
  { country: "germany", region: "eu", alias: "german" },
  { country: "france", region: "eu", alias: "france" },
  { country: "france", region: "eu", alias: "french" },
  { country: "poland", region: "eu", alias: "poland" },
  { country: "poland", region: "eu", alias: "polish" },
  { country: "netherlands", region: "eu", alias: "netherlands" },
  { country: "netherlands", region: "eu", alias: "dutch" },
  { country: "spain", region: "eu", alias: "spain" },
  { country: "spain", region: "eu", alias: "spanish" },
  { country: "italy", region: "eu", alias: "italy" },
  { country: "italy", region: "eu", alias: "italian" },
  { country: "ireland", region: "eu", alias: "ireland" },
  { country: "ireland", region: "eu", alias: "irish" },
  { country: "sweden", region: "eu", alias: "sweden" },
  { country: "sweden", region: "eu", alias: "swedish" },
  { country: "denmark", region: "eu", alias: "denmark" },
  { country: "denmark", region: "eu", alias: "danish" },
  { country: "latvia", region: "eu", alias: "latvia" },
  { country: "latvia", region: "eu", alias: "latvian" },
  { country: "lithuania", region: "eu", alias: "lithuania" },
  { country: "lithuania", region: "eu", alias: "lithuanian" },
  { country: "estonia", region: "eu", alias: "estonia" },
  { country: "estonia", region: "eu", alias: "estonian" },
  { country: "baltics", region: "eu", alias: "baltics" },
  { country: "baltics", region: "eu", alias: "baltic states" },
  { country: "switzerland", region: "europe_other", alias: "switzerland" },
  { country: "switzerland", region: "europe_other", alias: "swiss" },
  { country: "norway", region: "europe_other", alias: "norway" },
  { country: "norway", region: "europe_other", alias: "norwegian" },
  { country: "us", region: "us", alias: "united states" },
  { country: "us", region: "us", alias: "u.s.a." },
  { country: "us", region: "us", alias: "u.s." },
  { country: "us", region: "us", alias: "usa" },
  { country: "us", region: "us", alias: "america" },
  { country: "us", region: "us", alias: "american" },
  { country: "canada", region: "canada", alias: "canada" },
  { country: "canada", region: "canada", alias: "canadian" },
  { country: "australia", region: "apac", alias: "australia" },
  { country: "australia", region: "apac", alias: "australian" },
  { country: "newzealand", region: "apac", alias: "new zealand" },
  { country: "indonesia", region: "apac", alias: "indonesia" },
  { country: "indonesia", region: "apac", alias: "indonesian" },
  { country: "vietnam", region: "apac", alias: "vietnam" },
  { country: "vietnam", region: "apac", alias: "vietnamese" },
  { country: "china", region: "apac", alias: "china" },
  { country: "china", region: "apac", alias: "chinese" },
  { country: "india", region: "apac", alias: "india" },
  { country: "india", region: "apac", alias: "indian" },
  { country: "japan", region: "apac", alias: "japan" },
  { country: "japan", region: "apac", alias: "japanese" },
  { country: "korea", region: "apac", alias: "korea" },
  { country: "korea", region: "apac", alias: "korean" },
  { country: "brazil", region: "latam", alias: "brazil" },
  { country: "brazil", region: "latam", alias: "brazilian" },
  { country: "mexico", region: "latam", alias: "mexico" },
  { country: "mexico", region: "latam", alias: "mexican" },
  { country: "latam", region: "latam", alias: "latin america" },
  { country: "uae", region: "mena", alias: "united arab emirates" },
  { country: "uae", region: "mena", alias: "uae" },
  { country: "uae", region: "mena", alias: "dubai" },
  { country: "mena", region: "mena", alias: "middle east" },
];

// UK/EU/other-Europe have enough real commercial/trade overlap (freight,
// import routes, shared regulatory language) to treat one as an adjacent
// (not mismatched) market for a business based in another -- still not an
// exact or regional match, but not a penalty-grade mismatch either.
const ADJACENT_REGIONS: Array<[Region, Region]> = [
  ["uk", "eu"],
  ["uk", "europe_other"],
  ["eu", "europe_other"],
];

function regionsAdjacent(a: Region, b: Region): boolean {
  return ADJACENT_REGIONS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

interface GeoMentions {
  countries: Set<string>;
  regions: Set<Region>;
}

function emptyGeoMentions(): GeoMentions {
  return { countries: new Set(), regions: new Set() };
}

function matchAliasesIn(text: string): GeoMentions {
  const padded = ` ${text.toLowerCase()} `;
  const mentions = emptyGeoMentions();
  for (const { country, region, alias } of GEO_ALIASES) {
    if (padded.includes(alias)) {
      mentions.countries.add(country);
      mentions.regions.add(region);
    }
  }
  return mentions;
}

// Phrases describing the entity's OWN location/presence -- a real
// operating signal, not merely reach. Matched with a forward window (the
// region name normally follows: "based in Germany", "authorized
// distributor in Poland") clipped at the next clause boundary so a
// following, unrelated clause's region ("...based in Indonesia, exporting
// to Europe") is never misread as this entity's own location.
const OPERATING_SIGNAL_PHRASES = [
  "based in", "headquartered in", "located in", "operates in", "operating in",
  "office in", "offices in", "warehouse in", "authorized dealer in",
  "authorized distributor in", "distributor for", "dealer for",
];
// Phrases describing REACH -- exporting/shipping/serving a market -- real
// evidence the entity can be USEFUL there, but not proof it operates
// there. Deliberately scored lower than an operating match everywhere this
// feeds in (see assessGeographicFit/GEO_FIT_WEIGHTS): "we export globally"
// should never outrank a candidate that actually operates in or near the
// target market.
const SERVING_SIGNAL_PHRASES = [
  "exports to", "export to", "exporting to", "ships to", "shipping to",
  "delivers to", "delivery to", "distributes to", "sells into", "sells to",
  "available in", "serves customers in", "serves clients in", "serves", "supplies",
];
// "UK-based" / "US audience" -- the region word comes BEFORE the signal
// word here, so these are captured separately rather than via a forward
// window.
const OPERATING_SUFFIX_PATTERN = /\b([a-z]+)-based\b/gi;
const AUDIENCE_SUFFIX_PATTERN = /\b([a-z]+(?:\s[a-z]+)?)\s+audience\b/gi;

/**
 * Clips a forward-looking window at whichever comes first: real
 * punctuation, or the start of an OPPOSITE-type signal phrase. Without the
 * second check, a punctuation-free run-on clause like "...distributor for
 * wood pellets is based in Germany and supplies buyers across the EU."
 * would let the "based in" operating window bleed straight into the
 * unrelated "supplies ... EU" reach-claim later in the same sentence,
 * wrongly reading it as this entity's own operating location too.
 */
function clauseWindow(rest: string, oppositeSignalPhrases: string[]): string {
  const punctBoundary = rest.search(/[.,;]/);
  let boundary = punctBoundary === -1 ? Infinity : punctBoundary;
  for (const phrase of oppositeSignalPhrases) {
    const idx = rest.indexOf(phrase);
    if (idx !== -1 && idx < boundary) boundary = idx;
  }
  return rest.slice(0, boundary === Infinity ? 40 : boundary);
}

function forwardSignalMentions(lowerText: string, phrases: string[], oppositeSignalPhrases: string[]): GeoMentions {
  const mentions = emptyGeoMentions();
  for (const phrase of phrases) {
    let idx = lowerText.indexOf(phrase);
    while (idx !== -1) {
      const start = idx + phrase.length;
      const rest = lowerText.slice(start, start + 80);
      const window = clauseWindow(rest, oppositeSignalPhrases);
      const found = matchAliasesIn(window);
      found.countries.forEach((c) => mentions.countries.add(c));
      found.regions.forEach((r) => mentions.regions.add(r));
      idx = lowerText.indexOf(phrase, start);
    }
  }
  return mentions;
}

function suffixSignalMentions(text: string): GeoMentions {
  const mentions = emptyGeoMentions();
  for (const pattern of [OPERATING_SUFFIX_PATTERN, AUDIENCE_SUFFIX_PATTERN]) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const found = matchAliasesIn(` ${match[1]} `);
      found.countries.forEach((c) => mentions.countries.add(c));
      found.regions.forEach((r) => mentions.regions.add(r));
    }
  }
  return mentions;
}

function splitGeoMentionsBySignal(text: string): { operating: GeoMentions; serving: GeoMentions } {
  const lower = text.toLowerCase();
  const operating = forwardSignalMentions(lower, OPERATING_SIGNAL_PHRASES, SERVING_SIGNAL_PHRASES);
  const suffixOperating = suffixSignalMentions(text);
  suffixOperating.countries.forEach((c) => operating.countries.add(c));
  suffixOperating.regions.forEach((r) => operating.regions.add(r));
  const serving = forwardSignalMentions(lower, SERVING_SIGNAL_PHRASES, OPERATING_SIGNAL_PHRASES);
  return { operating, serving };
}

function compareGeo(mentions: GeoMentions, target: GeoMentions): Exclude<GeographicFit, "global_relevant"> {
  if (mentions.countries.size === 0 && mentions.regions.size === 0) return "unknown";
  if (Array.from(mentions.countries).some((c) => target.countries.has(c))) return "exact";
  if (Array.from(mentions.regions).some((r) => target.regions.has(r))) return "regional";
  const isAdjacent = Array.from(mentions.regions).some((r) =>
    Array.from(target.regions).some((tr) => regionsAdjacent(r, tr))
  );
  return isAdjacent ? "adjacent" : "mismatch";
}

const GLOBAL_CLAIM_SIGNALS = /\b(worldwide|globally|international(?:ly)?|multiple countries|ships internationally)\b/i;

export type GeographicFit = "exact" | "regional" | "global_relevant" | "adjacent" | "mismatch" | "unknown";

/**
 * Compares a candidate's evidence text against the scanning business's own
 * stated market -- a real qualification signal, not just a small Fit
 * nudge (see GEO_FIT_WEIGHTS/computeFitScore and qualification.ts's
 * preview-eligibility check). Distinguishes the entity's OWN operating
 * location ("based in Germany", "UK-based", "UK audience") from a mere
 * reach/export claim ("exports to Europe"): a foreign manufacturer that
 * only claims to export to the target market is `global_relevant` at
 * best, never `exact`/`regional` -- it can never be read as though it
 * actually operates in or near the target market. A bare "worldwide"/
 * "international" claim with no evidence of actually reaching the SPECIFIC
 * target market is honestly `unknown`, not a free pass. `unknown` when
 * neither side's geography is confidently detectable at all -- this is a
 * real (small) qualification signal here, unlike the old, purely-neutral
 * market-fit bonus, since an entity with literally no stated geography is
 * genuinely less verifiable than one with a confirmed adjacent/regional
 * presence. Deliberately does NOT use the URL/domain TLD as a signal --
 * that's weak, not proof (a ".com" or ".co.uk" store can serve any
 * market) -- only real evidence-text language.
 */
export function assessGeographicFit(evidenceText: string, businessMarket: string | null): GeographicFit {
  if (!businessMarket) return "unknown";
  const target = matchAliasesIn(businessMarket);
  if (target.countries.size === 0 && target.regions.size === 0) return "unknown";

  const { operating, serving } = splitGeoMentionsBySignal(evidenceText);
  const operatingFit = compareGeo(operating, target);
  if (operatingFit === "exact" || operatingFit === "regional") return operatingFit;

  const servingFit = compareGeo(serving, target);
  const hasGlobalReachSignal = GLOBAL_CLAIM_SIGNALS.test(evidenceText) || serving.countries.size > 0 || serving.regions.size > 0;
  if (hasGlobalReachSignal && (servingFit === "exact" || servingFit === "regional" || servingFit === "adjacent")) {
    return "global_relevant";
  }

  if (operatingFit === "adjacent") return "adjacent";
  if (operatingFit === "mismatch") return "mismatch";

  // No operating-location evidence detected at all -- fall back to any
  // bare mention anywhere in the text (no "based in"/"exports to" context
  // at all). A bare mention never claims exact presence, only "regional"
  // at best -- it's the weakest signal available, not proof of a home base.
  const bareFit = compareGeo(matchAliasesIn(evidenceText), target);
  return bareFit === "exact" ? "regional" : bareFit;
}

export type GeoStrictness = "strict" | "moderate" | "flexible";

// Candidate roles whose commercial value is fundamentally audience-driven
// -- a creator/publisher/affiliate's own physical location says little
// about whether their AUDIENCE overlaps the target market. Geography is
// still real signal for these (an explicit "UK audience" statement is
// meaningful), just held to a lighter bar than a physical distributor or a
// regulated local service.
const AUDIENCE_DRIVEN_TYPES = new Set<CandidateType>([
  "Creator",
  "Affiliate",
  "Affiliate Network",
  "Publisher",
  "Review site",
  "Newsletter",
  "Coupon publisher",
  "Community",
]);
// Business-model language signaling a physical-goods/distribution business
// (import/export/wholesale/shipping/local delivery) -- generic keyword
// detection on the AI-generated Partner Intent Profile's own free-text
// businessModel field, never a per-industry or per-business hardcode.
const PHYSICAL_GOODS_BUSINESS_SIGNALS =
  /\b(wholesale|distribut(?:ion|or)|import(?:er|s)?|export(?:er|s)?|manufactur(?:er|ing)|shipping|logistics|warehouse|retail(?:er)?|physical product|goods|inventory|freight)\b/i;
// Regulated/local-service language -- law, accounting, healthcare, licensed
// trades -- where jurisdiction/location genuinely matters.
const LOCAL_SERVICE_BUSINESS_SIGNALS =
  /\b(law firm|legal services|attorneys?|accounting|tax advisory|licensed|regulated|healthcare|clinic|real estate|insurance broker)\b/i;

/**
 * How strictly geography should count for THIS scan -- derived from the
 * candidate's own role and the business's Partner Intent Profile
 * (businessModel), never hardcoded per industry/domain. A physical-goods
 * or regulated-local-service business needs geography to matter a lot; a
 * digital/audience-driven candidate (creator, affiliate, publisher) is
 * held to a lighter bar since its own location matters less than its
 * audience's.
 */
export function inferGeoStrictness(businessModel: string | null, candidateType: CandidateType | null): GeoStrictness {
  if (candidateType && AUDIENCE_DRIVEN_TYPES.has(candidateType)) return "flexible";
  if (businessModel && (PHYSICAL_GOODS_BUSINESS_SIGNALS.test(businessModel) || LOCAL_SERVICE_BUSINESS_SIGNALS.test(businessModel))) {
    return "strict";
  }
  return "moderate";
}

/**
 * Weights actually applied to Fit (see computeFitScore) -- also the single
 * source of truth qualification.ts's preview-fallback scoring reuses, so
 * geography is never scored twice with two different tables. `mismatch`'s
 * penalty is deliberately large enough that "a +15 keyword/category score"
 * can't overwhelm a clear geography mismatch, per a strict business's own
 * strictness tier; `unknown` carries a small penalty (not zero) since an
 * entity with literally no stated geography is less verifiable than one
 * with a confirmed adjacent/regional presence -- still far smaller than an
 * explicit mismatch, and never enough on its own to exclude a candidate.
 */
export const GEO_FIT_WEIGHTS: Record<GeoStrictness, Record<GeographicFit, number>> = {
  strict: { exact: 20, regional: 14, global_relevant: 6, adjacent: -4, unknown: -6, mismatch: -30 },
  moderate: { exact: 14, regional: 9, global_relevant: 5, adjacent: -2, unknown: -3, mismatch: -18 },
  flexible: { exact: 8, regional: 5, global_relevant: 4, adjacent: 0, unknown: -1, mismatch: -8 },
};

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
  /** See assessGeographicFit -- how well this evidence's geography fits the scanning business's own stated market. */
  geographicFit?: GeographicFit;
  /** The scanning business's own Partner Intent Profile businessModel text -- used only (together with `type`) to derive how strictly geography should count here, see inferGeoStrictness. */
  businessModel?: string | null;
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

  // Geographic fit -- a real qualification signal, not a small flat bonus:
  // weighted by how strictly THIS business/candidate combination should
  // care about geography (see inferGeoStrictness/GEO_FIT_WEIGHTS). A
  // physical-goods or regulated-local-service business is hit hard by a
  // clear mismatch; a digital/audience-driven candidate (creator,
  // affiliate, publisher) is held to a lighter bar.
  if (input.geographicFit) {
    const strictness = inferGeoStrictness(input.businessModel ?? null, input.type);
    score += GEO_FIT_WEIGHTS[strictness][input.geographicFit];
  }

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
