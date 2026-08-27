import { getGraphClient } from "./client";
import { graphIdentityKey } from "./normalize";
import {
  BusinessRow,
  BrandRow,
  EntityRow,
  RelationshipRow,
  EvidenceRow,
  OpportunityRow,
  ScanRow,
  DiscoveryJobRow,
  DiscoveryJobType,
} from "./types";

/**
 * Typed data-access layer over the Partnership Graph -- the ONLY module
 * that talks to Supabase directly. Every write that needs "don't lose
 * first_seen / don't demote an already-verified relationship / don't
 * silently reset a customer's opportunity status" semantics goes through
 * one of the atomic RPC functions in
 * supabase/migrations/0002_upsert_functions.sql, never a bare
 * `.upsert()`, which would blindly overwrite every column on conflict.
 */

export class GraphError extends Error {}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new GraphError(`${context}: ${result.error.message}`);
  if (result.data === null) throw new GraphError(`${context}: no row returned`);
  return result.data;
}

// ---------------------------------------------------------------- businesses

export async function upsertBusiness(input: {
  domain: string;
  name?: string | null;
  category?: string | null;
  businessModel?: string | null;
  targetMarket?: string | null;
  targetCustomers?: string | null;
  productsServices?: string | null;
  salesModel?: string | null;
  partnerIntentProfile?: Record<string, unknown> | null;
}): Promise<BusinessRow> {
  const supabase = getGraphClient();
  const result = await supabase
    .from("businesses")
    .upsert(
      {
        domain: input.domain,
        name: input.name ?? null,
        category: input.category ?? null,
        business_model: input.businessModel ?? null,
        target_market: input.targetMarket ?? null,
        target_customers: input.targetCustomers ?? null,
        products_services: input.productsServices ?? null,
        sales_model: input.salesModel ?? null,
        partner_intent_profile: input.partnerIntentProfile ?? null,
      },
      { onConflict: "domain" }
    )
    .select()
    .single();
  return unwrap(result, "upsertBusiness");
}

export async function getBusinessByDomain(domain: string): Promise<BusinessRow | null> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("businesses").select().eq("domain", domain).maybeSingle();
  if (error) throw new GraphError(`getBusinessByDomain: ${error.message}`);
  return data;
}

export async function getBusinessById(id: string): Promise<BusinessRow | null> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("businesses").select().eq("id", id).maybeSingle();
  if (error) throw new GraphError(`getBusinessById: ${error.message}`);
  return data;
}

// -------------------------------------------------------------------- brands

export async function upsertBrand(input: {
  name: string;
  domain?: string | null;
  category?: string | null;
  market?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<BrandRow> {
  const supabase = getGraphClient();
  const normalizedKey = graphIdentityKey({ domain: input.domain, name: input.name });
  const result = await supabase.rpc("upsert_brand", {
    p_name: input.name,
    p_normalized_key: normalizedKey,
    p_domain: input.domain ?? null,
    p_category: input.category ?? null,
    p_market: input.market ?? null,
    p_metadata: input.metadata ?? {},
  });
  return unwrap(result, "upsertBrand");
}

export async function getBrandById(id: string): Promise<BrandRow | null> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("brands").select().eq("id", id).maybeSingle();
  if (error) throw new GraphError(`getBrandById: ${error.message}`);
  return data;
}

/** Records that THIS scan resolved/discovered this brand -- see scan_brands migration. Safe to call repeatedly (primary key on the pair). */
export async function linkScanBrand(scanId: string, brandId: string): Promise<void> {
  const supabase = getGraphClient();
  const { error } = await supabase.from("scan_brands").upsert({ scan_id: scanId, brand_id: brandId });
  if (error) throw new GraphError(`linkScanBrand: ${error.message}`);
}

/** Only the brands THIS scan actually discovered -- never the entire global brand table across every customer's scans. */
export async function getBrandsForScan(scanId: string): Promise<BrandRow[]> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("scan_brands").select("brands(*)").eq("scan_id", scanId);
  if (error) throw new GraphError(`getBrandsForScan: ${error.message}`);
  return ((data ?? []) as unknown as Array<{ brands: BrandRow }>).map((row) => row.brands);
}

// ------------------------------------------------------------------ entities

