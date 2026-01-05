# Phase 2A Definition of Done

## Scope
- Schema updates for org/unit governance.
- RLS policies enforcing: read by org, write by same org+unit.

## Preconditions
- Supabase project accessible.
- `docs/db/phase-2a-migration.sql` is the source of truth.

## Acceptance Checklist

### A. Schema Migration
- [ ] `projects.unit_id` exists, is NOT NULL, and has FK to `units(id)`.
- [ ] `project_tasks.org_id` and `project_tasks.unit_id` exist, are NOT NULL, and have FK to `orgs(id)` / `units(id)`.
- [ ] Indexes exist: `idx_projects_org_unit`, `idx_project_tasks_org_unit`, `idx_project_tasks_project_id`.
- [ ] Backfill verified: no null org/unit and tasks match project org/unit.

### B. RLS Functions
- [ ] `public.is_org_member(org_id)` exists.
- [ ] `public.is_unit_member(org_id, unit_id)` exists.

### C. RLS Policies
- [ ] `projects` read policy = org-level.
- [ ] `projects` write policy = org+unit.
- [ ] `project_tasks` read policy = org-level.
- [ ] `project_tasks` write policy = org+unit.
- [ ] `progress_logs` read policy = org-level.
- [ ] `progress_logs` write policy = org+unit.

### D. Smoke Test (Required)
Run `scripts/rls-smoke-test.mjs` with anon key and verify:
- [ ] Positive tests (same org + same unit) succeed for SELECT/INSERT/UPDATE/DELETE.
- [ ] Negative tests (same org, different unit) are blocked for INSERT/UPDATE/DELETE.
- [ ] Negative tests (different org) are blocked for SELECT/INSERT/UPDATE/DELETE.

### E. Evidence
- [ ] Save SQL verification outputs in `docs/db/phase-2a-acceptance.md`.
- [ ] Save smoke test output in `docs/db/phase-2a-acceptance.md` or `docs/db/phase-2a-acceptance.log`.

## Evidence Template (Paste into acceptance)
```text
[SQL] projects.unit_id null count = 0
[SQL] project_tasks org/unit null count = 0
[SQL] project_tasks org/unit mismatch count = 0
[Smoke] positive: PASS
[Smoke] negative same org diff unit: BLOCKED
[Smoke] negative diff org: BLOCKED
```
