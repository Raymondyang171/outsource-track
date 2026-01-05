# CONTEXT — outsource-track（外包報工 Web + App）

## Current Phase
- Phase: 2A
- Status: ✅ Repo synced to GitHub main
- Goal (Phase 2A): Org/Unit governance + RLS (read org, write unit)

## Architecture
- Frontend: Next.js (App Router)
- Backend: Supabase (Auth / Postgres / RLS / Storage)

## Tenancy Model
- org_id: (stored in env; do not commit)
- unit_id: (stored in env; do not commit)
- Rule:
  - SELECT: same org can read
  - WRITE: same org + same unit can write

## DB / RLS Status
- Tables already have org_id/unit_id:
  - drive_items, progress_logs, memberships
- Phase 2A planned/required:
  - projects: add unit_id + backfill to demo unit + NOT NULL + FK + index
  - project_tasks: add org_id/unit_id + backfill from projects + NOT NULL + FK + index
- RLS helpers:
  - public.is_org_member(org_id)
  - public.is_unit_member(org_id, unit_id)

## Smoke Test
- scripts/rls-smoke-test.mjs
- Result: (TODO: run & paste JSON output here)

## Repo Hygiene
- Ignore:
  - .tmp/
  - supabase/.temp/
  - .env / .env.local

## Next Step (Phase 2B)
- Update app layer to always write org_id/unit_id for INSERT/UPDATE
- Split read/write paths:
  - client: anon + user session (RLS enforced)
  - server/admin: service_role (bypass RLS for admin operations)
- Implement minimal UI flow:
  - Project list → Task list → Task editor sheet → progress log write
