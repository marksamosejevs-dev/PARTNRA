-- Fixes a real production invariant violation: comparable_brands_analysed
-- reached 16 while comparable_brands_target stayed 15 (16/15), immediately
-- after stale-job recovery (migration 0005) started reclaiming orphaned
-- 'running' jobs. Root cause, confirmed by code inspection:
--
-- 1. discovery_jobs had NO uniqueness constraint on (scan_id, job_type,
--    target_id). runComparableBrandExpansion (worker.ts) creates one
--    brand_relationship_expansion job per resolved brand via a plain
--    INSERT. If that job's OWN row was still 'running' when its lease
--    expired (e.g. it crashed after inserting the per-brand jobs but
--    before its own completeJob call), stale-job recovery requeues and
--    replays it -- and the replay's plain INSERT creates a SECOND,
--    duplicate brand_relationship_expansion row for a brand that may
--    already have a completed job. Each row is a fully independent unit
--    of work, so BOTH can legitimately reach 'completed'.
-- 2. Worse, completing a job and incrementing the scan's aggregate
--    counters (comparable_brands_analysed, signals_reviewed, entity_count,
--    relationship_count, opportunity_count) were two SEPARATE, non-atomic
--    steps (increment inside the job's own run* function, then a later,
--    separate completeJob() call). If the process died in between --
--    exactly the scenario stale-job recovery exists to clean up -- the
--    counters were already durably incremented from attempt 1, and a
--    replayed attempt 2 incremented them AGAIN for the same job.
--
-- Both are genuine idempotency gaps that existed before stale-job
-- recovery, but recovery is what turns a silently-stuck job into an
-- actively-replayed one, which is what newly exposed them at production
-- scale. This migration closes both gaps at the persistence layer (never
-- in the UI), plus a third defense-in-depth guard: a terminal scan must
-- never be moved back to a non-terminal status by ANY update, from any
-- code path, present or future.

-- ============================================================
-- Step 1: deduplicate existing discovery_jobs rows before adding the
-- uniqueness constraint below (a table with duplicate rows can't have a
-- unique index created on it). Keep exactly one row per (scan_id,
-- job_type, target) group -- preferring an already-completed row (real
-- work happened, keep its evidence), then the earliest completion, then
-- the earliest creation. The underlying entities/relationships/evidence/
-- opportunities these jobs touched are NOT affected by this delete -- they
-- have their own independent upsert-based uniqueness and were never
-- literally duplicated by a duplicate job row, only the SCAN-LEVEL
-- counters were inflated by counting the same brand/entity's contribution
-- more than once.
-- ============================================================
with ranked as (
  select
    id,
    row_number() over (
      partition by scan_id, job_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by
        (status = 'completed') desc,
        completed_at asc nulls last,
        created_at asc
    ) as rn
  from discovery_jobs
)
delete from discovery_jobs
where id in (select id from ranked where rn > 1);

