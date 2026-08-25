export type EvidenceType =
  | "Promo code"
  | "Affiliate link"
  | "Referral"
  | "Review"
  | "Ambassador"
  | "Partner";

export type CandidateType = "Creator" | "Publisher" | "Reviewer" | "Site";

export type SourceName = "Web" | "OpenAI" | "YouTube" | "Instagram" | "TikTok";

export type ContactStatus = "found" | "not_found" | "not_attempted";

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
  /** Real, resolved comparable-brand domains Partnra investigated on the user's behalf. */
  competitorsAnalyzed: string[];
}

export interface DiscoverErrorResponse {
  error: string;
}
