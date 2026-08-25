import { Candidate, NON_PARTNER_TYPES } from "./types";

export type OpportunityClassification = "potential_partner" | "competitor_intelligence" | "evidence_source" | "rejected";

/**
 * A generic source PLATFORM is never a commercial entity -- entity.ts's
 * NON_ENTITY_PLATFORM_HOSTS is the primary defense (it stops a bare
 * platform hostname from ever being resolved as `name` in the first
 * place), but this is the canonical, final backstop: whatever path a
 * candidate came through, if its resolved name IS literally one of these
 * platforms, it can never reach the Potential Partners list.
 */
const GENERIC_PLATFORM_NAMES = new Set([
  "youtube",
  "linkedin",
  "facebook",
  "instagram",
  "tiktok",
  "google",
  "reddit",
  "twitter",
  "x",
  "pinterest",
  "quora",
  "medium",
  "wikipedia",
]);

function isGenericPlatformName(name: string): boolean {
  return GENERIC_PLATFORM_NAMES.has(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/**
 * The single canonical qualification step every candidate passes through,
 * from every discovery/classification path, before final results are
 * built. Entity resolution (entity.ts), role classification
 * (classifyPartnerType), and relationship direction
 * (relationshipDirection.ts) have all already run by the time a candidate
 * reaches here -- this just reads their combined output (the final
 * `name`/`type`/`potentialRelationship`) into ONE bucket, in ONE place,
 * so the AI-classified path and the deterministic fallback path can never
 * quietly diverge on what "qualifies" as a Potential Partner.
 */
export function qualifyOpportunity(candidate: Candidate): OpportunityClassification {
  // No resolvable entity identity at all -- there's no one to show as a
  // partner, whatever category/keyword signals otherwise matched.
  if (!candidate.name || !candidate.type) return "rejected";
  if (isGenericPlatformName(candidate.name)) return "rejected";
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
