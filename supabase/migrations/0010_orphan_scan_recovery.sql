-- Fixes accumulating orphan Deep Discovery scans: a `scans` row created
-- with status='queued' that NEVER gets its initial discovery_jobs row, so
-- nothing (the worker only ever reacts to discovery_jobs rows, never scans
-- rows directly) ever picks it up, transitions it, or reports it as failed
-- -- it just sits there forever, silently, as dead weight. Confirmed by
-- reading /api/deep-discovery/start/route.ts: scan creation and the
-- scan's first job creation are two SEPARATE network round-trips
--   const scan = await createScan({ businessId: business.id, scanType: "deep" });
--   await createDiscoveryJobs([{ scanId: scan.id, jobType: "comparable_brand_expansion" }]);
-- -- if the second call throws for ANY reason (a transient Supabase/
-- PostgREST hiccup, a request that gets killed between the two awaits, or
-- -- almost certainly the dominant historical cause -- every call to
-- create_discovery_jobs_idempotent throwing "no unique or exclusion
-- constraint matching the ON CONFLICT specification" before migration 0009
-- landed), the scans row from the first call is already durably committed
-- and is left behind with comparable_brands_target still NULL and zero
-- discovery_jobs rows, forever.
--
-- This also explains a real, reported symptom: a diagnostic query that
-- picks "the latest scan for a business" by ordering on started_at can be
-- fooled by exactly this kind of row, since started_at is only ever set
-- once the FIRST job actually runs -- an orphaned scan's started_at stays
-- NULL forever, and Postgres's default NULLS FIRST for `ORDER BY ... DESC`
-- puts it ahead of every real, timestamped scan.

-- ============================================================
-- Step 1: scans never had a created_at column -- every other table in this
-- schema does (first_seen/created_at). Backfilled from whichever real
-- timestamp already exists on the row (started_at, then completed_at) so
-- existing rows get their best-known real creation time, not the
-- migration's own execution time -- only genuinely-untouched (started_at
-- AND completed_at both null) rows fall back to now().
-- ============================================================
alter table scans add column if not exists created_at timestamptz;
update scans set created_at = coalesce(started_at, completed_at, now()) where created_at is null;
alter table scans alter column created_at set default now();
alter table scans alter column created_at set not null;
create index if not exists scans_created_at_idx on scans (created_at);

-- ============================================================
-- Step 2: self-healing reclaim, same lease-model shape as
-- reclaim_stale_jobs (migration 0005) -- worker.ts calls this once per
-- tick, before claiming new work, so an orphaned scan is caught and
-- honestly marked 'failed' within one lease window, with no manual
-- intervention. p_stale_after_seconds is deliberately generous (well
-- beyond any realistic in-flight /api/deep-discovery/start request
-- duration) so this can never race a genuinely-still-in-progress request
-- that simply hasn't reached its createDiscoveryJobs call yet.
--
-- Concurrency safety: a single UPDATE ... WHERE, not a SELECT-then-UPDATE
-- -- two overlapping worker ticks each just match however many rows are
-- still eligible at the time they run; a scan already reclaimed by one
-- tick no longer matches status='queued' for the other.
-- ============================================================
create or replace function reclaim_orphan_scans(
  p_stale_after_seconds integer default 180
) returns table(failed_count integer, failed_scan_ids uuid[]) as $$
declare
  v_failed_ids uuid[];
begin
  with orphaned as (
    update scans s
    set status = 'failed',
        completed_at = now(),
        error = 'Deep Discovery could not start -- no discovery job was ever created for this scan.'
    where s.status = 'queued'
      and s.created_at < now() - (p_stale_after_seconds || ' seconds')::interval
      and not exists (select 1 from discovery_jobs j where j.scan_id = s.id)
    returning s.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_failed_ids from orphaned;

  return query select coalesce(array_length(v_failed_ids, 1), 0), v_failed_ids;
end;
$$ language plpgsql;
