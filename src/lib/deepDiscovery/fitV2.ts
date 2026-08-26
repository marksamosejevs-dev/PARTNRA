import { QualityTier, qualityTierForFit } from "../discovery/qualification";

/**
 * PARTNRA Fit V2 -- Deep Discovery's Fit is Quick Scan's own
 * computeFitScore (entity.ts) PLUS graph-only signals Quick Scan has no
 * way to see in a single synchronous request: how many DISTINCT
 * comparable brands this entity is independently connected to, and how
 * many independent evidence sources corroborate it. Never a rewritten
 * parallel scorer -- `baseFitScore` is the exact same signal-strength/
 * type/relationship-direction/geographic-fit/evidence-sufficiency
 * composite Quick Scan already computes; this only adds the cross-brand
 * term on top, transparently.
 */
export function computeDeepFitScore(input: {
  baseFitScore: number;
  /** Distinct brands this entity has an independent relationship with, per the graph (see repository.ts's countDistinctBrandsForEntity) -- one of Deep Discovery's strongest signals (an entity connected to 3 comparable brands should rank materially above one with a single weak mention). */
  distinctBrandCount: number;
  /** Independent evidence rows backing this specific relationship. */
  evidenceCount: number;
}): number {
  let score = input.baseFitScore;
  if (input.distinctBrandCount >= 3) score += 15;
  else if (input.distinctBrandCount === 2) score += 8;
  score += Math.min(Math.max(input.evidenceCount - 1, 0) * 3, 9);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function deepQualityTier(fitScore: number, evidenceConfidence: "strong" | "medium" | "weak"): QualityTier {
  return qualityTierForFit(fitScore, evidenceConfidence);
}
