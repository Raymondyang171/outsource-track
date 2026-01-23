-- Roll back RLS enablement and restore access for drive_items_quarantine and role_permissions.
BEGIN;

ALTER TABLE public.drive_items_quarantine DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.drive_items_quarantine TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.role_permissions TO anon, authenticated;

COMMIT;
