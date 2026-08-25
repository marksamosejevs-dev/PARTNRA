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
 */
export function detectRelationshipDirection(item: SourceItem, resolvedEntityName: string | null): RelationshipDirection {
  const text = `${item.title} ${item.snippet}`;
  const entityToken = resolvedEntityName ? normalizedToken(resolvedEntityName) : "";
  const mentionsOwnBrand = entityToken.length > 2 && normalizedToken(text).includes(entityToken);

  if (SELF_PROGRAM_LANGUAGE.test(text) && mentionsOwnBrand) {
    if (PROFESSIONAL_REFERRAL_AUDIENCE.test(text)) return "accepts_referrals_from";
    if (CONSUMER_AFFILIATE_AUDIENCE.test(text)) return "operates_affiliate_program";
    return "recruits_affiliates";
  }

  const possessiveMatch = text.match(THIRD_PARTY_POSSESSIVE_BRAND);
  if (possessiveMatch && normalizedToken(possessiveMatch[1]) !== entityToken) {
    return "publishes_about";
  }

  if (DISTRIBUTOR_CHANNEL_SIGNALS.test(text)) return "distributes_brand";
  if (SELF_SUPPLY_ONLY_SIGNALS.test(text) && !DISTRIBUTOR_CHANNEL_SIGNALS.test(text)) return "supplies_product";

  return "unknown";
}

const SELF_PROMOTION_DIRECTIONS = new Set<RelationshipDirection>(["operates_affiliate_program", "recruits_affiliates"]);
const REFERRAL_DIRECTIONS = new Set<RelationshipDirection>(["accepts_referrals_from", "refers_clients_to"]);
const RETYPEABLE_ON_REFERRAL = new Set<CandidateType>(["Affiliate", "Publisher", "Other"]);

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
  return candidate;
}
