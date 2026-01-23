-- Enable RLS and revoke access for drive_items_quarantine and role_permissions.
BEGIN;

ALTER TABLE public.drive_items_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.drive_items_quarantine FROM anon, authenticated;
REVOKE ALL ON TABLE public.role_permissions FROM anon, authenticated;

COMMIT;
