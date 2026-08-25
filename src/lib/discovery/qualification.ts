import { Candidate, NON_PARTNER_TYPES } from "./types";

export type OpportunityClassification = "potential_partner" | "competitor_intelligence" | "evidence_source" | "rejected";

/**
 * The single canonical qualification step every candidate passes through,
 * from every discovery/classification path, before final results are
 * built. Entity resolution (entity.ts), role classification
 * (classifyPartnerType), and relationship direction
 * (relationshipDirection.ts) have all already run by the time a candidate
 * reaches here -- this just reads their combined output (the final
 * `type`/`potentialRelationship`) into ONE bucket, in ONE place, so the
 * AI-classified path and the deterministic fallback path can never
 * quietly diverge on what "qualifies" as a Potential Partner.
 */
export function qualifyOpportunity(candidate: Candidate): OpportunityClassification {
  if (!candidate.type) return "rejected";
  if (candidate.type === "Evidence source") return "evidence_source";
  if (NON_PARTNER_TYPES.has(candidate.type)) {
    // A real, evidence-based secondary angle (potentialRelationship) is
    // exactly the escape hatch for a candidate whose primary role is
    // Comparable business/Competitor affiliate program but is ALSO a
    // plausible partner for another reason -- everything else in
    // NON_PARTNER_TYPES with no such angle is intelligence, not a partner.
    return candidate.potentialRelationship ? "potential_partner" : "competitor_intelligence";
  }
  return "potential_partner";
}