-- ============================================================
-- Step 2: enforce it going forward. target_id is nullable (only
-- comparable_brand_expansion has no target -- one such job per scan), so
-- the same coalesce-to-sentinel pattern already used by
-- relationships_identity_idx (migration 0001) is needed here too --
-- otherwise NULL <> NULL would let two comparable_brand_expansion rows
-- for the same scan coexist.
-- ============================================================
create unique index if not exists discovery_jobs_identity_idx on discovery_jobs (
  scan_id, job_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- ============================================================
-- Step 3: idempotent job creation. A plain INSERT would now simply error
-- on a duplicate; ON CONFLICT DO NOTHING makes createDiscoveryJobs safe to
-- call again for a job spec that already exists (whether from a genuine
-- replay after stale-job recovery, or -- independent of that bug -- the
-- same entity legitimately earning a fresh Opportunity from more than one
-- brand in the same scan, which already could create duplicate
-- entity_expansion/contact_enrichment follow-up jobs for that entity even
-- with no retry involved at all).
-- ============================================================
create or replace function create_discovery_jobs_idempotent(p_jobs jsonb)
returns setof discovery_jobs as $$
begin
  return query
  insert into discovery_jobs (scan_id, job_type, target_id)
  select
    (j->>'scan_id')::uuid,
    j->>'job_type',
    nullif(j->>'target_id', '')::uuid
  from jsonb_array_elements(p_jobs) as j
  on conflict (scan_id, job_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do nothing
  returning *;
end;
$$ language plpgsql;

-- ============================================================
-- Step 4: atomic complete-and-increment. This is the core idempotency
-- fix -- a job's aggregate-counter contribution can now ONLY ever be
-- applied in the exact same transaction that transitions ITS OWN row from
-- 'running' to 'completed'. The `where status = 'running'` guard means a
-- replay of an already-completed job (impossible to reach 'running' again
-- via claim_next_job, but reachable in principle if ever called twice)
-- matches zero rows, updated_job.id is null, and increment_scan_counters
-- is never called a second time for it. The real per-brand/per-entity
-- work (search, classify, upsert_entity/relationship/evidence/
-- opportunity) can safely still re-run on a genuine retry -- those are
-- already idempotent upserts -- only the scan-wide aggregate counters
-- needed this guard.
-- ============================================================
create or replace function complete_discovery_job(
  p_job_id uuid,
  p_progress jsonb default '{}'::jsonb,
  p_comparable_brands_analysed integer default 0,
  p_signals_reviewed integer default 0,
  p_entity_count integer default 0,
  p_relationship_count integer default 0,
  p_opportunity_count integer default 0
) returns discovery_jobs as $$
declare
  updated_job discovery_jobs;
begin
  update discovery_jobs
  set status = 'completed', completed_at = now(), progress = coalesce(p_progress, '{}'::jsonb)
  where id = p_job_id and status = 'running'
  returning * into updated_job;

  if updated_job.id is not null then
    perform increment_scan_counters(
      updated_job.scan_id, p_comparable_brands_analysed, p_signals_reviewed,
      p_entity_count, p_relationship_count, p_opportunity_count
    );
  end if;

  return updated_job;
end;
$$ language plpgsql;

-- Same guard for the failure path -- a job replay must not append the
-- same warning to a scan twice, and failJob must not report a "new"
-- failure for a job that was already terminal.
create or replace function fail_discovery_job(p_job_id uuid, p_error text)
returns discovery_jobs as $$
declare
  updated_job discovery_jobs;
begin
  update discovery_jobs
  set status = 'failed', completed_at = now(), error = left(p_error, 2000)
  where id = p_job_id and status = 'running'
  returning * into updated_job;
  return updated_job;
end;
$$ language plpgsql;

-- ============================================================
-- Step 5: a terminal scan is frozen. Whatever the exact path that woke an
-- old job up for an already-completed/completed_with_warnings scan (stale
-- recovery is the newly-added one, but this guards ANY future path too),
-- the scans row itself must never be observed to regress out of a
-- terminal status, and none of its other columns (comparable_brands_target,
-- started_at, counters) should be silently overwritten by that stale
-- work either -- so the entire attempted update is discarded, not just
-- the status field.
-- ============================================================
create or replace function prevent_scan_status_regression()
returns trigger as $$
begin
  if old.status in ('completed', 'completed_with_warnings') and new.status not in ('completed', 'completed_with_warnings') then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists scans_prevent_status_regression on scans;
create trigger scans_prevent_status_regression before update on scans
  for each row execute function prevent_scan_status_regression();

-- ============================================================
-- Step 6: one-time reconciliation of any scan whose counters were already
-- inflated by the bug above, run automatically as part of this migration
-- (not a manual fabrication) -- recomputed directly from the same
-- canonical per-job `progress` JSON each completed job already persisted
-- (see runBrandRelationshipExpansion/runEntityExpansion's return shapes),
-- now correctly counted once per surviving (post-dedup, post-unique-
-- index) job row instead of once per historical execution attempt.
-- comparable_brands_analysed becomes a genuinely-derived DISTINCT count
-- (COUNT of completed brand_relationship_expansion rows, which the unique
-- index guarantees is at most one per brand) rather than a fragile
-- additive counter. Safe to re-run: a no-op once values already match.
-- ============================================================
with per_scan as (
  select
    scan_id,
    count(*) filter (where job_type = 'brand_relationship_expansion' and status = 'completed') as brands_analysed,
    coalesce(sum((progress->>'itemsSearched')::integer)
      filter (where job_type = 'brand_relationship_expansion' and status = 'completed'), 0) as signals_reviewed,
    coalesce(sum((progress->>'entitiesUpserted')::integer)
      filter (where job_type = 'brand_relationship_expansion' and status = 'completed'), 0) as entity_count,
    coalesce(sum((progress->>'relationshipsUpserted')::integer)
      filter (where job_type = 'brand_relationship_expansion' and status = 'completed'), 0)
    + coalesce(sum((progress->>'newRelationshipsFound')::integer)
      filter (where job_type = 'entity_expansion' and status = 'completed'), 0) as relationship_count,
    coalesce(sum((progress->>'opportunitiesUpserted')::integer)
      filter (where job_type = 'brand_relationship_expansion' and status = 'completed'), 0) as opportunity_count
  from discovery_jobs
  group by scan_id
)
update scans s
set
  comparable_brands_analysed = per_scan.brands_analysed,
  signals_reviewed = per_scan.signals_reviewed,
  entity_count = per_scan.entity_count,
  relationship_count = per_scan.relationship_count,
  opportunity_count = per_scan.opportunity_count
from per_scan
where s.id = per_scan.scan_id
  and s.scan_type = 'deep'
  and (
    s.comparable_brands_analysed is distinct from per_scan.brands_analysed
    or s.signals_reviewed is distinct from per_scan.signals_reviewed
    or s.entity_count is distinct from per_scan.entity_count
    or s.relationship_count is distinct from per_scan.relationship_count
    or s.opportunity_count is distinct from per_scan.opportunity_count
  );
