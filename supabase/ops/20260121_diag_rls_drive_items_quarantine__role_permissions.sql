-- Diagnose RLS status and table privileges for drive_items_quarantine and role_permissions.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('drive_items_quarantine', 'role_permissions')
ORDER BY c.relname;

SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('drive_items_quarantine', 'role_permissions')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