export async function upsertEntity(input: {
  name: string;
  domain?: string | null;
  entityType?: string | null;
  primaryRole?: string | null;
  geography?: string | null;
  marketsServed?: string[];
  category?: string | null;
  publicContact?: string | null;
  contactPage?: string | null;
  applicationUrl?: string | null;
  socialProfiles?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<EntityRow> {
  const supabase = getGraphClient();
  const normalizedKey = graphIdentityKey({ domain: input.domain, name: input.name });
  const result = await supabase.rpc("upsert_entity", {
    p_name: input.name,
    p_normalized_key: normalizedKey,
    p_domain: input.domain ?? null,
    p_entity_type: input.entityType ?? null,
    p_primary_role: input.primaryRole ?? null,
    p_geography: input.geography ?? null,
    p_markets_served: input.marketsServed ?? [],
    p_category: input.category ?? null,
    p_public_contact: input.publicContact ?? null,
    p_contact_page: input.contactPage ?? null,
    p_application_url: input.applicationUrl ?? null,
    p_social_profiles: input.socialProfiles ?? {},
    p_metadata: input.metadata ?? {},
  });
  return unwrap(result, "upsertEntity");
}

export async function getEntityById(id: string): Promise<EntityRow | null> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("entities").select().eq("id", id).maybeSingle();
  if (error) throw new GraphError(`getEntityById: ${error.message}`);
  return data;
}

/** Direct by-id update -- unlike upsertEntity, this never needs to re-derive normalized_key since the row already exists and is already identified. */
export async function updateEntityContact(id: string, patch: { publicContact?: string | null; contactPage?: string | null }): Promise<void> {
  const supabase = getGraphClient();
  const update: Record<string, unknown> = {};
  if (patch.publicContact !== undefined) update.public_contact = patch.publicContact;
  if (patch.contactPage !== undefined) update.contact_page = patch.contactPage;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from("entities").update(update).eq("id", id);
  if (error) throw new GraphError(`updateEntityContact: ${error.message}`);
}

// ------------------------------------------------------------- relationships

export async function upsertRelationship(input: {
  sourceEntityId: string;
  targetBrandId?: string | null;
  targetEntityId?: string | null;
  relationshipType: string;
  relationshipDirection: string;
  signalStrength: string;
  confidence: number;
  verified: boolean;
  metadata?: Record<string, unknown>;
}): Promise<RelationshipRow> {
  const supabase = getGraphClient();
  const result = await supabase.rpc("upsert_relationship", {
    p_source_entity_id: input.sourceEntityId,
    p_target_brand_id: input.targetBrandId ?? null,
    p_target_entity_id: input.targetEntityId ?? null,
    p_relationship_type: input.relationshipType,
    p_relationship_direction: input.relationshipDirection,
    p_signal_strength: input.signalStrength,
    p_confidence: input.confidence,
    p_verified: input.verified,
    p_metadata: input.metadata ?? {},
  });
  return unwrap(result, "upsertRelationship");
}

/** Cross-brand corroboration -- how many DISTINCT comparable brands this entity is connected to. One of Deep Discovery's strongest ranking signals (see PARTNRA Fit V2): an entity connected to 3 comparable brands should rank materially above one with a single weak mention. */
export async function countDistinctBrandsForEntity(entityId: string): Promise<number> {
  const supabase = getGraphClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("target_brand_id")
    .eq("source_entity_id", entityId)
    .not("target_brand_id", "is", null);
  if (error) throw new GraphError(`countDistinctBrandsForEntity: ${error.message}`);
  return new Set((data ?? []).map((r) => r.target_brand_id)).size;
}

export async function getRelationshipsForEntity(entityId: string): Promise<RelationshipRow[]> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("relationships").select().eq("source_entity_id", entityId);
  if (error) throw new GraphError(`getRelationshipsForEntity: ${error.message}`);
  return data ?? [];
}

// ----------------------------------------------------------------- evidence

