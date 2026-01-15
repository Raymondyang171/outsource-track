## Unreleased
- Fix cross-unit drive access by validating task org/unit membership and reusing shared guard. (`lib/guards/ensureTaskAccess.ts`, `app/api/drive/upload/route.ts`, `app/api/drive/delete/route.ts`, `app/api/drive/thumbnail/route.ts`, `app/projects/[id]/page.tsx`, `lib/permissions.ts`)
- Add drive_items integrity migration, quarantine table, and backfill script to sync org/unit with project_tasks; mismatches are quarantined. (`docs/db/drive-items-integrity.sql`, `scripts/backfill_drive_items.sql`)
- Enable device allowlist by wiring Next.js middleware to update sessions, enforce device checks on /api, and log blocked devices. (`middleware.ts`, `utils/supabase/updateSession.ts`, `proxy.ts`)
