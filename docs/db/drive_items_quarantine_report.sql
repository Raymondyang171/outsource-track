
-- =========================================================
-- Drive Items Quarantine Report
-- Goal:
--   1) Provide a summary of items in the quarantine table.
--   2) Group items by the reason they were quarantined.
--   3) List recent items for manual inspection.
-- =========================================================

-- 1. Total count of quarantined items
select
  count(*) as total_quarantined_items
from public.drive_items_quarantine;


-- 2. Count of items by quarantine reason
select
  quarantine_reason,
  count(*) as number_of_items
from public.drive_items_quarantine
group by quarantine_reason
order by number_of_items desc;


-- 3. List of the 100 most recently quarantined items
select
  id,
  name,
  project_task_id,
  org_id,
  unit_id,
  quarantine_reason,
  quarantined_at
from public.drive_items_quarantine
order by quarantined_at desc
limit 100;
