-- Follow-up to migration 0006. Production scan ed8287f4-e009-474f-b7e5-
-- 814070c72911 remained at comparable_brands_analysed=16 /
-- comparable_brands_target=15 even after 0006's reconciliation ran.
--
-- ROOT CAUSE (confirmed against a production-shaped local fixture: 16
-- distinct completed brand_relationship_expansion job rows, targeting 16
-- DIFFERENT brands, zero literal duplicate (scan_id, job_type, target_id)
-- rows): this was never the bug 0006 fixed. 0006 closed the door on the
-- SAME brand getting a duplicate job row and being double-counted. This
-- scan's comparable_brand_expansion job instead ran twice (a genuine
-- pre-0005 stale-job-recovery replay) and resolved a SLIGHTLY DIFFERENT
-- set of comparable brands each time -- competitor-name resolution isn't
-- perfectly deterministic across two separate AI/search calls (e.g. 14
-- brands in common, plus one different 15th brand each run). Each run
-- wrote `comparable_brands_target = brands.length` from ONLY its own
-- run's count (always 15, since each run happened to resolve exactly 15)
-- while `scan_brands` -- populated by the idempotent linkScanBrand, which
-- never removes anything -- correctly accumulated the UNION of both
-- runs: 16 distinct brands. Both runs' brands then legitimately got a
-- brand_relationship_expansion job each (16 distinct jobs, no duplicates
-- to dedupe), and all 16 legitimately completed. So
-- comparable_brands_analysed=16 was ALREADY CORRECT -- it was
-- comparable_brands_target that was stale at 15, an artifact of the same
-- "last write wins, no accumulation" pattern 0006 fixed for jobs, just
-- manifesting here as a number too SMALL rather than too large. 0006's
-- reconciliation only ever recomputed analysed/signals/entities/
-- relationships/opportunities -- it never touched target, because at the
-- time nothing had identified target itself as a possible drift source.
--
-- DIAGNOSTIC (read-only, safe to run in production at any time to confirm
-- this mechanism for a specific scan_id before or after this migration):
--
--   select count(distinct brand_id) as scan_brands_distinct_count
--   from scan_brands where scan_id = '<scan_id>';
--
--   select count(distinct target_id) as distinct_completed_brand_jobs
--   from discovery_jobs
--   where scan_id = '<scan_id>' and job_type = 'brand_relationship_expansion'
--     and status = 'completed';
--
--   select job_type, target_id, count(*) from discovery_jobs
--   where scan_id = '<scan_id>' group by 1,2 having count(*) > 1;
--     -- (should be empty post-0006 -- a non-empty result here would mean
--     -- a DIFFERENT, more concerning issue: a literal duplicate the
--     -- unique index somehow didn't prevent, e.g. two NULL target_ids
--     -- colliding on the sentinel, or index corruption)
--
-- If scan_brands_distinct_count > stored comparable_brands_target, and
-- distinct_completed_brand_jobs matches scan_brands_distinct_count, this
-- is exactly the mechanism below and this migration's fix applies.

-- ============================================================
-- Step 1: a small helper to safely pull an integer out of a job's
-- `progress` jsonb -- defensive against any historical row where a key is
-- missing, null, or (in principle) not numeric, rather than letting a
-- malformed value abort the whole reconciliation with a cast error.
-- ============================================================
create or replace function safe_jsonb_int(p_obj jsonb, p_key text)
returns integer as $$
  select case when jsonb_typeof(p_obj -> p_key) = 'number' then (p_obj ->> p_key)::numeric::integer else 0 end;
$$ language sql immutable;

-- ============================================================
-- Step 2: repair comparable_brands_target from scan_brands -- the one
-- table that accumulates every brand a scan has EVER resolved, idempotent
-- by (scan_id, brand_id), never decremented. GREATEST only ever RAISES an
-- existing target to match the true accumulated count; it never lowers
-- one, so a legitimate, never-replayed scan (target already equal to its
-- brand count) is untouched -- including a legitimately partial scan
-- (e.g. 12 analysed against a target of 15 where all 15 were resolved
-- once and only 12 have completed so far). Scans that haven't started
-- brand resolution yet (comparable_brands_target still NULL) are
-- excluded -- there is nothing in scan_brands to derive for them, and
-- NULL correctly means "not yet known", not "0".
-- ============================================================
with accumulated as (
  select scan_id, count(distinct brand_id) as distinct_brand_count
  from scan_brands
  group by scan_id
)
update scans s
set comparable_brands_target = greatest(s.comparable_brands_target, accumulated.distinct_brand_count)
from accumulated
where s.id = accumulated.scan_id
  and s.scan_type = 'deep'
  and s.comparable_brands_target is not null
  and accumulated.distinct_brand_count > s.comparable_brands_target;

-- ============================================================
-- Step 3: re-run the same counter reconciliation migration 0006 did,
-- using the safe extractor this time -- idempotent (a no-op wherever
-- values already match), and covers any scan whose analysed count might
-- still exceed its (now-corrected) target for some other reason. This
-- does NOT clamp analysed down to target -- it recomputes analysed
-- independently from discovery_jobs and simply writes what that
-- computation says; if analysed still exceeds the now-repaired target
-- after this, that is a genuinely different, not-yet-understood issue
-- that must be investigated on its own terms, never silently forced to
-- match.
-- ============================================================
with per_scan as (
  select
    scan_id,
    count(*) filter (where job_type = 'brand_relationship_expansion' and status = 'completed') as brands_analysed,
    coalesce(sum(safe_jsonb_int(progress, 'itemsSearched'))
      filter (where job_type = 'brand_relationship_expansion' and status = 'completed'), 0) as signals_reviewed,
    coalesce(sum(safe_jsonb_int(progress, 'entitiesUpserted'))
      filter (where job_type = 'brand_relationship_expansion' and status = 'completed'), 0) as entity_count,
    coalesce(sum(safe_jsonb_int(progress, 'relationshipsUpserted'))
      filter (where job_type = 'brand_relationship_expansion' and status = 'completed'), 0)
    + coalesce(sum(safe_jsonb_int(progress, 'newRelationshipsFound'))
      filter (where job_type = 'entity_expansion' and status = 'completed'), 0) as relationship_count,
    coalesce(sum(safe_jsonb_int(progress, 'opportunitiesUpserted'))
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

-- ============================================================
-- Step 4 (verification-only, informational): after the two updates
-- above, this SELECT should return zero rows. It's read-only and safe to
-- run again any time -- included here so the migration's own output
-- makes the fix's success visible immediately, not just inferred.
-- ============================================================
do $$
declare v_remaining integer;
begin
  select count(*) into v_remaining
  from scans
  where scan_type = 'deep' and comparable_brands_analysed > comparable_brands_target;

  if v_remaining > 0 then
    raise notice 'STILL % deep scan(s) with comparable_brands_analysed > comparable_brands_target after reconciliation -- investigate individually, do not clamp.', v_remaining;
  else
    raise notice 'Reconciliation complete: no deep scan has comparable_brands_analysed > comparable_brands_target.';
  end if;
end $$;
