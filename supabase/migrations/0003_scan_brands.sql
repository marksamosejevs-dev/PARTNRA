-- Which brands THIS SCAN resolved/discovered -- brands themselves are
-- shared global-graph intelligence (no business_id column), but a job
-- like entity_expansion ("does this entity also connect to OTHER brands
-- THIS scan already knows about") must only check against brands
-- actually relevant to this business's own scan, never the entire global
-- brand table across every customer's scans.
create table if not exists scan_brands (
  scan_id uuid not null references scans(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scan_id, brand_id)
);
