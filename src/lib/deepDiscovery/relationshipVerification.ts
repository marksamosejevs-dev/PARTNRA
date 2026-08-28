import { classifyResults, BusinessContext, PartnerTypeIntent } from "../discovery/classify";
import { withFallback } from "../discovery/timeout";
import { assessGeographicFit } from "../discovery/entity";
import { qualifyOpportunity } from "../discovery/qualification";
import { SourceItem, ClassifiedResult, Candidate } from "../discovery/types";
import { computeDeepFitScore, deepQualityTier } from "./fitV2";
import { DEEP_DISCOVERY_LIMITS } from "./limits";
import {
  getRelationshipsForEntity,
  getEvidenceForRelationship,
  getBrandById,
  countDistinctBrandsForEntity,
  upsertRelationship,
  upsertOpportunity,
} from "../graph/repository";
import { EntityRow } from "../graph/types";

/**
 * The follow-up to brandExpansion.ts's overflow problem (Section: cost-
 * control sampling must never become a permanent, misleading "weak" label).
 * A candidate that overflowed the per-brand AI-classification budget (or
 * whose whole batch call failed) was persisted honestly as unverified --
 * which forces quality_tier "weak" regardless of its own fitScore (see
 * qualification.ts's qualityTierForFit) -- but only entities whose
 * deterministic fitScore ALREADY cleared the "good" floor were queued here
 * (see limits.ts's overflowVerificationMinFit) -- this is a rescue for
 * "was never verified", never a way to promote genuinely weak evidence.
 *
 * Reuses the SAME classifyResults call and the SAME qualifyOpportunity gate
 * brandExpansion.ts uses for fresh discovery -- a second, real AI judgment
 * on this entity's actual persisted evidence, not a laxer or different bar.
 * A negative result here (validCandidate: false, or the call degrading to
 * empty) is a real, honest "still can't verify this" -- weak stays weak,
 * that's the correct outcome, not a bug.
 */

const CLASSIFY_TIMEOUT_MS = 8_000;

export interface RelationshipVerificationResult {
  relationshipsChecked: number;
  relationshipsUpgraded: number;
  warnings: string[];
}

export async function verifyEntityRelationships(params: {
  entity: EntityRow;
  businessId: string;
  /** Brands THIS scan resolved -- verification only ever re-checks relationships within the scan that originally discovered them, never every brand this entity has ever touched globally. */
  scanBrandIds: Set<string>;
  businessContext: BusinessContext;
  intent: PartnerTypeIntent;
  signal: AbortSignal;
}): Promise<RelationshipVerificationResult> {
  const { entity, businessId, scanBrandIds, businessContext, intent, signal } = params;
  const warnings: string[] = [];

  const relationships = await getRelationshipsForEntity(entity.id);
  const unverified = relationships
    .filter((r) => !r.verified && r.target_brand_id && scanBrandIds.has(r.target_brand_id))
    .slice(0, DEEP_DISCOVERY_LIMITS.maxRelationshipsPerVerificationJob);

  let relationshipsUpgraded = 0;

  for (const relationship of unverified) {
    // Job-level budget already exceeded -- stop checking further
    // relationships; any already upgraded above stay upgraded.
    if (signal.aborted) {
      warnings.push(`stopped early after checking ${relationshipsUpgraded} of ${unverified.length} relationships -- job budget exceeded`);
      break;
    }
    try {
      const brand = await getBrandById(relationship.target_brand_id as string);
      if (!brand) continue;

      const evidenceRows = await getEvidenceForRelationship(relationship.id);
      if (evidenceRows.length === 0) continue;

      // The most recently discovered piece of evidence is the representative
      // text to re-classify -- the same "one strongest/latest piece of
      // evidence stands for the relationship" concept Candidate.sourceUrl
      // already uses at initial discovery time.
      const representative = evidenceRows.reduce((latest, row) =>
        new Date(row.discovered_at).getTime() > new Date(latest.discovered_at).getTime() ? row : latest
      );

      const item: SourceItem = {
        source: (representative.source_platform as SourceItem["source"]) ?? "Web",
        platform: representative.source_platform ?? "Web",
        title: representative.title ?? "",
        url: representative.url,
        profileUrl: null,
        snippet: representative.snippet ?? "",
      };

      const classified: ClassifiedResult[] = await withFallback(
        (s) => classifyResults([item], brand.name, brand.domain ?? "", businessContext, s, intent),
        CLASSIFY_TIMEOUT_MS,
        `relationship-verification classify (${entity.name} x ${brand.name})`,
        [] as ClassifiedResult[]
      );
      const result = classified[0];
      // AI reviewed the SAME persisted evidence and either said no, or the
      // call itself degraded to empty -- an honest "still unverified", never
      // treated as an error.
      if (!result || !result.validCandidate) continue;

      // ONE canonical qualification gate, never bypassed -- the SAME check
      // brandExpansion.ts applies at initial discovery. A re-classification
      // that flips this entity into a non-partner type must not persist an
      // upgrade either. ClassifiedResult omits a few Candidate fields
      // (sourceCount/contact/contactStatus, normally filled in by
      // dedupe.ts's cross-candidate merge) that qualifyOpportunity itself
      // never reads -- filled in here with honest single-source defaults
      // rather than widening ClassifiedResult's own shape for one caller.
      const candidateForQualification: Candidate = { ...result, sourceCount: 1, contact: null, contactStatus: "not_attempted" };
      const qualification = qualifyOpportunity(candidateForQualification);
      if (qualification.finalClassification !== "potential_partner") continue;

      // verified = relationships.verified OR excluded.verified at the SQL
      // level (see upsert_relationship) -- this can only strengthen an
      // already-persisted relationship, never demote it.
      await upsertRelationship({
        sourceEntityId: entity.id,
        targetBrandId: brand.id,
        relationshipType: result.relationshipDirection,
        relationshipDirection: result.relationshipDirection,
        signalStrength: result.signalStrength,
        confidence: result.confidence,
        verified: result.verified,
      });

      const distinctBrandCount = await countDistinctBrandsForEntity(entity.id);
      const geographicFit = assessGeographicFit(result.evidence, businessContext.market);
      const deepFit = computeDeepFitScore({
        baseFitScore: result.fitScore,
        distinctBrandCount,
        evidenceCount: Math.max(evidenceRows.length, 1),
      });
      const tier = deepQualityTier(deepFit, result.evidenceConfidence);

      await upsertOpportunity({
        businessId,
        entityId: entity.id,
        partnerType: result.type,
        primaryRole: result.type,
        potentialRelationship: result.potentialRelationship,
        relationshipDirection: result.relationshipDirection,
        geographicFit,
        partnraFit: deepFit,
        evidenceConfidence: result.evidenceConfidence,
        recruitability: "recruitable",
        actionability: result.applicationUrl ? "application_route_found" : "no_route_yet",
        qualityTier: tier,
      });
      relationshipsUpgraded++;
    } catch (err) {
      // One relationship's verification failing must not kill the rest of
      // this job's batch -- it stays exactly as unverified/weak as it
      // already honestly was, and the next scheduled attempt (if any
      // remain) can retry it.
      warnings.push(`relationship verification failed for ${entity.name} x ${relationship.target_brand_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { relationshipsChecked: unverified.length, relationshipsUpgraded, warnings };
}

export type { BusinessContext, PartnerTypeIntent };
