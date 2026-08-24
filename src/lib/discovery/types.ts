export type EvidenceType =
  | "Promo code"
  | "Affiliate link"
  | "Referral"
  | "Review"
  | "Ambassador"
  | "Partner";

export type CandidateType = "Creator" | "Publisher" | "Reviewer" | "Site";

export interface Candidate {
  name: string | null;
  type: CandidateType | null;
  platform: string | null;
  profileUrl: string | null;
  sourceUrl: string;
  evidenceType: EvidenceType | null;
  evidence: string;
  promoCode: string | null;
  contact: string | null;
  confidence: number;
  reason: string;
}

/** Raw shape the LLM classifier is forced to return for a single search result. */
export interface ClassifiedResult extends Omit<Candidate, "sourceUrl"> {
  validCandidate: boolean;
  sourceUrl: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface DiscoverResponse {
  mock: boolean;
  brand: string;
  domain: string;
  queriesRun: number;
  totalFound: number;
  candidates: Candidate[];
}

export interface DiscoverErrorResponse {
  error: string;
}