export async function upsertEvidence(input: {
  relationshipId: string;
  entityId?: string | null;
  brandId?: string | null;
  url: string;
  sourcePlatform?: string | null;
  title?: string | null;
  snippet?: string | null;
  evidenceType?: string | null;
  evidenceConfidence?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<EvidenceRow> {
  const supabase = getGraphClient();
  const result = await supabase.rpc("upsert_evidence", {
    p_relationship_id: input.relationshipId,
    p_entity_id: input.entityId ?? null,
    p_brand_id: input.brandId ?? null,
    p_url: input.url,
    p_source_platform: input.sourcePlatform ?? null,
    p_title: input.title ?? null,
    p_snippet: input.snippet ?? null,
    p_evidence_type: input.evidenceType ?? null,
    p_evidence_confidence: input.evidenceConfidence ?? null,
    p_metadata: input.metadata ?? {},
  });
  return unwrap(result, "upsertEvidence");
}

export async function getEvidenceForRelationship(relationshipId: string): Promise<EvidenceRow[]> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("evidence").select().eq("relationship_id", relationshipId);
  if (error) throw new GraphError(`getEvidenceForRelationship: ${error.message}`);
  return data ?? [];
}

// ------------------------------------------------------------- opportunities

export async function upsertOpportunity(input: {
  businessId: string;
  entityId: string;
  partnerType?: string | null;
  primaryRole?: string | null;
  potentialRelationship?: string | null;
  relationshipDirection: string;
  geographicFit: string;
  partnraFit: number;
  evidenceConfidence: string;
  recruitability?: string | null;
  actionability?: string | null;
  qualityTier: string;
}): Promise<OpportunityRow> {
  const supabase = getGraphClient();
  const result = await supabase.rpc("upsert_opportunity", {
    p_business_id: input.businessId,
    p_entity_id: input.entityId,
    p_partner_type: input.partnerType ?? null,
    p_primary_role: input.primaryRole ?? null,
    p_potential_relationship: input.potentialRelationship ?? null,
    p_relationship_direction: input.relationshipDirection,
    p_geographic_fit: input.geographicFit,
    p_partnra_fit: input.partnraFit,
    p_evidence_confidence: input.evidenceConfidence,
    p_recruitability: input.recruitability ?? null,
    p_actionability: input.actionability ?? null,
    p_quality_tier: input.qualityTier,
  });
  return unwrap(result, "upsertOpportunity");
}

export interface OpportunityWithEntity extends OpportunityRow {
  entities: EntityRow;
}

export async function getOpportunitiesForBusiness(
  businessId: string,
  opts: { limit?: number } = {}
): Promise<OpportunityWithEntity[]> {
  const supabase = getGraphClient();
  let query = supabase
    .from("opportunities")
    .select("*, entities(*)")
    .eq("business_id", businessId)
    .neq("status", "rejected")
    .order("partnra_fit", { ascending: false });
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw new GraphError(`getOpportunitiesForBusiness: ${error.message}`);
  return (data ?? []) as unknown as OpportunityWithEntity[];
}

// ------------------------------------------------------------------- scans

export async function createScan(input: {
  businessId: string;
  scanType: "quick" | "deep";
  comparableBrandsTarget?: number | null;
}): Promise<ScanRow> {
  const supabase = getGraphClient();
  const result = await supabase
    .from("scans")
    .insert({
      business_id: input.businessId,
      scan_type: input.scanType,
      status: "queued",
      comparable_brands_target: input.comparableBrandsTarget ?? null,
    })
    .select()
    .single();
  return unwrap(result, "createScan");
}

export async function updateScan(id: string, patch: Partial<Record<string, unknown>>): Promise<ScanRow> {
  const supabase = getGraphClient();
  const result = await supabase.from("scans").update(patch).eq("id", id).select().single();
  return unwrap(result, "updateScan");
}

export async function getScan(id: string): Promise<ScanRow | null> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("scans").select().eq("id", id).maybeSingle();
  if (error) throw new GraphError(`getScan: ${error.message}`);
  return data;
}

/** Atomic (see the increment_scan_counters migration) -- safe even if worker ticks for the same scan ever overlap. Real, persisted progress counters (Section 22) -- never a client-side fake percentage. */
export async function incrementScanCounters(
  scanId: string,
  deltas: {
    comparableBrandsAnalysed?: number;
    signalsReviewed?: number;
    entityCount?: number;
    relationshipCount?: number;
    opportunityCount?: number;
  }
): Promise<ScanRow> {
  const supabase = getGraphClient();
  const result = await supabase.rpc("increment_scan_counters", {
    p_scan_id: scanId,
    p_comparable_brands_analysed: deltas.comparableBrandsAnalysed ?? 0,
    p_signals_reviewed: deltas.signalsReviewed ?? 0,
    p_entity_count: deltas.entityCount ?? 0,
    p_relationship_count: deltas.relationshipCount ?? 0,
    p_opportunity_count: deltas.opportunityCount ?? 0,
  });
  return unwrap(result, "incrementScanCounters");
}

export async function appendScanWarning(scanId: string, warning: string): Promise<void> {
  const supabase = getGraphClient();
  const { error } = await supabase.rpc("append_scan_warning", { p_scan_id: scanId, p_warning: warning.slice(0, 2000) });
  if (error) throw new GraphError(`appendScanWarning: ${error.message}`);
}

// ------------------------------------------------------------ discovery_jobs

export async function createDiscoveryJobs(
  inputs: Array<{ scanId: string; jobType: DiscoveryJobType; targetId?: string | null }>
): Promise<DiscoveryJobRow[]> {
  if (inputs.length === 0) return [];
  const supabase = getGraphClient();
  const result = await supabase
    .from("discovery_jobs")
    .insert(inputs.map((i) => ({ scan_id: i.scanId, job_type: i.jobType, target_id: i.targetId ?? null })))
    .select();
  if (result.error) throw new GraphError(`createDiscoveryJobs: ${result.error.message}`);
  return result.data ?? [];
}

