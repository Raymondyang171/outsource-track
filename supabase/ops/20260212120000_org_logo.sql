-- Add org logo storage using a private bucket; store logo_path so access is controlled by RLS.
BEGIN;

ALTER TABLE public.orgs
    ADD COLUMN IF NOT EXISTS logo_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'org_logos_select_org'
    ) THEN
        CREATE POLICY org_logos_select_org ON storage.objects
            FOR SELECT USING (
                bucket_id = 'org-logos'
                AND (
                    public.is_platform_admin()
                    OR public.is_org_member(split_part(name, '/', 2)::uuid)
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'org_logos_insert_admin'
    ) THEN
        CREATE POLICY org_logos_insert_admin ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'org-logos'
                AND split_part(name, '/', 1) = 'orgs'
                AND (
                    public.is_platform_admin()
                    OR public.is_org_admin_or_manager(split_part(name, '/', 2)::uuid)
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'org_logos_update_admin'
    ) THEN
        CREATE POLICY org_logos_update_admin ON storage.objects
            FOR UPDATE USING (
                bucket_id = 'org-logos'
                AND (
                    public.is_platform_admin()
                    OR public.is_org_admin_or_manager(split_part(name, '/', 2)::uuid)
                )
            ) WITH CHECK (
                bucket_id = 'org-logos'
                AND (
                    public.is_platform_admin()
                    OR public.is_org_admin_or_manager(split_part(name, '/', 2)::uuid)
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'org_logos_delete_admin'
    ) THEN
        CREATE POLICY org_logos_delete_admin ON storage.objects
            FOR DELETE USING (
                bucket_id = 'org-logos'
                AND (
                    public.is_platform_admin()
                    OR public.is_org_admin_or_manager(split_part(name, '/', 2)::uuid)
                )
            );
    END IF;
END
$$;

COMMIT;
