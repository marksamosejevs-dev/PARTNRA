import { CandidateType, RelationshipDirection, SignalStrength } from "../discovery/types";
import { QualityTier } from "../discovery/qualification";
import { GeographicFit } from "../discovery/entity";

/**
 * Row shapes for the Partnership Graph (see
 * supabase/migrations/0001_partnership_graph.sql). Deliberately reuse
 * Quick Scan's own vocabulary types (RelationshipDirection, CandidateType,
 * QualityTier, GeographicFit) rather than a separate, driftable set --
 * Deep Discovery extends the same taxonomy, it doesn't invent a parallel
 * one.
 */

export interface BusinessRow {
  id: string;
  domain: string;
  name: string | null;
  category: string | null;
  business_model: string | null;
  target_market: string | null;
  target_customers: string | null;
  products_services: string | null;
  sales_model: string | null;
  partner_intent_profile: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BrandRow {
  id: string;
  name: string;
  normalized_key: string;
  domain: string | null;
  category: string | null;
  market: string | null;
  metadata: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  last_checked: string | null;
}

export interface EntityRow {
  id: string;
  name: string;
  normalized_key: string;
  domain: string | null;
  entity_type: CandidateType | null;
  primary_role: string | null;
  geography: string | null;
  markets_served: string[];
  category: string | null;
  public_contact: string | null;
  contact_page: string | null;
  application_url: string | null;
  social_profiles: Record<string, unknown>;
  metadata: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A superset of RelationshipDirection: "connects_buyers_for" covers a
 * marketplace/sourcing-platform's role (see Quick Scan's Marketplace
 * type), which isn't a brand-promotion direction at all -- graph
 * relationships need to express that structurally distinct case too.
 */
export type RelationshipTypeLabel = RelationshipDirection | "connects_buyers_for";

export interface RelationshipRow {
  id: string;
  source_entity_id: string;
  target_brand_id: string | null;
  target_entity_id: string | null;
  relationship_type: RelationshipTypeLabel;
  relationship_direction: RelationshipDirection;
  signal_strength: SignalStrength;
  confidence: number;
  verified: boolean;
  first_seen: string;
  last_seen: string;
  last_verified: string | null;
  metadata: Record<string, unknown>;
}

export interface EvidenceRow {
  id: string;
  relationship_id: string;
  entity_id: string | null;
  brand_id: string | null;
  url: string;
  source_platform: string | null;
  title: string | null;
  snippet: string | null;
  evidence_type: string | null;
  evidence_confidence: "strong" | "medium" | "weak" | null;
  discovered_at: string;
  last_verified_at: string | null;
  metadata: Record<string, unknown>;
}

export type OpportunityStatus = "discovered" | "saved" | "contacted" | "replied" | "interested" | "partner" | "rejected";

export interface OpportunityRow {
  id: string;
  business_id: string;
  entity_id: string;
  partner_type: CandidateType | null;
  primary_role: string | null;
  potential_relationship: string | null;
  relationship_direction: RelationshipDirection;
  geographic_fit: GeographicFit;
  partnra_fit: number;
  evidence_confidence: "strong" | "medium" | "weak";
  recruitability: string | null;
  actionability: string | null;
  quality_tier: QualityTier;
  status: OpportunityStatus;
  first_seen: string;
  last_seen: string;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

export type ScanType = "quick" | "deep";
export type ScanStatus = "queued" | "running" | "completed" | "completed_with_warnings" | "failed";

export interface ScanRow {
  id: string;
  business_id: string;
  scan_type: ScanType;
  status: ScanStatus;
  /** Always set, unlike started_at (which stays null until the scan's first job actually runs) -- see migration 0010. The right column to order "latest scan" queries by. */
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  raw_signal_count: number;
  entity_count: number;
  relationship_count: number;
  opportunity_count: number;
  comparable_brands_target: number | null;
  comparable_brands_analysed: number;
  signals_reviewed: number;
  provider_usage: Record<string, unknown>;
  warnings: unknown[];
  error: string | null;
  preview_entity_id: string | null;
  preview_score: number | null;
  preview_selection_reason: string | null;
}

export type DiscoveryJobType =
  | "comparable_brand_expansion"
  | "brand_relationship_expansion"
  | "entity_expansion"
  | "relationship_verification"
  | "contact_enrichment";
export type DiscoveryJobStatus = "queued" | "running" | "completed" | "failed";

export interface DiscoveryJobRow {
  id: string;
  scan_id: string;
  job_type: DiscoveryJobType;
  target_id: string | null;
  status: DiscoveryJobStatus;
  attempts: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  progress: Record<string, unknown>;
  created_at: string;
}
