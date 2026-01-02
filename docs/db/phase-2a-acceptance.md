# Phase 2A Acceptance

## Meta
- Date: 2026-01-02
- Env: Supabase (project ref: )
- org_id: 27a437dd-3206-4734-8708-8d00eee0e2d1
- demo_unit_id: 7e51a3e8-af71-41cc-8dbe-3ca978530e4c
- Migration file: docs/db/phase-2a-migration.sql

---

## 1) Schema Backfill Verification (SQL)

### 1.1 projects.unit_id should be NOT NULL
```sql
select count(*) as projects_unit_null
from public.projects
where unit_id is null;

[
  {
    "projects_unit_null": 0
  }
]

### 1.2 project_tasks org_id/unit_id should be NOT NULL
select
  sum((org_id is null)::int) as tasks_org_null,
  sum((unit_id is null)::int) as tasks_unit_null
from public.project_tasks;
260102
[
  {
    "tasks_org_null": 0,
    "tasks_unit_null": 0
  }
]

### 1.3 project_tasks org/unit must match projects org/unit
select count(*) as tasks_mismatch
from public.project_tasks t
join public.projects p on p.id = t.project_id
where t.org_id <> p.org_id or t.unit_id <> p.unit_id;

[
  {
    "tasks_mismatch": 0
  }
]