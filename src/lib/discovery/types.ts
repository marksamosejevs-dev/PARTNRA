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

export type CandidateType = "Creator" | "Publisher" | "Reviewer" | "Site";

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
  type: CandidateType | null;
  /** Human-readable platform label(s), e.g. "YouTube" or "YouTube, Instagram" once merged. */
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
  confidence: number;
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
