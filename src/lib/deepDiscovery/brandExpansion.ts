import { discoverFromWeb, discoverFromQueries } from "../discovery/sources/web";
import { discoverFromOpenAI } from "../discovery/sources/openai";
import { discoverFromYoutube } from "../discovery/sources/youtube";
import {
  classifyResults,
  scoreUnverified,
  sampleAcrossSources,
  MAX_CLASSIFY_INPUT,
  BusinessContext,
  PartnerTypeIntent,
} from "../discovery/classify";
import { dedupeCandidates } from "../discovery/dedupe";
import { flagCompetitorOwnedInfrastructure, isSameRegistrableDomain, assessGeographicFit } from "../discovery/entity";
import { qualifyOpportunity } from "../discovery/qualification";
import { SourceItem, ClassifiedResult, Candidate } from "../discovery/types";
import { withFallback, raceWithTimeout } from "../discovery/timeout";
import { computeDeepFitScore, deepQualityTier } from "./fitV2";
import { DEEP_DISCOVERY_LIMITS } from "./limits";
import {
  upsertEntity,
  upsertRelationship,
  upsertEvidence,
  upsertOpportunity,
  countDistinctBrandsForEntity,
} from "../graph/repository";
import { BrandRow } from "../graph/types";

/**
 * The "one relationship hop deeper" (Section 10): given a resolved
 * comparable Brand, discover WHO actually promotes/distributes/resells/
 * refers to it -- reusing the EXACT same discovery+classification+dedup+
 * qualification pipeline Quick Scan already uses for its one resolved
 * competitor (discoverFromWeb/OpenAI/YouTube -> classifyResults ->
 * dedupeCandidates -> qualifyOpportunity), just run per-brand across many
 * more brands, in the background, with more generous timeouts. Deep
 * Discovery NEVER re-implements this classification logic separately --
 * that would risk silently drifting from Quick Scan's own quality bar,
 * exactly what the regression-protected-baseline rule forbids.
 */

const SOURCE_TIMEOUT_MS = 8_000;
const CLASSIFY_TIMEOUT_MS = 10_000;

/**
 * discoverFromWeb/OpenAI/YouTube already search for the brand generically
 * (the same queries Quick Scan uses for its one resolved competitor) --
 * that finds topical mentions, but Deep Discovery specifically wants
 * evidence of a COMMERCIAL relationship, not just a page that discusses
 * the brand. These are generic commission/affiliate-ecosystem terms, not
 * tied to any product category -- the same vocabulary applies whether the
 * brand sells supplements, software, or anything else sold through
 * affiliates/referrals. Grouped into a few short OR-queries (never one
 * giant boolean query, and never every term every time) to stay within a
 * sane per-brand query-count budget.
 */
const COMMERCIAL_RELATIONSHIP_QUERY_GROUPS: string[][] = [
  ["affiliate", "affiliate disclosure", "affiliate program", "partner program", "referral program"],
  ["promo code", "discount code", "coupon code", "creator code", "commission"],
  ["review", "product review", "best alternatives", "comparison", "recommended products", "sponsored", "ambassador", "where to buy"],
];

