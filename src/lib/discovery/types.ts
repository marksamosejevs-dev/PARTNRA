export type EvidenceType =
  | "Promo code"
  | "Affiliate link"
  | "Referral"
  | "Review"
  | "Ambassador"
  | "Partner"
  | "Category affiliate"
  | "Category review"
  | "Distributor fit";

/**
 * The commercial ROLE of the resolved entity behind a piece of evidence --
 * this is "primaryRole" in all but name. Deliberately independent of which
 * source platform (see Candidate.platform / SourceItem.platform) the
 * evidence was found on: a law firm found via a YouTube video is still a
 * "Professional services firm", not a "Creator", merely because YouTube
 * happened to be where Partnra found it. "Comparable business" and
 * "Competitor affiliate program" exist so a competitor's own
 * infrastructure or a directly comparable/competing business is never
 * confused with an independent, recruitable partner. "Evidence source"
 * covers a real, useful piece of intelligence (a PDF, a directory listing,
 * a platform post) that isn't itself a commercial entity worth showing as
 * a partner opportunity. "Other" is an honest fallback for a real entity
 * that doesn't fit these buckets, never guessed into a more specific one
 * it can't support. Kept as one curated, fixed list -- WHICH of these
 * types matter for a given business is decided dynamically per-scan (see
 * BusinessProfile's prioritizedPartnerTypes/deprioritizedPartnerTypes in
 * business.ts), never by hardcoding logic per industry/domain.
 */
export const CANDIDATE_TYPES = [
  "Creator",
  "Affiliate",
  "Affiliate Network",
  "Publisher",
  "Review site",
  "Newsletter",
  "Coupon publisher",
  "Retailer",
  "Distributor",
  "Wholesaler",
  "Importer",
  "Reseller",
  "Trader",
  "Marketplace",
  "Community",
  "Commercial buyer",
  "Referral partner",
  "Professional services firm",
  "Comparable business",
  "Competitor affiliate program",
  "Evidence source",
  "Other",
] as const;

export type CandidateType = (typeof CANDIDATE_TYPES)[number];

/**
 * Types that describe a competitor's own infrastructure, a directly
 * comparable/competing business, or a non-entity evidence source rather
 * than an independent, recruitable partner. Excluded from the normal
 * Potential Partners list (see route.ts) unless a real, evidence-based
 * potentialRelationship (e.g. a complementary-geography referral angle)
 * has been set on that specific candidate.
 */
export const NON_PARTNER_TYPES = new Set<CandidateType>([
  "Comparable business",
  "Competitor affiliate program",
  "Evidence source",
]);

/**
 * The direction of the commercial relationship the evidence actually
 * shows -- distinct from WHETHER evidence exists at all. "This company
 * operates an affiliate program" and "this company IS a partner the user
 * should recruit" are not the same claim: a peptide brand's own affiliate
 * page shows it *recruiting* affiliates for itself (operates_affiliate_program),
 * not performing the Affiliate role for someone else. Kept deliberately
 * small -- the useful distinction is just "is the entity performing the
 * desired partner role, or the opposite/an unrelated one" -- not a full
 * relationship-graph taxonomy.
 */
export const RELATIONSHIP_DIRECTIONS = [
  "promotes_brand",
  "distributes_brand",
  "resells_brand",
  "refers_clients_to",
  "accepts_referrals_from",
  "recruits_affiliates",
  "operates_affiliate_program",
  "supplies_product",
  "buys_product",
  "publishes_about",
  "unknown",
] as const;

export type RelationshipDirection = (typeof RELATIONSHIP_DIRECTIONS)[number];

export type SourceName = "Web" | "OpenAI" | "YouTube" | "Instagram" | "TikTok";

export type ContactStatus = "found" | "not_found" | "not_attempted";

/**
 * How this evidence was found, not how confident the classifier is in the
 * text it read. "strong" = an actual relationship with a direct competitor
 * (Strategy A). "medium" = real, active commercial engagement with the
 * user's product category, but not tied to a named competitor (Strategy
 * B/C). "potential" = a plausible commercial fit (e.g. a distributor/
 * retailer whose real catalogue matches) with no evidence of an existing
 * promotional relationship yet (Strategy D). Never inflate one tier into
 * another — the label is what's shown to the user, so it has to stay honest.
 */
export type SignalStrength = "strong" | "medium" | "potential";

