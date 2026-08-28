-- Production runtime error: "createDiscoveryJobs: Could not find the
-- function public.create_discovery_jobs_idempotent(p_jobs) in the schema
-- cache" (PostgREST error PGRST202 -- zero matching functions found).
--
-- Confirmed by direct comparison against src/lib/graph/repository.ts: the
-- JS call (`supabase.rpc("create_discovery_jobs_idempotent", { p_jobs })`)
-- and the SQL definition in migration 0006 match exactly -- same name,
-- same single `p_jobs jsonb` argument, no overload. PGRST202 specifically
-- means PostgREST's schema cache currently has NO function by this
-- name+signature, which rules out a naming/type mismatch (that would
-- still show up as PGRST202 if it were merely mismatched, but the
-- committed source proves there is no mismatch) and rules out overload
-- ambiguity (that's a different code, PGRST203).
--
-- The two remaining explanations are indistinguishable from source code:
-- (a) PostgREST's schema cache is stale (Supabase's automatic reload
--     after DDL run via the SQL editor did not fire, or has not yet
--     fired, for this specific function), or
-- (b) migration 0006's CREATE FUNCTION statement for this one function
--     never actually committed (e.g. the SQL editor run was partial),
--     even though other parts of 0006 evidently did apply (0007's
--     reconciliation against real production data referenced scan_brands
--     and discovery_jobs successfully).
--
-- Both are fixed by this single migration: re-issuing the exact same
-- CREATE OR REPLACE FUNCTION is a harmless no-op if the function already
-- exists correctly (cause a), and self-heals it if it was missing (cause
-- b); the trailing NOTIFY forces an immediate PostgREST reload either
-- way, rather than waiting on Supabase's own automatic reload timing.
-- Safe to run any number of times.

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

-- Forces PostgREST to pick up the function above (and anything else
-- created earlier in this deploy) immediately, instead of waiting on
-- Supabase's own automatic schema-cache reload.
notify pgrst, 'reload schema';
