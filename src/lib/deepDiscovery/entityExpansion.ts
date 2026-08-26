import { discoverFromQueries } from "../discovery/sources/web";
import { classifyResults, BusinessContext, PartnerTypeIntent } from "../discovery/classify";
import { withFallback } from "../discovery/timeout";
import { SourceItem, ClassifiedResult } from "../discovery/types";
import { upsertRelationship, upsertEvidence } from "../graph/repository";
import { EntityRow, BrandRow } from "../graph/types";

/**
 * The OPPOSITE traversal direction from brandExpansion.ts (Section 11):
 * given an already-resolved Entity, check whether it ALSO shows real
 * commercial engagement with OTHER comparable brands this scan already
 * knows about. An entity independently connected to 3 comparable brands
 * is substantially stronger evidence than one keyword hit -- this is what
 * populates that cross-brand corroboration count (see fitV2.ts).
 *
 * Reuses classifyResults (the SAME real-evidence bar Quick Scan applies
 * to a named-brand relationship) rather than a laxer check -- a paired
 * "entity name" + "brand name" search finding SOMETHING is not itself
 * proof of a relationship; only a validCandidate:true classification
 * above a real confidence bar creates a new relationship.
 */

const SOURCE_TIMEOUT_MS = 6_000;
const CLASSIFY_TIMEOUT_MS = 8_000;
const MIN_CONFIDENCE_FOR_NEW_RELATIONSHIP = 70;
/** Bounded per entity-expansion job -- this is one hop, not a combinatorial crawl across every brand ever seen. */
const PER_JOB_BRAND_CHECK_CAP = 5;

export interface EntityExpansionResult {
  brandsChecked: number;
  newRelationshipsFound: number;
  warnings: string[];
}

export async function expandEntityAcrossBrands(params: {
  entity: EntityRow;
  /** Brands this entity is NOT already known to be connected to -- the caller (worker.ts) is responsible for that filtering, so this module only ever spends budget on genuinely new pairs. */
  candidateBrands: BrandRow[];
  businessContext: BusinessContext;
  intent: PartnerTypeIntent;
  signal: AbortSignal;
}): Promise<EntityExpansionResult> {
  const { entity, candidateBrands, businessContext, intent } = params;
  const warnings: string[] = [];
  const brandsToCheck = candidateBrands.slice(0, PER_JOB_BRAND_CHECK_CAP);
  let newRelationshipsFound = 0;

  for (const brand of brandsToCheck) {
    try {
      const query = `"${entity.name}" "${brand.name}"`;
      const items = await withFallback(
        (s) => discoverFromQueries([query], s),
        SOURCE_TIMEOUT_MS,
        `entity-expansion search (${entity.name} x ${brand.name})`,
        [] as SourceItem[]
      );
      if (items.length === 0) continue;

      const classified = await withFallback(
        (s) => classifyResults(items.slice(0, 5), brand.name, brand.domain ?? "", businessContext, s, intent),
        CLASSIFY_TIMEOUT_MS,
        `entity-expansion classify (${entity.name} x ${brand.name})`,
        [] as ClassifiedResult[]
      );
      const valid = classified
        .filter((c) => c.validCandidate && c.confidence >= MIN_CONFIDENCE_FOR_NEW_RELATIONSHIP)
        .sort((a, b) => b.confidence - a.confidence);
      if (valid.length === 0) continue;

      const best = valid[0];
      const relationship = await upsertRelationship({
        sourceEntityId: entity.id,
        targetBrandId: brand.id,
        relationshipType: best.relationshipDirection,
        relationshipDirection: best.relationshipDirection,
        signalStrength: best.signalStrength,
        confidence: best.confidence,
        verified: best.verified,
      });
      await upsertEvidence({
        relationshipId: relationship.id,
        entityId: entity.id,
        brandId: brand.id,
        url: best.sourceUrl,
        sourcePlatform: best.platform,
        snippet: best.evidence,
        evidenceType: best.evidenceType ?? undefined,
        evidenceConfidence: best.evidenceConfidence,
      });
      newRelationshipsFound++;
    } catch (err) {
      warnings.push(`entity expansion failed for ${entity.name} x ${brand.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { brandsChecked: brandsToCheck.length, newRelationshipsFound, warnings };
}