export interface Candidate {
  name: string | null;
  /**
   * The entity's primary commercial role (see CandidateType) -- resolved
   * from the entity's own content/structure (entity.ts), never from which
   * source platform found it. `type` and `platform` describe two
   * different things and must never be conflated: `platform` is WHERE the
   * evidence was found, `type` is WHAT the entity commercially is.
   */
  type: CandidateType | null;
  /**
   * Human-readable SOURCE PLATFORM label(s) the evidence was found on
   * (e.g. "YouTube" or "YouTube, Instagram" once merged) -- never used to
   * infer `type`. A law firm found via a YouTube video is still a
   * "Professional services firm", not a "Creator".
   */
  platform: string | null;
  profileUrl: string | null;
  /** Strongest/first evidence link — what "View evidence" opens. */
  sourceUrl: string;
  /** How many independent sources corroborate this candidate (>=1). Used as a ranking tiebreaker, never to inflate confidence. */
  sourceCount: number;
  evidenceType: EvidenceType | null;
  evidence: string;
  signalStrength: SignalStrength;
  /**
   * True if an LLM actually read this evidence and judged it real.
   * False means AI classification couldn't complete in time (or failed),
   * so this candidate was scored by a deterministic, non-AI heuristic
   * instead -- still real, already-discovered evidence, just not yet
   * verified by a model. Always shown as clearly less confident than a
   * verified result, never dressed up as equivalent.
   */
  verified: boolean;
  promoCode: string | null;
  contact: string | null;
  contactStatus: ContactStatus;
  /**
   * How strongly Partnra has verified the underlying evidence/relationship
   * -- a plain label derived from signalStrength + verified, shown
   * separately from fitScore so the two concepts are never collapsed into
   * one percentage. "weak" always means unverified (deterministic
   * fallback), regardless of signalStrength.
   */
  evidenceConfidence: "strong" | "medium" | "weak";
  /** Raw numeric confidence behind evidenceConfidence -- kept for internal ranking/thresholds, not the number shown as the headline score anymore (see fitScore). */
  confidence: number;
  /**
   * How attractive/relevant this entity is as a partner prospect, given
   * the evidence found -- distinct from evidenceConfidence. A transparent
   * weighted sum over real signals (signal strength, partner type,
   * corroborating source count, an actionable application route), never a
   * black-box score. Two candidates with identical evidence strength can
   * still have very different fit if one is a generic coupon aggregator
   * and the other has real affiliate infrastructure in the target category.
   */
  fitScore: number;
  /** A real affiliate/partner-program signup page found in the evidence itself, if any -- often more actionable than a generic contact email. Never fabricated; null when no such page was found. */
  applicationUrl: string | null;
  /**
   * True when this candidate's domain/evidence closely matches one or more
   * OTHER candidates on genuinely different domains -- a templated/doorway
   * SEO network (e.g. sequential numeric-suffix domains, or near-identical
   * evidence text) rather than independently vetted partners. Distinct
   * domains are never merged into one candidate over this (see dedupe.ts) --
   * each stays its own row, just flagged and down-ranked, since template
   * reuse doesn't prove any one of them is fake, only that none of them
   * should occupy a top slot on the strength of that evidence alone.
   */
  similarEvidenceNetwork: boolean;
  /** Total number of distinct domains (including this one) in the templated/near-duplicate cluster this candidate was grouped into by flagDuplicateEvidenceNetworks. 0 when not part of one. */
  similarEvidenceDomainCount: number;
  /**
   * A real, evidence-based SECONDARY relationship angle that coexists with
   * `type` -- e.g. a foreign law firm whose primary role is "Comparable
   * business" but whose complementary geography/service coverage also
   * makes it a plausible "Potential referral partner". Null by default;
   * only ever set from an inspectable, real signal (never invented to make
   * a competitor look more interesting). Role classification is not
   * binary: this is how a candidate can carry both a primary role and a
   * secondary opportunity without collapsing them into one label.
   */
  potentialRelationship: string | null;
  /**
   * The direction of the commercial relationship the evidence actually
   * shows (see RELATIONSHIP_DIRECTIONS) -- e.g. a brand's own affiliate
   * page shows it RECRUITING affiliates ("operates_affiliate_program"),
   * which is a different claim from the brand ITSELF performing the
   * Affiliate role. "unknown" is an honest state when the direction isn't
   * clearly determinable -- not itself a reason to exclude a candidate.
   */
  relationshipDirection: RelationshipDirection;
  reason: string;
}

/**
 * One item pulled from a single provider (Serper, YouTube, Apify) before
 * classification. Providers already know their own platform with certainty,
 * so the classifier is never asked to guess it.
 */
export interface SourceItem {
  source: SourceName;
  platform: string;
  title: string;
  url: string;
  profileUrl: string | null;
  snippet: string;
  /** A real, authoritative entity name from the provider itself (e.g. a YouTube channel title) -- preferred over guessing one from the domain. Absent when the provider has no such identity (Serper/OpenAI web results). */
  entityName?: string;
}

/** Raw shape the LLM classifier is forced to return for a single source item. */
export interface ClassifiedResult extends Omit<Candidate, "sourceUrl" | "platform" | "sourceCount" | "contact" | "contactStatus"> {
  validCandidate: boolean;
  sourceUrl: string;
  platform: string;
}

export interface DiscoverResponse {
  mock: boolean;
  brand: string;
  domain: string;
  queriesRun: number;
  totalFound: number;
  candidates: Candidate[];
  /** Product category Partnra identified for the submitted business, if determinable. */
  businessCategory: string | null;
  /** Primary market/geography Partnra identified, if determinable from the homepage. */
  businessMarket: string | null;
  /** Short product/keyword phrases Partnra identified the business as selling. */
  businessKeywords: string[];
  /** Real, resolved comparable-brand domains Partnra investigated on the user's behalf. */
  competitorsAnalyzed: string[];
  /**
   * Which discovery strategies actually ran and contributed evidence.
   * "competitor" = comparable-brand relationships. "category" = direct
   * category/product/market signals, used whenever competitor-based
   * discovery was unavailable or too weak on its own.
   */
  discoveryStrategiesUsed: Array<"competitor" | "category">;
}

export interface DiscoverErrorResponse {
  error: string;
}
