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

/**
 * Diminishing-returns bracket table (checked highest-first) for the
 * cross-brand corroboration bonus -- an entity independently evidenced
 * against many comparable brands is one of Deep Discovery's strongest
 * signals ("who repeatedly appears across the affiliate ecosystems of
 * brands like mine"), but the marginal value of each additional brand
 * shrinks rather than compounding without bound: 1 brand is barely
 * distinguishable from a single-brand Quick Scan match; 2 is a real
 * signal; 6-10 is very strong; beyond that, more brands still count for
 * something (never a hard ceiling) but stop meaningfully changing the
 * ranking. A bracket table, not a formula, so the curve stays inspectable
 * and easy to re-tune -- same "transparent weighted sum, never a
 * black-box score" principle as Quick Scan's own computeFitScore.
 */
const CROSS_BRAND_BONUS_BRACKETS: Array<{ minBrands: number; bonus: number }> = [
  { minBrands: 11, bonus: 30 },
  { minBrands: 6, bonus: 26 },
  { minBrands: 4, bonus: 20 },
  { minBrands: 3, bonus: 14 },
  { minBrands: 2, bonus: 8 },
  { minBrands: 0, bonus: 0 },
];

function crossBrandBonus(distinctBrandCount: number): number {
  for (const bracket of CROSS_BRAND_BONUS_BRACKETS) {
    if (distinctBrandCount >= bracket.minBrands) return bracket.bonus;
  }
  return 0;
}

export function computeDeepFitScore(input: {
  baseFitScore: number;
  /**
   * Distinct brands this entity has an independent, REAL, evidenced
   * relationship with, per the graph (see repository.ts's
   * countDistinctBrandsForEntity, which counts distinct target_brand_id
   * values on the entity's own relationships rows -- a duplicate URL or
   * repeated weak sighting of the SAME brand is already a single
   * relationship row there, so it can never inflate this count; only a
   * genuinely different brand adds to it).
   */
  distinctBrandCount: number;
  /** Independent evidence rows backing this specific relationship. */
  evidenceCount: number;
}): number {
  let score = input.baseFitScore;
  score += crossBrandBonus(input.distinctBrandCount);
  score += Math.min(Math.max(input.evidenceCount - 1, 0) * 3, 9);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function deepQualityTier(fitScore: number, evidenceConfidence: "strong" | "medium" | "weak"): QualityTier {
  return qualityTierForFit(fitScore, evidenceConfidence);
}
