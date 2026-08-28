-- Fixes a real production error on createDiscoveryJobs:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- ROOT CAUSE, confirmed by local reproduction against migrations 0001-0008
-- applied cleanly to a fresh Postgres 16 database:
--
-- The migration 0006 SQL itself is NOT logically flawed. Its unique index
--   create unique index if not exists discovery_jobs_identity_idx on discovery_jobs (
--     scan_id, job_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
--   );
-- is an EXPRESSION index (the third key is coalesce(target_id, sentinel), not
-- the bare target_id column), and create_discovery_jobs_idempotent's
--   on conflict (scan_id, job_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
-- target matches that expression EXACTLY, character-for-character. Applying
-- 0001-0008 fresh and calling the function -- including with a NULL
-- target_id (comparable_brand_expansion), a real target_id
-- (relationship_verification), a duplicate of each, and a mixed batch of
-- both in one call -- works perfectly: every duplicate is silently
-- skipped, every genuinely-new row is inserted, no error.
--
-- The error only reproduces when the INDEX is missing while the FUNCTION
-- still exists -- confirmed by deliberately dropping just the index on that
-- same clean database and re-running the identical call, which reproduces
-- this migration's title error VERBATIM. `CREATE OR REPLACE FUNCTION` never
-- validates a plpgsql function body's inner SQL against the catalog at
-- CREATE time (only syntax-checks it) -- the ON CONFLICT target is only
-- resolved against whatever indexes ACTUALLY EXIST at EXECUTION time. So a
-- database where 0006's function got (re-)created but its unique index did
-- not survive -- most plausibly, step 2 of 0006 (CREATE UNIQUE INDEX)
-- failed with a duplicate-key error because step 1's dedup left (or a
-- later write re-introduced) a duplicate (scan_id, job_type, target) group,
-- while every OTHER statement in that migration file (the function
-- definitions, the trigger, the reconciliation UPDATE) does not depend on
-- the index and would have applied "successfully" regardless -- is exactly
-- what production is running, whatever specific event caused the index to
-- never exist. `CREATE UNIQUE INDEX ... IF NOT EXISTS` also silently no-ops
-- if an index of that NAME already exists under a DIFFERENT definition
-- (Postgres's IF NOT EXISTS is name-based, not definition-based) -- so this
-- migration does not merely retry 0006's own IF NOT EXISTS statement (which
-- could silently no-op again for the same reason, or a different one); it
-- unconditionally drops whatever exists under this index's name and
-- recreates it, so the end state is provably correct regardless of how it
-- drifted.
--
-- THE FIX: converge discovery_jobs back to the exact state 0006 intended,
-- unconditionally, so it's correct regardless of which specific drift
-- caused this. Idempotent-ish (as this project's other migrations are):
-- safe to re-run.

-- ============================================================
-- Step 1: re-run 0006's own dedup, defensively. If a duplicate
-- (scan_id, job_type, target) group is what made the original index
-- creation fail (or what's kept it from ever being recreated since), it
-- must be cleared before step 2 below can succeed. A no-op if the table is
-- already clean (the expected case on an environment where 0006's index
-- DID survive, e.g. a fresh local dev database run through 0001-0009).
-- Same "keep the completed row, else earliest" preference as 0006, for the
-- same reason: real work already done is worth more than an earlier
-- attempt that never got that far.
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
-- Step 2: unconditionally converge the index to the exact expression the
-- ON CONFLICT target requires -- DROP + CREATE (not "IF NOT EXISTS"),
-- since IF NOT EXISTS is exactly the mechanism that let this drift go
-- undetected: it would silently no-op again here too if some index
-- happened to already exist under this name with a different definition.
-- A plain (non-CONCURRENTLY) CREATE INDEX is used deliberately, matching
-- 0006's own original choice and staying compatible with the Supabase SQL
-- editor / a single `supabase db push` transaction (CREATE INDEX
-- CONCURRENTLY cannot run inside a transaction block) -- discovery_jobs is
-- a bounded-size, per-scan operational table (see limits.ts's per-scan job
-- caps), not a large customer-facing table, so a brief write-lock during
-- this one-time migration is an acceptable, already-precedented tradeoff.
-- ============================================================
drop index if exists discovery_jobs_identity_idx;
create unique index discovery_jobs_identity_idx on discovery_jobs (
  scan_id, job_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- ============================================================
-- Step 3: reissue the function verbatim -- its logic was already correct
-- (see the root-cause note above), but reissuing it here means this
-- migration is a single, self-contained, defensively-complete fix rather
-- than depending on 0006's copy having survived untouched. Identical to
-- 0006's definition; no behavior change.
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

-- Force PostgREST to see the (re-)created function/index immediately,
-- same as migration 0008 -- required whenever an RPC is touched, even when
-- (as here) its signature/body is unchanged: this closes out any residual
-- schema-cache staleness alongside the real, index-level fix above.
notify pgrst, 'reload schema';

-- ============================================================
-- Step 4: self-check -- schema-only (never writes rows into businesses/
-- scans/discovery_jobs), so it's safe to run against a live production
-- database. Proves the index that ends up on disk is the exact expression
-- create_discovery_jobs_idempotent's ON CONFLICT target requires, rather
-- than assuming the DDL above silently did what it says.
-- ============================================================
do $$
declare
  idx_def text;
begin
  select indexdef into idx_def from pg_indexes
  where schemaname = 'public' and tablename = 'discovery_jobs' and indexname = 'discovery_jobs_identity_idx';

  if idx_def is null then
    raise exception 'discovery_jobs_identity_idx was not created';
  end if;
  if idx_def not like '%COALESCE(target_id%' then
    raise exception 'discovery_jobs_identity_idx does not match the expected COALESCE(target_id, ...) expression: %', idx_def;
  end if;

  raise notice 'discovery_jobs_identity_idx verified: %', idx_def;
end $$;
