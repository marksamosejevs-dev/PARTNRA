import { BusinessProfile, buildBusinessContext, buildPartnerTypeIntent } from "../discovery/business";
import { resolveCompetitorDomain } from "../discovery/competitors";
import { expandComparableBrandNames, resolveComparableBrands } from "./comparableBrands";
import { expandBrandRelationships } from "./brandExpansion";
import { expandEntityAcrossBrands } from "./entityExpansion";
import { enrichEntityContact } from "./contactEnrichment";
import { selectDeepPreviewCandidate } from "./preview";
import { computeDeepFitScore, deepQualityTier } from "./fitV2";
import { DEEP_DISCOVERY_LIMITS } from "./limits";
import {
  claimNextJob,
  completeJob,
  failJob,
  getScan,
  getBusinessById,
  getBrandById,
  getEntityById,
  upsertBrand,
  linkScanBrand,
  getBrandsForScan,
  createDiscoveryJobs,
  incrementScanCounters,
  appendScanWarning,
  countJobsByStatus,
  countJobsByType,
  updateScan,
  updateEntityContact,
  getRelationshipsForEntity,
  getOpportunitiesForBusiness,
  countDistinctBrandsForEntity,
  upsertOpportunity,
} from "../graph/repository";
import { DiscoveryJobRow } from "../graph/types";

/**
 * Job dispatcher (Section 6-7, 21-22). Deliberately bounded per job (see
 * JOB_TIMEOUT_MS) so a single worker tick (see
 * netlify/functions/deep-discovery-worker.ts) always returns well inside
 * a normal function timeout, however many jobs it drains -- real progress
 * is persisted after EVERY job, not just at the end, so the user can
 * leave and return later and see it, and so a mid-run failure never loses
 * work already done.
 */

export class WorkerJobError extends Error {}

const JOB_TIMEOUT_MS = 45_000;

async function loadProfile(businessId: string): Promise<{ profile: BusinessProfile; businessId: string }> {
  const business = await getBusinessById(businessId);
  if (!business || !business.partner_intent_profile) {
    throw new WorkerJobError(`business ${businessId} has no stored Partner Intent Profile`);
  }
  return { profile: business.partner_intent_profile as unknown as BusinessProfile, businessId: business.id };
}

async function runComparableBrandExpansion(job: DiscoveryJobRow, signal: AbortSignal): Promise<Record<string, unknown>> {
  const scan = await getScan(job.scan_id);
  if (!scan) throw new WorkerJobError(`scan ${job.scan_id} not found`);
  const { profile } = await loadProfile(scan.business_id);

  const existingNames = profile.competitorNames;
  const [resolvedExisting, extraNames] = await Promise.all([
    Promise.all(existingNames.map((name) => resolveCompetitorDomain(name, signal))),
    expandComparableBrandNames(profile, existingNames, signal).catch(() => {
      // A follow-up "give me more names" AI call failing must not kill the
      // whole scan -- the scan still proceeds with whatever the ORIGINAL
      // (already-verified) Partner Intent Profile competitor names resolve to.
      return [] as string[];
    }),
  ]);
  const resolvedExtra = await resolveComparableBrands(extraNames, signal);

  const seenDomains = new Set<string>();
  const allResolved = [...resolvedExisting.filter((r): r is NonNullable<typeof r> => r !== null), ...resolvedExtra].filter((r) => {
    if (seenDomains.has(r.domain)) return false;
    seenDomains.add(r.domain);
    return true;
  });
  const bounded = allResolved.slice(0, DEEP_DISCOVERY_LIMITS.maxComparableBrands);

  const brands = await Promise.all(
    bounded.map((r) =>
      upsertBrand({ name: r.name, domain: r.domain, category: profile.category, market: profile.market }).then(async (brand) => {
        await linkScanBrand(job.scan_id, brand.id);
        return brand;
      })
    )
  );

  await updateScan(job.scan_id, { comparable_brands_target: brands.length, status: "running", started_at: scan.started_at ?? new Date().toISOString() });

  if (brands.length > 0) {
    await createDiscoveryJobs(brands.map((b) => ({ scanId: job.scan_id, jobType: "brand_relationship_expansion" as const, targetId: b.id })));
  }

  return { brandsResolved: brands.length };
}

