import { Candidate, NON_PARTNER_TYPES, RelationshipDirection } from "./types";
import { assessGeographicFit, inferGeoStrictness, GEO_FIT_WEIGHTS } from "./entity";
import { NO_SNIPPET_PLACEHOLDER } from "./classify";

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
/**
 * Exported (as primitives, not a Candidate-shaped signature) so Deep
 * Discovery's own Fit V2 (see src/lib/deepDiscovery/fitV2.ts) can classify
 * its own recomputed fit number against the SAME STRONG/GOOD/WEAK
 * thresholds Quick Scan uses, rather than drifting to a second set of
 * breakpoints.
 */
export function qualityTierForFit(fitScore: number, evidenceConfidence: Candidate["evidenceConfidence"]): QualityTier {
  if (evidenceConfidence === "weak") return "weak";
  if (fitScore >= 68 && evidenceConfidence === "strong") return "strong";
  if (fitScore >= 50) return "good";
  return "weak";
}

function qualityTierFor(candidate: Candidate): QualityTier {
  return qualityTierForFit(candidate.fitScore, candidate.evidenceConfidence);
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

// A candidate whose evidence points the WRONG way (it recruits its own
// affiliates, documents someone else's program, or is just another
// supplier of the same thing) is never an acceptable preview, however
// plausible the rest of it looks -- the preview must be something the
// user could actually pursue. Exported so Deep Discovery's own preview
// selection (src/lib/deepDiscovery/preview.ts) applies the SAME hard
// exclusion, rather than a second, driftable list.
export const PREVIEW_INELIGIBLE_DIRECTIONS = new Set<RelationshipDirection>([
  "operates_affiliate_program",
  "recruits_affiliates",
  "publishes_about",
  "supplies_product",
]);

const PREVIEW_CHANNEL_FIT_DIRECTIONS = new Set<RelationshipDirection>([
  "accepts_referrals_from",
  "refers_clients_to",
  "distributes_brand",
  "buys_product",
]);

/**
 * The minimum combined preview score a fallback must reach -- a floor
 * against surfacing genuinely junk candidates just because nothing better
 * exists. Calibrated so a real, semantically-relevant creator/publisher
 * with thin evidence (mid-40s Fit, no bonuses) can still preview, while a
 * generic unverified keyword hit (high-20s/30s Fit, no bonuses) cannot.
 * Tunable from the per-scan preview_fallback log without guessing.
 */
const PREVIEW_SCORE_FLOOR = 45;

export interface PreviewFallbackDecision {
  candidate: Candidate | null;
  /** Why this candidate was selected, or why the empty state remained -- always set, for logging. */
  reason: string;
  /** Per-candidate audit of the weak/rejected pool considered, for the preview_fallback log. */
  considered: Array<{ name: string | null; type: Candidate["type"]; eligible: boolean; reason: string; previewScore: number | null }>;
}

/**
 * ONE canonical place deciding the Quick Scan preview fallback -- never
 * scattered across UI/route logic. Runs ONLY when zero candidates passed
 * the normal quality gate: picks at most ONE genuinely plausible,
 * recruitable, correctly-resolved entity from the weak pool as an honest
 * preview ("Potential fit / Evidence: Limited"), because one high-quality
 * plausible preview is better than an empty funnel -- but an empty state
 * is still returned when nothing commercially plausible exists. The
 * normal gate itself is deliberately NOT weakened by this: everything the
 * gate excludes for being noise (evidence sources, competitor
 * infrastructure, comparable businesses, generic platforms, institutional
 * sources, reverse-direction evidence) stays excluded here too -- only
 * "real opportunity, thin evidence" candidates are eligible.
 *
 * Selection is never raw fitScore alone: an explicit combination of
 * relationship direction, evidence quality, actionability, geographic fit
 * and corroboration ranks eligible candidates, with a floor so a scan
 * whose whole weak pool is junk still honestly returns nothing. A
 * candidate whose geography clearly MISMATCHES the business's own market
 * is never eligible as a preview at all -- a commercially distant entity
 * should never be the one honest preview shown, however good the rest of
 * its evidence looks (see assessGeographicFit).
 */
export function selectPreviewFallbackCandidate(
  pool: Array<{ candidate: Candidate; qualification: Qualification }>,
  businessMarket: string | null,
  businessModel: string | null = null
): PreviewFallbackDecision {
  const considered: PreviewFallbackDecision["considered"] = [];
  let best: { candidate: Candidate; previewScore: number } | null = null;

  for (const { candidate, qualification } of pool) {
    const audit = (eligible: boolean, reason: string, previewScore: number | null = null) => {
      considered.push({ name: candidate.name, type: candidate.type, eligible, reason, previewScore });
    };

    // The normal gate's own non-partner classifications stay excluded --
    // this fallback never re-admits evidence sources, competitor
    // infrastructure, comparable businesses, generic platforms or
    // institutional sources (all of which qualifyOpportunity already
    // classified away from "potential_partner").
    if (qualification.finalClassification !== "potential_partner") {
      audit(false, `Not a potential partner (${qualification.finalClassification}).`);
      continue;
    }
    if (PREVIEW_INELIGIBLE_DIRECTIONS.has(candidate.relationshipDirection)) {
      audit(false, `Reverse/ineligible relationship direction (${candidate.relationshipDirection}).`);
      continue;
    }
    const evidenceText = candidate.evidence.trim();
    if (evidenceText === NO_SNIPPET_PLACEHOLDER || evidenceText.length < 20) {
      audit(false, "No real evidence text behind the candidate.");
      continue;
    }
    const geographicFit = assessGeographicFit(candidate.evidence, businessMarket);
    if (geographicFit === "mismatch") {
      audit(false, "Explicit geography mismatch with the business's own market -- never an acceptable preview.");
      continue;
    }

    // Explicitly NOT raw fitScore alone: fitScore already composites
    // type/direction/geography/evidence-sufficiency, but the preview pick
    // additionally re-weights the signals that make a thin-evidence lead
    // worth previewing -- an actionable channel direction, whatever
    // evidence quality it DOES have, a real application route,
    // independent corroboration, and geographic fit weighted by the same
    // strictness table Fit itself uses (see GEO_FIT_WEIGHTS) so a foreign
    // "exports globally" claim never outweighs a candidate that actually
    // operates in or near the target market.
    const directionBonus = PREVIEW_CHANNEL_FIT_DIRECTIONS.has(candidate.relationshipDirection)
      ? 15
      : candidate.relationshipDirection === "promotes_brand"
        ? 10
        : 0;
    const evidenceBonus = candidate.evidenceConfidence === "strong" ? 20 : candidate.evidenceConfidence === "medium" ? 12 : 0;
    const actionabilityBonus = (candidate.applicationUrl ? 8 : 0) + (candidate.verified ? 6 : 0);
    const geoStrictness = inferGeoStrictness(businessModel, candidate.type);
    const geoBonus = GEO_FIT_WEIGHTS[geoStrictness][geographicFit];
    const corroborationBonus = Math.min((candidate.sourceCount - 1) * 4, 8);
    const previewScore = candidate.fitScore + directionBonus + evidenceBonus + actionabilityBonus + geoBonus + corroborationBonus;

    if (previewScore < PREVIEW_SCORE_FLOOR) {
      audit(false, `Combined preview score ${previewScore} below floor ${PREVIEW_SCORE_FLOOR}.`, previewScore);
      continue;
    }

    audit(true, "Eligible.", previewScore);
    if (!best || previewScore > best.previewScore) {
      best = { candidate, previewScore };
    }
  }

  if (!best) {
    return {
      candidate: null,
      reason: "No commercially plausible, recruitable entity with real evidence survived preview eligibility -- empty state remains.",
      considered,
    };
  }
  return {
    candidate: best.candidate,
    reason: `Best combined preview score (${best.previewScore}): direction ${best.candidate.relationshipDirection}, evidence ${best.candidate.evidenceConfidence}, type ${best.candidate.type}.`,
    considered,
  };
}
