-- Atomic upsert functions for the Partnership Graph.
--
-- Plain `INSERT ... ON CONFLICT DO UPDATE SET <every column>` (what
-- supabase-js's .upsert() generates) would overwrite first_seen on every
-- re-discovery, losing the original "when did we first learn this"
-- timestamp needed for the future "new this week" feature. These
-- functions are single-round-trip, atomic (safe under concurrent job
-- workers via Postgres's own row locking), and explicit about which
-- fields a repeat sighting is allowed to strengthen vs. must never
-- silently overwrite.

create or replace function upsert_brand(
  p_name text, p_normalized_key text, p_domain text, p_category text,
  p_market text, p_metadata jsonb
) returns brands as $$
declare
  result brands;
begin
  insert into brands (name, normalized_key, domain, category, market, metadata, last_seen, last_checked)
  values (p_name, p_normalized_key, p_domain, p_category, p_market, coalesce(p_metadata, '{}'::jsonb), now(), now())
  on conflict (normalized_key) do update set
    name = excluded.name,
    domain = coalesce(excluded.domain, brands.domain),
    category = coalesce(excluded.category, brands.category),
    market = coalesce(excluded.market, brands.market),
    metadata = brands.metadata || excluded.metadata,
    last_seen = now(),
    last_checked = now()
  returning * into result;
  return result;
end;
$$ language plpgsql;

create or replace function upsert_entity(
  p_name text, p_normalized_key text, p_domain text, p_entity_type text,
  p_primary_role text, p_geography text, p_markets_served text[], p_category text,
  p_public_contact text, p_contact_page text, p_application_url text,
  p_social_profiles jsonb, p_metadata jsonb
) returns entities as $$
declare
  result entities;
begin
  insert into entities (
    name, normalized_key, domain, entity_type, primary_role, geography, markets_served,
    category, public_contact, contact_page, application_url, social_profiles, metadata,
    last_seen, last_checked
  )
  values (
    p_name, p_normalized_key, p_domain, p_entity_type, p_primary_role, p_geography,
    coalesce(p_markets_served, '{}'), p_category, p_public_contact, p_contact_page,
    p_application_url, coalesce(p_social_profiles, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb),
    now(), now()
  )
  on conflict (normalized_key) do update set
    name = excluded.name,
    domain = coalesce(excluded.domain, entities.domain),
    entity_type = coalesce(excluded.entity_type, entities.entity_type),
    primary_role = coalesce(excluded.primary_role, entities.primary_role),
    geography = coalesce(excluded.geography, entities.geography),
    markets_served = case when coalesce(array_length(excluded.markets_served, 1), 0) > 0
      then (select array_agg(distinct m) from unnest(entities.markets_served || excluded.markets_served) as m)
      else entities.markets_served end,
    category = coalesce(excluded.category, entities.category),
    public_contact = coalesce(excluded.public_contact, entities.public_contact),
    contact_page = coalesce(excluded.contact_page, entities.contact_page),
    application_url = coalesce(excluded.application_url, entities.application_url),
    social_profiles = entities.social_profiles || excluded.social_profiles,
    metadata = entities.metadata || excluded.metadata,
    last_seen = now(),
    last_checked = now()
  returning * into result;
  return result;
end;
$$ language plpgsql;

create or replace function upsert_relationship(
  p_source_entity_id uuid, p_target_brand_id uuid, p_target_entity_id uuid,
  p_relationship_type text, p_relationship_direction text, p_signal_strength text,
  p_confidence integer, p_verified boolean, p_metadata jsonb
) returns relationships as $$
declare
  result relationships;
begin
  insert into relationships (
    source_entity_id, target_brand_id, target_entity_id, relationship_type,
    relationship_direction, signal_strength, confidence, verified, last_seen, metadata
  )
  values (
    p_source_entity_id, p_target_brand_id, p_target_entity_id, p_relationship_type,
    p_relationship_direction, p_signal_strength, p_confidence, p_verified, now(), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (
    source_entity_id,
    coalesce(target_brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    relationship_type
  ) do update set
    relationship_direction = excluded.relationship_direction,
    -- A repeat sighting can only strengthen, never demote, an already
    -- confirmed relationship.
    signal_strength = case
      when excluded.signal_strength = 'strong' or relationships.signal_strength = 'strong' then 'strong'
      when excluded.signal_strength = 'medium' or relationships.signal_strength = 'medium' then 'medium'
      else 'potential'
    end,
    confidence = greatest(relationships.confidence, excluded.confidence),
    verified = relationships.verified or excluded.verified,
    last_seen = now(),
    last_verified = case when excluded.verified then now() else relationships.last_verified end,
    metadata = relationships.metadata || excluded.metadata
  returning * into result;
  return result;
end;
$$ language plpgsql;

create or replace function upsert_evidence(
  p_relationship_id uuid, p_entity_id uuid, p_brand_id uuid, p_url text,
  p_source_platform text, p_title text, p_snippet text, p_evidence_type text,
  p_evidence_confidence text, p_metadata jsonb
) returns evidence as $$
declare
  result evidence;
begin
  insert into evidence (
    relationship_id, entity_id, brand_id, url, source_platform, title, snippet,
    evidence_type, evidence_confidence, last_verified_at, metadata
  )
  values (
    p_relationship_id, p_entity_id, p_brand_id, p_url, p_source_platform, p_title, p_snippet,
    p_evidence_type, p_evidence_confidence, now(), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (relationship_id, url) do update set
    title = excluded.title,
    snippet = excluded.snippet,
    evidence_type = coalesce(excluded.evidence_type, evidence.evidence_type),
    evidence_confidence = coalesce(excluded.evidence_confidence, evidence.evidence_confidence),
    last_verified_at = now(),
    metadata = evidence.metadata || excluded.metadata
  returning * into result;
  return result;
end;
$$ language plpgsql;

-- `status` is deliberately excluded from the update set -- a customer's
-- own CRM-ish progress (saved/contacted/replied/interested/partner/
-- rejected) must never be silently reset back to "discovered" by a later
-- automated re-discovery pass.
create or replace function upsert_opportunity(
  p_business_id uuid, p_entity_id uuid, p_partner_type text, p_primary_role text,
  p_potential_relationship text, p_relationship_direction text, p_geographic_fit text,
  p_partnra_fit integer, p_evidence_confidence text, p_recruitability text,
  p_actionability text, p_quality_tier text
) returns opportunities as $$
declare
  result opportunities;
begin
  insert into opportunities (
    business_id, entity_id, partner_type, primary_role, potential_relationship,
    relationship_direction, geographic_fit, partnra_fit, evidence_confidence,
    recruitability, actionability, quality_tier, last_seen, last_checked
  )
  values (
    p_business_id, p_entity_id, p_partner_type, p_primary_role, p_potential_relationship,
    p_relationship_direction, p_geographic_fit, p_partnra_fit, p_evidence_confidence,
    p_recruitability, p_actionability, p_quality_tier, now(), now()
  )
  on conflict (business_id, entity_id) do update set
    partner_type = excluded.partner_type,
    primary_role = excluded.primary_role,
    potential_relationship = excluded.potential_relationship,
    relationship_direction = excluded.relationship_direction,
    geographic_fit = excluded.geographic_fit,
    partnra_fit = excluded.partnra_fit,
    evidence_confidence = excluded.evidence_confidence,
    recruitability = excluded.recruitability,
    actionability = excluded.actionability,
    quality_tier = excluded.quality_tier,
    last_seen = now(),
    last_checked = now()
  returning * into result;
  return result;
end;
$$ language plpgsql;