async function runBrandRelationshipExpansion(job: DiscoveryJobRow, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!job.target_id) throw new WorkerJobError("brand_relationship_expansion job has no target_id");
  const scan = await getScan(job.scan_id);
  if (!scan) throw new WorkerJobError(`scan ${job.scan_id} not found`);
  const brand = await getBrandById(job.target_id);
  if (!brand) throw new WorkerJobError(`brand ${job.target_id} not found`);
  const { profile, businessId } = await loadProfile(scan.business_id);
  const businessContext = buildBusinessContext(profile);
  const intent = buildPartnerTypeIntent(profile);

  const result = await expandBrandRelationships({ businessId, brand, businessContext, intent, signal });

  await incrementScanCounters(job.scan_id, {
    comparableBrandsAnalysed: 1,
    signalsReviewed: result.itemsSearched,
    entityCount: result.entitiesUpserted,
    relationshipCount: result.relationshipsUpserted,
    opportunityCount: result.opportunitiesUpserted,
  });
  for (const warning of result.warnings) await appendScanWarning(job.scan_id, warning);

  // Bounded follow-up jobs (Section 34: one hop, configurable max) --
  // only for entities that ALREADY earned a real Opportunity from this
  // brand, and only while the scan-wide caps still have room.
  const followUps: Array<{ scanId: string; jobType: "entity_expansion" | "contact_enrichment"; targetId: string }> = [];
  const [entityExpansionCount, contactEnrichmentCount] = await Promise.all([
    countJobsByType(job.scan_id, "entity_expansion"),
    countJobsByType(job.scan_id, "contact_enrichment"),
  ]);
  let entityExpansionsToAdd = Math.max(DEEP_DISCOVERY_LIMITS.maxEntityExpansionsPerScan - entityExpansionCount, 0);
  let contactEnrichmentsToAdd = Math.max(DEEP_DISCOVERY_LIMITS.maxContactEnrichmentsPerScan - contactEnrichmentCount, 0);

  for (const entityId of result.opportunityEntityIds) {
    if (entityExpansionsToAdd > 0) {
      followUps.push({ scanId: job.scan_id, jobType: "entity_expansion", targetId: entityId });
      entityExpansionsToAdd--;
    }
    if (contactEnrichmentsToAdd > 0) {
      followUps.push({ scanId: job.scan_id, jobType: "contact_enrichment", targetId: entityId });
      contactEnrichmentsToAdd--;
    }
  }
  if (followUps.length > 0) await createDiscoveryJobs(followUps);

  return result as unknown as Record<string, unknown>;
}

async function runEntityExpansion(job: DiscoveryJobRow, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!job.target_id) throw new WorkerJobError("entity_expansion job has no target_id");
  const scan = await getScan(job.scan_id);
  if (!scan) throw new WorkerJobError(`scan ${job.scan_id} not found`);
  const entity = await getEntityById(job.target_id);
  if (!entity) throw new WorkerJobError(`entity ${job.target_id} not found`);
  const { profile, businessId } = await loadProfile(scan.business_id);
  const businessContext = buildBusinessContext(profile);
  const intent = buildPartnerTypeIntent(profile);

  const [scanBrands, existingRelationships] = await Promise.all([
    getBrandsForScan(job.scan_id),
    getRelationshipsForEntity(entity.id),
  ]);
  const alreadyLinkedBrandIds = new Set(existingRelationships.map((r) => r.target_brand_id).filter((id): id is string => !!id));
  const candidateBrands = scanBrands.filter((b) => !alreadyLinkedBrandIds.has(b.id));

  const result = await expandEntityAcrossBrands({ entity, candidateBrands, businessContext, intent, signal });
  for (const warning of result.warnings) await appendScanWarning(job.scan_id, warning);

  if (result.newRelationshipsFound > 0) {
    // Cross-brand corroboration just changed for this entity -- recompute
    // its Fit V2/tier and refresh the Opportunity (upsert_opportunity
    // never resets a customer's own status, see the migration).
    const distinctBrandCount = await countDistinctBrandsForEntity(entity.id);
    const opportunities = await getOpportunitiesForBusiness(businessId);
    const existing = opportunities.find((o) => o.entity_id === entity.id);
    if (existing) {
      const deepFit = computeDeepFitScore({ baseFitScore: existing.partnra_fit, distinctBrandCount, evidenceCount: distinctBrandCount });
      const tier = deepQualityTier(deepFit, existing.evidence_confidence);
      await upsertOpportunity({
        businessId,
        entityId: entity.id,
        partnerType: existing.partner_type,
        primaryRole: existing.primary_role,
        potentialRelationship: existing.potential_relationship,
        relationshipDirection: existing.relationship_direction,
        geographicFit: existing.geographic_fit,
        partnraFit: deepFit,
        evidenceConfidence: existing.evidence_confidence,
        recruitability: existing.recruitability,
        actionability: existing.actionability,
        qualityTier: tier,
      });
      await incrementScanCounters(job.scan_id, { relationshipCount: result.newRelationshipsFound });
    }
  }

  return result as unknown as Record<string, unknown>;
}