/** Adapts the generic vocabulary to THIS brand and (when known) THIS business's category -- never a hardcoded product category. */
function buildCommercialRelationshipQueries(brandName: string, category: string | null): string[] {
  return COMMERCIAL_RELATIONSHIP_QUERY_GROUPS.map((group) => {
    const terms = group.map((term) => `"${term}"`).join(" OR ");
    return category ? `"${brandName}" ${category} (${terms})` : `"${brandName}" (${terms})`;
  });
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/**
 * Discovery-STRATEGY tag (see SourceItem.discoveryOrigin) for each of the
 * four searches this function runs -- "web-generic"/"web-commercial" are
 * deliberately distinct even though both persist as the SAME customer-facing
 * sourcePlatform ("Web") later; see classify.ts's sampleAcrossSources for why
 * this split exists (fair per-strategy AI-verification-budget sampling).
 */
export type DiscoveryOrigin = "web-generic" | "web-commercial" | "openai" | "youtube";

/**
 * Tags each item with a discoveryOrigin distinct from its customer-facing
 * `source`/`platform` (both web-generic and web-commercial persist as
 * sourcePlatform "Web" later -- see SourceItem.discoveryOrigin) so
 * sampleAcrossSources gives each of the four QUERY STRATEGIES its own fair
 * round-robin slot, rather than letting the two Web strategies compete as
 * one collapsed bucket against YouTube/OpenAI's single strategy each.
 * Exported for direct unit testing (see brandExpansion.test.ts) -- never
 * mutates its input, never changes `source`/`platform`.
 */
export function tagOrigin(items: SourceItem[], discoveryOrigin: DiscoveryOrigin): SourceItem[] {
  return items.map((item) => ({ ...item, discoveryOrigin }));
}

export function tallyByOrigin(items: SourceItem[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const item of items) {
    const key = item.discoveryOrigin ?? item.source;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return tally;
}

/**
 * Internal observability only (Section: silent degradation must stop) --
 * never customer-facing. Rides along in discovery_jobs.progress (see
 * worker.ts) so a real deployed scan's origin-fairness and overflow rate is
 * queryable after the fact without guessing from aggregate counters alone.
 */
export interface OriginTelemetry {
  discoveredByOrigin: Record<string, number>;
  sentToVerificationByOrigin: Record<string, number>;
  overflowedByOrigin: Record<string, number>;
  /** The batch AI classification call for this brand's sampled input failed/timed out -- the whole sampled batch fell back to scoreUnverified, not just the overflow. */
  classifyCallFailed: boolean;
}

export interface BrandExpansionResult {
  itemsSearched: number;
  entitiesUpserted: number;
  relationshipsUpserted: number;
  opportunitiesUpserted: number;
  /** Entity ids that got a fresh Opportunity from THIS run -- what worker.ts uses to decide which entities are worth a bounded entity-expansion / contact-enrichment follow-up job (never every touched entity, only ones already worth showing). */
  opportunityEntityIds: string[];
  /**
   * Entity ids whose Opportunity was persisted as quality_tier "weak" SOLELY
   * because the underlying candidate was never AI-verified (overflowed the
   * classification budget, or the whole batch call failed) -- NOT because
   * its actual signal is weak (see limits.ts's overflowVerificationMinFit).
   * worker.ts uses this to enqueue a bounded relationship_verification
   * follow-up job so these aren't permanently mislabeled just because they
   * were candidate #16 (Section: overflow must not equal "throw away").
   */
  entitiesNeedingVerification: string[];
  telemetry: OriginTelemetry;
  warnings: string[];
}

export async function expandBrandRelationships(params: {
  businessId: string;
  brand: BrandRow;
  businessContext: BusinessContext;
  intent: PartnerTypeIntent;
  signal: AbortSignal;
}): Promise<BrandExpansionResult> {
  const { businessId, brand, businessContext, intent, signal } = params;
  const warnings: string[] = [];
  const concepts = businessContext.commercialIntentConcepts;
  const brandDomain = brand.domain ?? "";

  const commercialRelationshipQueries = buildCommercialRelationshipQueries(brand.name, businessContext.category);
  const [webResult, openaiResult, youtubeResult, commercialResult] = await Promise.all([
    withFallback((s) => discoverFromWeb(brand.name, brandDomain, s, concepts), SOURCE_TIMEOUT_MS, `web (${brandDomain})`, [] as SourceItem[]),
    withFallback((s) => discoverFromOpenAI(brand.name, s, concepts), SOURCE_TIMEOUT_MS, `openai (${brandDomain})`, [] as SourceItem[]),
    withFallback((s) => discoverFromYoutube(brand.name, s, concepts), SOURCE_TIMEOUT_MS, `youtube (${brandDomain})`, [] as SourceItem[]),
    withFallback(
      (s) => discoverFromQueries(commercialRelationshipQueries, s),
      SOURCE_TIMEOUT_MS,
      `commercial-relationship search (${brandDomain})`,
      [] as SourceItem[]
    ),
  ]);
  const combined: SourceItem[] = [
    ...tagOrigin(webResult, "web-generic"),
    ...tagOrigin(openaiResult, "openai"),
    ...tagOrigin(youtubeResult, "youtube"),
    ...tagOrigin(commercialResult, "web-commercial"),
  ];

  const pool: SourceItem[] = [];
  const seenUrls = new Set<string>();
  for (const item of combined) {
    const host = hostnameOf(item.url);
    if (!host) continue;
    if (brandDomain && isSameRegistrableDomain(host, brandDomain)) continue;
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    pool.push(item);
    if (pool.length >= DEEP_DISCOVERY_LIMITS.maxSearchResultsPerBrand) break;
  }

  const discoveredByOrigin = tallyByOrigin(pool);
  if (pool.length === 0) {
    return {
      itemsSearched: combined.length,
      entitiesUpserted: 0,
      relationshipsUpserted: 0,
      opportunitiesUpserted: 0,
      opportunityEntityIds: [],
      entitiesNeedingVerification: [],
      telemetry: { discoveredByOrigin, sentToVerificationByOrigin: {}, overflowedByOrigin: {}, classifyCallFailed: false },
      warnings,
    };
  }

  const classifyInput = sampleAcrossSources(pool, Math.min(MAX_CLASSIFY_INPUT, DEEP_DISCOVERY_LIMITS.maxEntitiesSentToAiVerificationPerBrand));
  const overflow = pool.filter((i) => !classifyInput.includes(i));
  const sentToVerificationByOrigin = tallyByOrigin(classifyInput);
  const overflowedByOrigin = tallyByOrigin(overflow);
  const categoryPhrases = [businessContext.category, ...concepts].filter((p): p is string => !!p);

  let classifyCallFailed = false;
  let classified: ClassifiedResult[];
  try {
    classified = await raceWithTimeout(
      (s) => classifyResults(classifyInput, brand.name, brandDomain, businessContext, s, intent),
      CLASSIFY_TIMEOUT_MS,
      `classify (${brandDomain})`,
      signal
    );
  } catch (err) {
    // One provider/model failure must not kill the whole job -- degrade to
    // the same deterministic, honestly-unverified fallback Quick Scan uses,
    // over the FULL pool (never just drop what didn't reach the AI call).
    warnings.push(`AI classification failed/timed out for ${brand.name}: ${err instanceof Error ? err.message : String(err)}`);
    classifyCallFailed = true;
    classified = scoreUnverified(pool, { intent, market: businessContext.market, businessModel: businessContext.businessModel });
  }
  // Overflow items never sent to the AI classifier still get an honest,
  // clearly-unverified deterministic score -- real discovered signal is
  // never simply discarded. (Not double-scored when the whole batch call
  // above already failed and scored the FULL pool, overflow included.)
  if (overflow.length > 0 && !classifyCallFailed) {
    classified = [
      ...classified,
      ...scoreUnverified(overflow, { categoryPhrases, intent, market: businessContext.market, businessModel: businessContext.businessModel }),
    ];
  }
  const telemetry: OriginTelemetry = { discoveredByOrigin, sentToVerificationByOrigin, overflowedByOrigin, classifyCallFailed };
  console.log(
    JSON.stringify({ stage: "deep_discovery_origin_sampling", brandId: brand.id, brandName: brand.name, ...telemetry })
  );

  let deduped = dedupeCandidates(classified, intent, businessContext.market, businessContext.businessModel);
  if (brandDomain) {
    deduped = flagCompetitorOwnedInfrastructure(deduped, { name: brand.name, domain: brandDomain });
  }

  let entitiesUpserted = 0;
  let relationshipsUpserted = 0;
  let opportunitiesUpserted = 0;
  const opportunityEntityIds: string[] = [];
  const entitiesNeedingVerification = new Set<string>();

  for (const candidate of deduped) {
    // The job-level budget (see worker.ts's JOB_TIMEOUT_MS) has already
    // elapsed -- stop persisting further candidates and return whatever
    // real progress was already made, rather than continuing to churn
    // past the job's own intended budget. Every candidate already
    // persisted above stays persisted; this just stops adding more.
    if (signal.aborted) {
      warnings.push(`stopped early after ${entitiesUpserted} of ${deduped.length} candidates -- job budget exceeded`);
      break;
    }
    if (!candidate.name || !candidate.type) continue; // no resolvable entity identity -- never persisted as a "partner" (see qualification.ts's own identical rule)

    try {
      const entityDomain = hostnameOf(candidate.profileUrl) ?? hostnameOf(candidate.sourceUrl);
      const entity = await upsertEntity({
        name: candidate.name,
        domain: entityDomain,
        entityType: candidate.type,
        primaryRole: candidate.type,
        applicationUrl: candidate.applicationUrl,
        metadata: { lastEvidenceSample: candidate.evidence.slice(0, 500) },
      });
      entitiesUpserted++;

      const relationship = await upsertRelationship({
        sourceEntityId: entity.id,
        targetBrandId: brand.id,
        relationshipType: candidate.relationshipDirection,
        relationshipDirection: candidate.relationshipDirection,
        signalStrength: candidate.signalStrength,
        confidence: candidate.confidence,
        verified: candidate.verified,
      });
      relationshipsUpserted++;

      await upsertEvidence({
        relationshipId: relationship.id,
        entityId: entity.id,
        brandId: brand.id,
        url: candidate.sourceUrl,
        sourcePlatform: candidate.platform,
        snippet: candidate.evidence,
        evidenceType: candidate.evidenceType ?? undefined,
        evidenceConfidence: candidate.evidenceConfidence,
      });

      // ONE canonical qualification gate -- the SAME qualifyOpportunity
      // Quick Scan uses, never bypassed. Competitor-owned infrastructure,
      // an evidence source, or a comparable business without a real
      // potentialRelationship never becomes an Opportunity here either
      // (Section 29: a brand operating its own program is intelligence,
      // not automatically a lead) -- it's still persisted as an
      // Entity+Relationship+Evidence above (real graph intelligence), just
      // never surfaced as something to contact.
      const qualification = qualifyOpportunity(candidate as Candidate);
      if (qualification.finalClassification !== "potential_partner") continue;
      // A templated/doorway SEO-network member (see dedupe.ts's
      // flagDuplicateEvidenceNetworks) is still real graph intelligence --
      // the entity/relationship/evidence above are kept -- but never
      // becomes an Opportunity a user would be pointed at.
      if (candidate.similarEvidenceNetwork) continue;

      const distinctBrandCount = await countDistinctBrandsForEntity(entity.id);
      const geographicFit = assessGeographicFit(candidate.evidence, businessContext.market);
      const deepFit = computeDeepFitScore({
        baseFitScore: candidate.fitScore,
        distinctBrandCount,
        evidenceCount: candidate.sourceCount,
      });
      const tier = deepQualityTier(deepFit, candidate.evidenceConfidence);

      // This candidate was never AI-verified (overflowed the classification
      // budget, or the whole batch call failed) -- see
      // evidenceConfidenceLabel's unconditional "weak" whenever !verified --
      // but its OWN deterministic fitScore already clears the "good" floor,
      // meaning verification alone (not a better fitScore) is the only thing
      // standing between it and its real tier. Queue it for a bounded
      // relationship_verification follow-up rather than leaving today's
      // cost-control sampling outcome as its permanent, final label.
      if (!candidate.verified && deepFit >= DEEP_DISCOVERY_LIMITS.overflowVerificationMinFit) {
        entitiesNeedingVerification.add(entity.id);
      }

      await upsertOpportunity({
        businessId,
        entityId: entity.id,
        partnerType: candidate.type,
        primaryRole: candidate.type,
        potentialRelationship: candidate.potentialRelationship,
        relationshipDirection: candidate.relationshipDirection,
        geographicFit,
        partnraFit: deepFit,
        evidenceConfidence: candidate.evidenceConfidence,
        recruitability: "recruitable",
        actionability: candidate.applicationUrl ? "application_route_found" : "no_route_yet",
        qualityTier: tier,
      });
      opportunitiesUpserted++;
      opportunityEntityIds.push(entity.id);
    } catch (err) {
      warnings.push(`persistence failed for candidate "${candidate.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    itemsSearched: combined.length,
    entitiesUpserted,
    relationshipsUpserted,
    opportunitiesUpserted,
    opportunityEntityIds,
    entitiesNeedingVerification: Array.from(entitiesNeedingVerification),
    telemetry,
    warnings,
  };
}