/** Atomic claim (Postgres `FOR UPDATE SKIP LOCKED` under the hood) -- safe when multiple worker invocations overlap. Returns null once the queue is empty (or every remaining job has exhausted maxAttempts). */
export async function claimNextJob(maxAttempts = 3): Promise<DiscoveryJobRow | null> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.rpc("claim_next_job", { p_max_attempts: maxAttempts });
  if (error) throw new GraphError(`claimNextJob: ${error.message}`);
  // The Postgres function returns a row with all-null fields (not a real
  // NULL) when nothing was claimed, since it's typed to return exactly one
  // `discovery_jobs` row shape either way.
  if (!data || data.id == null) return null;
  return data;
}

export async function completeJob(id: string, progress?: Record<string, unknown>): Promise<void> {
  const supabase = getGraphClient();
  const patch: Record<string, unknown> = { status: "completed", completed_at: new Date().toISOString() };
  if (progress) patch.progress = progress;
  const { error } = await supabase.from("discovery_jobs").update(patch).eq("id", id);
  if (error) throw new GraphError(`completeJob: ${error.message}`);
}

export async function failJob(id: string, errorMessage: string): Promise<void> {
  const supabase = getGraphClient();
  const { error } = await supabase
    .from("discovery_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString(), error: errorMessage.slice(0, 2000) })
    .eq("id", id);
  if (error) throw new GraphError(`failJob: ${error.message}`);
}

/** Re-queues a job for another attempt (e.g. a transient provider timeout) rather than marking it permanently failed -- claim_next_job's own `attempts < max_attempts` guard is what eventually stops the retries. */
export async function requeueJob(id: string): Promise<void> {
  const supabase = getGraphClient();
  const { error } = await supabase.from("discovery_jobs").update({ status: "queued" }).eq("id", id);
  if (error) throw new GraphError(`requeueJob: ${error.message}`);
}

export async function countJobsByStatus(scanId: string): Promise<Record<string, number>> {
  const supabase = getGraphClient();
  const { data, error } = await supabase.from("discovery_jobs").select("status").eq("scan_id", scanId);
  if (error) throw new GraphError(`countJobsByStatus: ${error.message}`);
  const counts: Record<string, number> = { queued: 0, running: 0, completed: 0, failed: 0 };
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

export interface StaleJobReclaimResult {
  requeuedCount: number;
  failedCount: number;
  /** Distinct scan ids that had a job permanently fail here -- these may now have no queued/running work left, so the caller re-checks finalization for each. */
  failedScanIds: string[];
}

/**
 * A 'running' job older than the lease (see DEEP_DISCOVERY_LIMITS.staleJobLeaseSeconds)
 * is assumed orphaned by a dead worker process, never a still-legitimately-running
 * one -- see reclaim_stale_jobs in supabase/migrations/0005_stale_job_recovery.sql
 * for why this is safe under concurrent worker ticks (plain atomic UPDATEs, no
 * SELECT-then-UPDATE race window). Called once per worker tick, before claiming
 * any new work, so recovery is automatic on the very next scheduled invocation.
 */
export async function reclaimStaleJobs(staleAfterSeconds: number, maxAttempts: number): Promise<StaleJobReclaimResult> {
  const supabase = getGraphClient();
  const { data, error } = await supabase
    .rpc("reclaim_stale_jobs", { p_stale_after_seconds: staleAfterSeconds, p_max_attempts: maxAttempts })
    .single();
  if (error) throw new GraphError(`reclaimStaleJobs: ${error.message}`);
  const row = data as { requeued_count: number; failed_count: number; failed_scan_ids: string[] | null };
  return {
    requeuedCount: row.requeued_count,
    failedCount: row.failed_count,
    failedScanIds: row.failed_scan_ids ?? [],
  };
}

/** Bounds cost per Section 35/35 (max entity expansions / contact enrichments per scan) -- checked before enqueueing another job of this type, never after. */
export async function countJobsByType(scanId: string, jobType: DiscoveryJobType): Promise<number> {
  const supabase = getGraphClient();
  const { count, error } = await supabase
    .from("discovery_jobs")
    .select("id", { count: "exact", head: true })
    .eq("scan_id", scanId)
    .eq("job_type", jobType);
  if (error) throw new GraphError(`countJobsByType: ${error.message}`);
  return count ?? 0;
}
