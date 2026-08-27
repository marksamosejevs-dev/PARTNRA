-- Partnership Graph -- core schema for Deep Discovery V1.
--
-- Represented relationally, not as a graph database, per the V1 scope
-- decision: a graph DB is real added operational complexity (a new
-- managed service, a new query language) that this dataset's size and
-- query patterns (a handful of joins, never a deep unbounded traversal)
-- don't yet justify. Every "graph" query V1 needs (an entity's connected
-- brands, a brand's connected entities, cross-brand corroboration counts)
-- is a plain join/count over these tables.
--
-- Apply with the Supabase CLI (`supabase db push`) or by pasting into the
-- Supabase SQL editor. Idempotent-ish: uses IF NOT EXISTS / OR REPLACE
-- throughout so a re-run doesn't fail, but this is a first migration, not
-- a repeatable seed script.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- businesses -- a customer business being analysed (Quick Scan or Deep
-- Discovery). One row per distinct domain we've ever analysed.
-- ============================================================
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text,
  category text,
  business_model text,
  target_market text,
  target_customers text,
  products_services text,
  sales_model text,
  -- The full dynamically-generated Partner Intent Profile (see
  -- src/lib/discovery/business.ts's BusinessProfile) as JSON -- stored
  -- whole rather than column-per-field so this table doesn't need a
  -- migration every time that profile shape grows.
  partner_intent_profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists businesses_set_updated_at on businesses;
create trigger businesses_set_updated_at before update on businesses
  for each row execute function set_updated_at();

-- ============================================================
-- brands -- external/comparable brands (competitors or category peers).
-- These are BRAND PROGRAMS / intelligence targets, never automatically
-- partner leads themselves -- see NON_PARTNER_TYPES's "Competitor
-- affiliate program"/"Comparable business" concept in the existing Quick
-- Scan qualification, which this graph must never bypass.
-- ============================================================
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Deterministic identity key: the registrable domain when known, else a
  -- normalized-name fallback (see src/lib/graph/normalize.ts) -- computed
  -- in application code so the normalization logic lives in one place,
  -- shared with entities' own normalization.
  normalized_key text not null unique,
  domain text,
  category text,
  market text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_checked timestamptz
);
create index if not exists brands_domain_idx on brands (domain) where domain is not null;

-- ============================================================
-- entities -- real partner-side entities (affiliate publisher, creator,
-- distributor, importer, retailer, affiliate network, referral partner,
-- reseller, professional-services firm, marketplace, media company,
-- community, ...). Never a source platform (YouTube/LinkedIn/Google) --
-- see entity_type check constraint and the existing
-- NON_ENTITY_PLATFORM_HOSTS rule this graph must keep honoring.
-- ============================================================
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_key text not null unique,
  domain text,
  entity_type text,
  primary_role text,
  geography text,
  markets_served text[] not null default '{}',
  category text,
  public_contact text,
  contact_page text,
  application_url text,
  social_profiles jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_checked timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entities_domain_idx on entities (domain) where domain is not null;
drop trigger if exists entities_set_updated_at on entities;
create trigger entities_set_updated_at before update on entities
  for each row execute function set_updated_at();

