-- Stale-job recovery. Root cause fixed here: once claim_next_job() flips a
-- discovery_jobs row to 'running', the ONLY code paths that ever move it
-- back out (completeJob/failJob in src/lib/deepDiscovery/worker.ts) run
-- inside the SAME process that claimed it. If that process is killed
-- externally -- a Netlify function execution limit, an OOM, a cold-start
-- eviction, or any exception outside the normal try/catch -- the row is
-- orphaned in 'running' forever, since nothing else was ever watching it.
-- This is exactly what produced real production rows stuck 'running' for
-- almost a day with completed_at/error both NULL.
--
-- reclaim_stale_jobs implements a lease model on the existing started_at
-- column (no new column needed): a 'running' row older than
-- p_stale_after_seconds is assumed dead and is either requeued (attempts
-- remaining) or permanently failed (attempts exhausted) -- worker.ts calls
-- this once at the top of every tick, before claiming new work, so a
-- normal cron invocation recovers stale jobs automatically with no manual
-- intervention.
--
-- Concurrency safety: these are two plain UPDATE ... WHERE statements, not
-- a single SELECT-then-UPDATE. Postgres takes row-level locks as part of
-- each UPDATE; if two worker ticks race, the second transaction's UPDATE
-- blocks on any row the first is touching, then re-evaluates its own WHERE
-- clause once the first commits -- by then status is no longer 'running'
-- for that row, so the second UPDATE simply matches 0 rows for it. A job
-- can never be reclaimed twice, and two workers can never both "win" the
-- same stale row.
create or replace function reclaim_stale_jobs(
  p_stale_after_seconds integer default 300,
  p_max_attempts integer default 3
) returns table(requeued_count integer, failed_count integer, failed_scan_ids uuid[]) as $$
declare
  v_requeued integer;
  v_failed_ids uuid[];
begin
  -- Attempts remain -- give it another try. Cleared error/started_at-driven
  -- staleness naturally resolves once claim_next_job picks it back up.
  update discovery_jobs
  set status = 'queued',
      error = 'stale: worker lease expired before completion -- requeued for retry (attempt ' || attempts || ')'
  where status = 'running'
    and started_at is not null
    and started_at < now() - (p_stale_after_seconds || ' seconds')::interval
    and attempts < p_max_attempts;
  get diagnostics v_requeued = row_count;

  -- Attempts exhausted -- this job is done retrying. Recorded as a distinct
  -- "lease expired" reason (never confused with a real provider/API
  -- failure message) so it's diagnosable later, and completed_at is set so
  -- it reads like any other terminal job row.
  with exhausted as (
    update discovery_jobs
    set status = 'failed',
        completed_at = now(),
        error = 'stale: worker lease expired before completion -- max attempts reached, giving up'
    where status = 'running'
      and started_at is not null
      and started_at < now() - (p_stale_after_seconds || ' seconds')::interval
      and attempts >= p_max_attempts
    returning scan_id
  )
  select coalesce(array_agg(distinct scan_id), '{}'::uuid[]) into v_failed_ids from exhausted;

  return query select v_requeued, coalesce(array_length(v_failed_ids, 1), 0), v_failed_ids;
end;
$$ language plpgsql;