async function runContactEnrichment(job: DiscoveryJobRow): Promise<Record<string, unknown>> {
  if (!job.target_id) throw new WorkerJobError("contact_enrichment job has no target_id");
  const entity = await getEntityById(job.target_id);
  if (!entity) throw new WorkerJobError(`entity ${job.target_id} not found`);

  const { contact, contactPage } = await enrichEntityContact(entity);
  if (contact || contactPage) {
    await updateEntityContact(entity.id, { publicContact: contact, contactPage });
  }
  return { contactFound: !!contact };
}

async function dispatchJob(job: DiscoveryJobRow, signal: AbortSignal): Promise<Record<string, unknown>> {
  switch (job.job_type) {
    case "comparable_brand_expansion":
      return runComparableBrandExpansion(job, signal);
    case "brand_relationship_expansion":
      return runBrandRelationshipExpansion(job, signal);
    case "entity_expansion":
      return runEntityExpansion(job, signal);
    case "contact_enrichment":
      return runContactEnrichment(job);
    default:
      throw new WorkerJobError(`unknown job_type "${job.job_type}"`);
  }
}

/**
 * Once no job is queued or running for a scan, decide the FINAL outcome:
 * pick the previewCandidate (Section 23-26) and mark the scan completed
 * (or completed_with_warnings if any job failed along the way -- Section
 * 36: one provider failure must never discard everything else that
 * succeeded).
 */
async function maybeFinalizeScan(scanId: string): Promise<void> {
  const counts = await countJobsByStatus(scanId);
  if (counts.queued > 0 || counts.running > 0) return;

  const scan = await getScan(scanId);
  if (!scan || scan.status === "completed" || scan.status === "completed_with_warnings") return;

  const opportunities = await getOpportunitiesForBusiness(scan.business_id);
  const decision = await selectDeepPreviewCandidate(opportunities);

  await updateScan(scanId, {
    status: (scan.warnings?.length ?? 0) > 0 || counts.failed > 0 ? "completed_with_warnings" : "completed",
    completed_at: new Date().toISOString(),
    preview_entity_id: decision.opportunity?.entity_id ?? null,
    preview_score: null,
    preview_selection_reason: decision.reason,
  });
}

/** Claims and processes exactly one job, or returns processed:false if the queue is empty. Never throws -- a failed job is recorded (failJob + a scan warning) and reported back, not propagated. */
export async function processNextJob(): Promise<{ processed: boolean; jobType?: string; error?: string }> {
  const job = await claimNextJob(DEEP_DISCOVERY_LIMITS.maxJobAttempts);
  if (!job) return { processed: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
  try {
    const progress = await dispatchJob(job, controller.signal);
    await completeJob(job.id, progress);
    await maybeFinalizeScan(job.scan_id);
    return { processed: true, jobType: job.job_type };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await failJob(job.id, message);
      await appendScanWarning(job.scan_id, `${job.job_type} failed: ${message}`);
      await maybeFinalizeScan(job.scan_id);
    } catch {
      // Best-effort bookkeeping only -- the job's own failure is the real
      // signal; a failure while RECORDING that failure must not throw and
      // crash the worker tick loop.
    }
    return { processed: true, jobType: job.job_type, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** One bounded worker tick -- drains up to maxJobs jobs, then returns. Called by the Netlify Scheduled Function (and safe to call from anywhere else that wants to nudge the queue, e.g. a manual "check now" trigger). */
export async function runWorkerTick(maxJobs: number = DEEP_DISCOVERY_LIMITS.maxJobsPerWorkerTick): Promise<{ jobsProcessed: number }> {
  let jobsProcessed = 0;
  for (let i = 0; i < maxJobs; i++) {
    const result = await processNextJob();
    if (!result.processed) break;
    jobsProcessed++;
  }
  return { jobsProcessed };
}