-- ============================================================
-- relationships -- the core of the Partnership Graph. "Publisher X
-- promotes_brand Brand A", "Distributor Y distributes_brand Brand B",
-- "Firm X refers_clients_to Firm Y" (target_entity_id, not a brand).
-- relationship_direction reuses the SAME taxonomy as Quick Scan's
-- RelationshipDirection (src/lib/discovery/types.ts) -- never a separate,
-- drifted vocabulary.
-- ============================================================
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  source_entity_id uuid not null references entities(id) on delete cascade,
  target_brand_id uuid references brands(id) on delete cascade,
  target_entity_id uuid references entities(id) on delete cascade,
  relationship_type text not null,
  relationship_direction text not null default 'unknown',
  signal_strength text not null default 'potential',
  confidence integer not null default 0,
  verified boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_verified timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint relationships_has_target check (target_brand_id is not null or target_entity_id is not null)
);
-- Upsert identity: the same source/target/type pair re-discovered should
-- update the existing row (last_seen, confidence, evidence), never create
-- a duplicate. Nullable target_entity_id needs a sentinel in the index
-- since Postgres treats NULLs as distinct for plain unique constraints.
create unique index if not exists relationships_identity_idx on relationships (
  source_entity_id,
  coalesce(target_brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
  relationship_type
);
create index if not exists relationships_target_brand_idx on relationships (target_brand_id) where target_brand_id is not null;
create index if not exists relationships_source_entity_idx on relationships (source_entity_id);

-- ============================================================
-- evidence -- never lose provenance. PARTNRA must always be able to
-- answer "why do we believe this relationship exists?".
-- ============================================================
create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references relationships(id) on delete cascade,
  entity_id uuid references entities(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  url text not null,
  source_platform text,
  title text,
  snippet text,
  evidence_type text,
  evidence_confidence text,
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists evidence_identity_idx on evidence (relationship_id, url);
create index if not exists evidence_relationship_idx on evidence (relationship_id);

-- ============================================================
-- opportunities -- "Entity X as a potential partner for Business Y".
-- Customer-specific (business_id), even though the underlying entity is
-- shared global-graph data -- see the customer-vs-global-graph separation
-- requirement: a business's own opportunity `status` (contacted, replied,
-- ...) is private data, never written back into the shared entities table.
-- ============================================================
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  partner_type text,
  primary_role text,
  potential_relationship text,
  relationship_direction text not null default 'unknown',
  geographic_fit text not null default 'unknown',
  partnra_fit integer not null default 0,
  evidence_confidence text not null default 'weak',
  recruitability text,
  actionability text,
  quality_tier text not null default 'weak',
  status text not null default 'discovered',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_checked timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_status_check check (
    status in ('discovered', 'saved', 'contacted', 'replied', 'interested', 'partner', 'rejected')
  )
);
create unique index if not exists opportunities_identity_idx on opportunities (business_id, entity_id);
create index if not exists opportunities_business_idx on opportunities (business_id, quality_tier);
drop trigger if exists opportunities_set_updated_at on opportunities;
create trigger opportunities_set_updated_at before update on opportunities
  for each row execute function set_updated_at();

-- ============================================================
-- scans -- one Quick Scan or Deep Discovery run.
-- ============================================================
create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  scan_type text not null,
  status text not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  raw_signal_count integer not null default 0,
  entity_count integer not null default 0,
  relationship_count integer not null default 0,
  opportunity_count integer not null default 0,
  -- Real, persisted progress counters -- see discovery_jobs.progress for
  -- the per-job detail this rolls up from. Read directly by the status
  -- endpoint; never a client-side fake percentage.
  comparable_brands_target integer,
  comparable_brands_analysed integer not null default 0,
  signals_reviewed integer not null default 0,
  provider_usage jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  preview_entity_id uuid references entities(id),
  preview_score numeric,
  preview_selection_reason text,
  constraint scans_scan_type_check check (scan_type in ('quick', 'deep')),
  constraint scans_status_check check (
    status in ('queued', 'running', 'completed', 'completed_with_warnings', 'failed')
  )
);
create index if not exists scans_business_idx on scans (business_id, scan_type, started_at desc);

-- ============================================================
-- discovery_jobs -- bounded units of Deep Discovery work. A scan is
-- driven entirely by rows here, never by one long function call, so
-- progress survives across separate scheduled-function invocations (see
-- netlify/functions/deep-discovery-worker.ts) and the user closing the
-- browser tab.
-- ============================================================
create table if not exists discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  job_type text not null,
  -- Free-form target reference (a brand id, entity id, or business id
  -- depending on job_type) -- not a foreign key, since which table it
  -- points to varies by job_type; see repository.ts for the typed accessor.
  target_id uuid,
  status text not null default 'queued',
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint discovery_jobs_job_type_check check (
    job_type in (
      'comparable_brand_expansion',
      'brand_relationship_expansion',
      'entity_expansion',
      'relationship_verification',
      'contact_enrichment'
    )
  ),
  constraint discovery_jobs_status_check check (
    status in ('queued', 'running', 'completed', 'failed')
  )
);
create index if not exists discovery_jobs_claim_idx on discovery_jobs (status, created_at) where status = 'queued';
create index if not exists discovery_jobs_scan_idx on discovery_jobs (scan_id);

-- ============================================================
-- claim_next_job -- atomic job claim so two overlapping worker
-- invocations (e.g. a scheduled-function tick firing while a previous
-- one is still finishing) can never both pick up and duplicate-process
-- the same job. `for update skip locked` makes concurrent claims safe
-- without a separate advisory-lock scheme.
-- ============================================================
create or replace function claim_next_job(p_max_attempts integer default 3)
returns discovery_jobs as $$
declare
  claimed discovery_jobs;
begin
  select * into claimed
  from discovery_jobs
  where status = 'queued' and attempts < p_max_attempts
  order by created_at asc
  for update skip locked
  limit 1;

  if claimed.id is not null then
    update discovery_jobs
    set status = 'running', started_at = now(), attempts = attempts + 1
    where id = claimed.id
    returning * into claimed;
  end if;

  return claimed;
end;
$$ language plpgsql;
