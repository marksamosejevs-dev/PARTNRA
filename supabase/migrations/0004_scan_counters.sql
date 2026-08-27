-- Atomic counter increments for scan progress. A plain read-then-write
-- from application code would race if two worker ticks ever overlap for
-- the same scan (e.g. a scheduled-function invocation still finishing
-- when the next one fires) -- this makes "+= delta" a single atomic
-- statement per column instead.
create or replace function increment_scan_counters(
  p_scan_id uuid,
  p_comparable_brands_analysed integer default 0,
  p_signals_reviewed integer default 0,
  p_entity_count integer default 0,
  p_relationship_count integer default 0,
  p_opportunity_count integer default 0
) returns scans as $$
declare
  result scans;
begin
  update scans set
    comparable_brands_analysed = comparable_brands_analysed + p_comparable_brands_analysed,
    signals_reviewed = signals_reviewed + p_signals_reviewed,
    entity_count = entity_count + p_entity_count,
    relationship_count = relationship_count + p_relationship_count,
    opportunity_count = opportunity_count + p_opportunity_count
  where id = p_scan_id
  returning * into result;
  return result;
end;
$$ language plpgsql;

-- Appends one warning string to the scan's warnings jsonb array --
-- likewise atomic, so concurrent job failures on the same scan don't
-- clobber each other's warning entries.
create or replace function append_scan_warning(p_scan_id uuid, p_warning text)
returns void as $$
begin
  update scans set warnings = warnings || to_jsonb(p_warning)
  where id = p_scan_id;
end;
$$ language plpgsql;
