import { CandidateType, RelationshipDirection, SourceItem } from "./types";

/**
 * "This company HAS partners" and "this company CAN BE MY partner" are
 * different claims. A peptide brand's own affiliate page proves it
 * recruits affiliates for ITSELF, not that it performs the Affiliate role
 * for someone else; a directory/software page that documents a
 * competitor's program proves that program exists, not that the page's
 * own publisher is a recruitable partner. This module detects the
 * direction the evidence actually supports, purely from real text
 * signals -- never a guess about intent that the text doesn't show.
 */

function normalizedToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// First-person language describing a program as the entity's OWN, not a
// third party's -- "our affiliate program", "we offer a referral program".
const SELF_PROGRAM_LANGUAGE =
  /\b(our|we offer|we provide|we run|we're pleased to offer|we are pleased to offer)\b.{0,40}\b(affiliate|referral|partner)\b.{0,20}\bprogram\b/i;

// A page's own title naming just "[Brand] Affiliate/Referral/Partner
// Program" -- no "our"/"we" needed, since a program's own landing page
// almost always titles itself this way ("Purity Peptides Affiliate
// Program") rather than writing a full sentence. Real third-party
// coverage of a program almost always adds an explainer/comparison word
// ("review", "guide", "best X programs compared") -- exempted below via
// THIRD_PARTY_EXPLAINER_LANGUAGE, so a genuine roundup/review title isn't
// mistaken for the program's own page.
const BARE_PROGRAM_TITLE = /\b(affiliate|referral|partner)\s+programs?\b/i;
const THIRD_PARTY_EXPLAINER_LANGUAGE =
  /\b(review(s|ed|ing)?|guide|explained|how (?:to join|it works)|understanding|learn about|compar(?:e|ison|ed)|best|top\s?\d+|\bvs\.?\b|ranking|ranked)\b/i;

// Consumer-facing recruitment language (promo codes, per-sale commission,
// "refer a researcher/customer to [us]") -- the audience being recruited is
// individual promoters of the entity's OWN retail product, not peer
// businesses.
const CONSUMER_AFFILIATE_AUDIENCE = /\bpromo code\b|\bdiscount code\b|\bcommission(s)? on (sales|orders)\b|\bearn (a |an |high )?commission/i;

// B2B referral-invitation language aimed at OTHER professional
// firms/businesses, not individual consumer affiliates -- a genuinely
// different, often actionable relationship.
const PROFESSIONAL_REFERRAL_AUDIENCE =
  /\b(qualifying )?(professional firms|law firms|accounting firms|consultanc(?:y|ies)|advisory firms|corporate service providers)\b/i;

// "Bet365's affiliate program" -- a THIRD PARTY's program being described,
// not the resolved entity's own. Captured so the brand name can be
// compared against the entity's own name below.
const THIRD_PARTY_POSSESSIVE_BRAND = /\b([A-Z][a-zA-Z0-9&]{2,})'s (affiliate|partner|referral) program\b/;

// A genuine affiliate network/media business's own homepage legitimately
// says "join our network"/"our affiliate program" -- that's not the same
// claim as a retail brand recruiting affiliates to sell ITS OWN product.
// The tell is platform/network language (advertisers, publishers, brands,
// merchants -- plural, third parties) rather than a single product being
// sold. Exempts a real network operator from the self-promotion buckets
// below so it isn't wrongly demoted to Comparable business.
const NETWORK_OPERATOR_LANGUAGE =
  /\b(affiliate|performance marketing|cpa)\s+network\b|\bconnect(?:ing|s)?\s+(?:advertisers|brands|merchants)\s+(?:and|with)\s+(?:publishers|affiliates)\b|\b(?:advertisers|merchants|brands)\s+and\s+(?:publishers|affiliates)\b/i;

// Real distribution/channel signals -- imports, represents multiple
// manufacturers, sources from suppliers -- distinct from merely selling/
// manufacturing one's own product.
const DISTRIBUTOR_CHANNEL_SIGNALS =
  /\b(import(?:er|s|ed)?|authorized dealer|represents? (?:multiple|various|several)|distributor for|wholesale distributor of (?:multiple|various)|sources? from (?:multiple|various) suppliers|seeking suppliers|multi-?brand)\b/i;

// "We manufacture/produce/supply/sell" with no distribution signal above --
// a same-role competitor/comparable supplier, not evidence of channel fit.
const SELF_SUPPLY_ONLY_SIGNALS = /\bwe (manufacture|produce|make|supply|sell|provide|offer)\b/i;

/**
 * Purely text-based direction detection -- no model call, so it's the
 * backstop that runs on every path (AI-classified and deterministic
 * fallback alike, see classify.ts's buildCandidateFields) to catch
 * unambiguous reverse-direction evidence a classifier might otherwise let
 * through as a plain "Affiliate"/"Distributor" match. Returns "unknown"
 * (never a guess) when no explicit signal is present -- callers should
 * keep whatever direction the strategy already honestly assumed (e.g.
 * "promotes_brand" for an AI-confirmed competitor-promotion match) rather
 * than treat "unknown" itself as evidence of anything.
 *
 * `resolvedEntityName` is NOT required to match inside the evidence text
 * for the self-program check below: the entity was already resolved FROM
 * this exact item's own domain/provider metadata (see entity.ts's
 * resolveEntity), so "our affiliate program" appearing on that item is
 * structurally already a first-person claim by the resolved entity --
 * requiring the brand name to ALSO be restated in a short program blurb
 * ("Join our Affiliate Program for Peptides" doesn't repeat the company's
 * own name) made this check fire on almost none of the real self-
 * promotion pages it was built to catch. `resolvedEntityName` is still
 * used below, for the THIRD-party-brand comparison, where it's actually
 * a different entity's name being checked against.
 */
export function detectRelationshipDirection(item: SourceItem, resolvedEntityName: string | null): RelationshipDirection {
  const text = `${item.title} ${item.snippet}`;
  const entityToken = resolvedEntityName ? normalizedToken(resolvedEntityName) : "";

  // Explainer/review/comparison language anywhere in the text is a safety
  // valve against both signals below: "our honest REVIEW OF the
  // Genoscience affiliate program" technically contains "our" ... "affiliate"
  // ... "program" too, but is unambiguously third-party coverage, not a
  // self-referential program page -- when in doubt here, prefer NOT
  // flagging self-promotion over wrongly demoting a genuine reviewer.
  const looksLikeOwnProgramPage =
    !THIRD_PARTY_EXPLAINER_LANGUAGE.test(text) && (SELF_PROGRAM_LANGUAGE.test(text) || BARE_PROGRAM_TITLE.test(item.title));

  if (looksLikeOwnProgramPage && !NETWORK_OPERATOR_LANGUAGE.test(text)) {
    if (PROFESSIONAL_REFERRAL_AUDIENCE.test(text)) return "accepts_referrals_from";
    if (CONSUMER_AFFILIATE_AUDIENCE.test(text)) return "operates_affiliate_program";
    return "recruits_affiliates";
  }

  const possessiveMatch = text.match(THIRD_PARTY_POSSESSIVE_BRAND);
  if (possessiveMatch && entityToken && normalizedToken(possessiveMatch[1]) !== entityToken) {
    return "publishes_about";
  }

  if (DISTRIBUTOR_CHANNEL_SIGNALS.test(text)) return "distributes_brand";
  if (SELF_SUPPLY_ONLY_SIGNALS.test(text) && !DISTRIBUTOR_CHANNEL_SIGNALS.test(text)) return "supplies_product";

  return "unknown";
}

const SELF_PROMOTION_DIRECTIONS = new Set<RelationshipDirection>(["operates_affiliate_program", "recruits_affiliates"]);
const REFERRAL_DIRECTIONS = new Set<RelationshipDirection>(["accepts_referrals_from", "refers_clients_to"]);
const RETYPEABLE_ON_REFERRAL = new Set<CandidateType>(["Affiliate", "Publisher", "Other", "Professional services firm"]);

/**
 * Entity type should describe the ENTITY, not the page that happened to
 * mention a program -- overrides `type`/`applicationUrl` once the
 * relationship direction is known. Never touches fitScore here (see
 * entity.ts's computeFitScore, which already takes relationshipDirection
 * directly, so the number and the label stay derived from the same input
 * rather than being patched twice).
 */
export function applyRelationshipDirection<
  T extends { type: CandidateType | null; applicationUrl: string | null; relationshipDirection: RelationshipDirection },
>(candidate: T): T {
  const direction = candidate.relationshipDirection;

  if (SELF_PROMOTION_DIRECTIONS.has(direction)) {
    // A brand recruiting affiliates for itself is comparable-brand
    // intelligence, not a partner the user could apply to -- its own
    // signup page isn't an actionable route for the user either.
    return { ...candidate, type: "Comparable business", applicationUrl: null };
  }
  if (direction === "publishes_about") {
    // A page documenting a THIRD PARTY's program is evidence, not the
    // independent entity the discovery was actually looking for.
    return { ...candidate, type: "Evidence source", applicationUrl: null };
  }
  if (REFERRAL_DIRECTIONS.has(direction) && candidate.type && RETYPEABLE_ON_REFERRAL.has(candidate.type)) {
    return { ...candidate, type: "Referral partner" };
  }
  // A same-category professional-services firm is comparable/competitor
  // intelligence by default -- offering the same kind of service the
  // scanning business itself offers doesn't make it a recruitable
  // partner. The referral-upgrade check above already promotes it to
  // "Referral partner" when genuine complementary/referral evidence
  // exists; absent that, it stays Comparable business rather than a
  // normal Potential Partner.
  if (candidate.type === "Professional services firm") {
    return { ...candidate, type: "Comparable business" };
  }
  return candidate;
}
