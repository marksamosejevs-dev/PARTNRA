import { Candidate, NON_PARTNER_TYPES } from "./types";

/**
 * ONE canonical qualification step every candidate passes through right
 * before serialization, regardless of which discovery/classification path
 * produced it (AI-classified, deterministic fallback, competitor or
 * category strategy alike -- see route.ts). This is the final "is this
 * actually worth showing in Quick Scan" call -- distinct from `type`/
 * `relationshipDirection` (what/which-way the evidence says the entity is)
 * -- combining Fit, Evidence Confidence, entity/source validity and
 * recruitability into one auditable decision. Quick Scan's result count
 * should be `candidates.filter(q => q.showInQuickScan).length`, whatever
 * that number is -- never a fixed target, never padded to fill empty
 * slots. No branch anywhere else in the pipeline should re-decide this.
 */
export type OpportunityClassification = "potential_partner" | "competitor_intelligence" | "evidence_source" | "rejected";

/**
 * STRONG = high-quality, recruitable, well-evidenced. GOOD/POTENTIAL =
 * relevant but less verified -- still shown, just not oversold. WEAK =
 * held back from Quick Scan entirely (kept internally / left for Deep
 * Discovery to expand on later) -- Quick Scan prioritizes precision over
 * a complete lead list.
 */
export type QualityTier = "strong" | "good" | "weak";

export interface Qualification {
  finalClassification: OpportunityClassification;
  /** Quick Scan renders exactly `candidates.filter(q => q.showInQuickScan)`, sorted by qualityTier then fitScore -- no separate "fill to N" step anywhere else in the pipeline. */
  showInQuickScan: boolean;
  /** Human-auditable reason a candidate was held back, for logging -- null when shown. */
  exclusionReason: string | null;
  qualityTier: QualityTier;
}

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
 * STRONG requires both a genuinely high Fit AND strong evidence -- a
 * plausible category/type match resting on thin evidence is GOOD at best,
 * never STRONG. GOOD requires Fit to clear a real bar AND evidence that
 * isn't "weak" (weak evidence confidence already means either unverified,
 * or essentially no real text behind the candidate -- see classify.ts's
 * hasSufficientEvidence). Deliberately never a bare `fitScore >= N` check
 * on its own: fitScore already composites signal strength, type,
 * relationship direction, market fit and evidence sufficiency (see
 * entity.ts's computeFitScore); evidenceConfidence is checked here as a
 * SEPARATE gate so a high Fit number built on thin evidence still can't
 * reach STRONG or even GOOD.
 */
function qualityTierFor(candidate: Candidate): QualityTier {
  if (candidate.evidenceConfidence === "weak") return "weak";
  if (candidate.fitScore >= 68 && candidate.evidenceConfidence === "strong") return "strong";
  if (candidate.fitScore >= 50) return "good";
  return "weak";
}

export function qualifyOpportunity(candidate: Candidate): Qualification {
  if (!candidate.name || !candidate.type) {
    return {
      finalClassification: "rejected",
      showInQuickScan: false,
      exclusionReason: "No resolvable entity identity.",
      qualityTier: "weak",
    };
  }
  if (isGenericPlatformName(candidate.name)) {
    return {
      finalClassification: "rejected",
      showInQuickScan: false,
      exclusionReason: "Resolved name is a generic platform, not a real entity.",
      qualityTier: "weak",
    };
  }
  if (candidate.type === "Evidence source") {
    return {
      finalClassification: "evidence_source",
      showInQuickScan: false,
      exclusionReason: "Evidence source (documents or hosts evidence about someone else), not an independent commercial partner.",
      qualityTier: "weak",
    };
  }
  if (NON_PARTNER_TYPES.has(candidate.type)) {
    if (!candidate.potentialRelationship) {
      return {
        finalClassification: "competitor_intelligence",
        showInQuickScan: false,
        exclusionReason: "Competitor-owned infrastructure or a directly comparable business, not a recruitable partner.",
        qualityTier: "weak",
      };
    }
    // A real, evidence-based secondary relationship angle exists (see
    // Candidate.potentialRelationship) -- still held to the same quality
    // bar as any other opportunity, never shown automatically just because
    // the field is set.
    const tier = qualityTierFor(candidate);
    return {
      finalClassification: "potential_partner",
      showInQuickScan: tier !== "weak",
      exclusionReason:
        tier === "weak" ? "Secondary relationship angle exists, but evidence/fit is below the Quick Scan bar." : null,
      qualityTier: tier,
    };
  }

  const tier = qualityTierFor(candidate);
  return {
    finalClassification: "potential_partner",
    showInQuickScan: tier !== "weak",
    exclusionReason:
      tier === "weak"
        ? "Below the Quick Scan quality bar (combined Fit and Evidence Confidence) -- kept internally, not shown as a card."
        : null,
    qualityTier: tier,
  };
}
