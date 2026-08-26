import { PREVIEW_INELIGIBLE_DIRECTIONS } from "../discovery/qualification";
import { countDistinctBrandsForEntity, OpportunityWithEntity } from "../graph/repository";

/**
 * Deep Discovery's previewCandidate (Sections 23-26): "if PARTNRA could
 * show the user only ONE result, which one most convincingly proves
 * PARTNRA's value?" -- never the highest raw partnra_fit alone. Every hard
 * exclusion Quick Scan's own preview fallback applies (see
 * qualification.ts's selectPreviewFallbackCandidate) is either already
 * structurally impossible here (an Opportunity row only ever exists for a
 * candidate that already passed qualifyOpportunity AND wasn't flagged as
 * an SEO/clone-network member -- see brandExpansion.ts) or re-checked
 * below (quality tier, relationship direction, geographic mismatch),
 * never a separate, looser bar.
 */
export interface DeepPreviewDecision {
  opportunity: OpportunityWithEntity | null;
  reason: string;
  consideredCount: number;
  eligibleCount: number;
}

function previewScoreFor(o: OpportunityWithEntity, distinctBrandCount: number): number {
  let score = o.partnra_fit;
  // Demonstration value, not just fit: an entity independently connected
  // to multiple comparable brands, with a real application route and
  // strong evidence, proves PARTNRA's research far more convincingly than
  // a marginally-higher fit number with thin support.
  score += o.actionability === "application_route_found" ? 8 : 0;
  if (distinctBrandCount >= 3) score += 10;
  else if (distinctBrandCount === 2) score += 6;
  score += o.evidence_confidence === "strong" ? 6 : o.evidence_confidence === "medium" ? 3 : 0;
  return score;
}

export async function selectDeepPreviewCandidate(opportunities: OpportunityWithEntity[]): Promise<DeepPreviewDecision> {
  const eligible = opportunities.filter(
    (o) =>
      o.quality_tier !== "weak" &&
      !PREVIEW_INELIGIBLE_DIRECTIONS.has(o.relationship_direction) &&
      o.geographic_fit !== "mismatch"
  );

  if (eligible.length === 0) {
    return {
      opportunity: null,
      reason: "No opportunity cleared the preview eligibility bar (quality tier / relationship direction / geographic fit) -- empty preview is honest here.",
      consideredCount: opportunities.length,
      eligibleCount: 0,
    };
  }

  let best: { opportunity: OpportunityWithEntity; score: number } | null = null;
  for (const o of eligible) {
    const distinctBrandCount = await countDistinctBrandsForEntity(o.entity_id);
    const score = previewScoreFor(o, distinctBrandCount);
    if (!best || score > best.score) best = { opportunity: o, score };
  }

  return {
    opportunity: best!.opportunity,
    reason: `Best combined preview score (${best!.score}) among ${eligible.length} eligible opportunities -- fit ${best!.opportunity.partnra_fit}, tier ${best!.opportunity.quality_tier}, direction ${best!.opportunity.relationship_direction}.`,
    consideredCount: opportunities.length,
    eligibleCount: eligible.length,
  };
}
