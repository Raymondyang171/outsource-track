-- Org branding + job titles + task assignees + profiles RLS (idempotent)
BEGIN;

CREATE TABLE IF NOT EXISTS public.job_titles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.job_titles
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.job_titles
    ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL;
ALTER TABLE public.job_titles
    ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.job_titles
    ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.job_titles
    ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.job_titles
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'job_titles_org_id_fkey'
          AND conrelid = 'public.job_titles'::regclass
    ) THEN
        ALTER TABLE public.job_titles
            ADD CONSTRAINT job_titles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'job_titles_created_by_fkey'
          AND conrelid = 'public.job_titles'::regclass
    ) THEN
        ALTER TABLE public.job_titles
            ADD CONSTRAINT job_titles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'job_titles_org_name_key'
          AND conrelid = 'public.job_titles'::regclass
    ) THEN
        ALTER TABLE public.job_titles
            ADD CONSTRAINT job_titles_org_name_key UNIQUE (org_id, name);
    END IF;
END
$$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS job_title_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_job_title_id_fkey'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_job_title_id_fkey FOREIGN KEY (job_title_id) REFERENCES public.job_titles(id);
    END IF;
END
$$;

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_titles'
          AND policyname = 'job_titles_select_org'
    ) THEN
        CREATE POLICY job_titles_select_org ON public.job_titles
            FOR SELECT USING (
                public.is_platform_admin()
                OR public.is_org_member(org_id)
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_titles'
          AND policyname = 'job_titles_insert_org'
    ) THEN
        CREATE POLICY job_titles_insert_org ON public.job_titles
            FOR INSERT WITH CHECK (
                public.is_platform_admin()
                OR public.is_org_member(org_id)
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_titles'
          AND policyname = 'job_titles_update_org'
    ) THEN
        CREATE POLICY job_titles_update_org ON public.job_titles
            FOR UPDATE USING (
                public.is_platform_admin()
                OR public.is_org_member(org_id)
            ) WITH CHECK (
                public.is_platform_admin()
                OR public.is_org_member(org_id)
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_titles'
          AND policyname = 'job_titles_delete_org'
    ) THEN
        CREATE POLICY job_titles_delete_org ON public.job_titles
            FOR DELETE USING (
                public.is_platform_admin()
                OR public.is_org_member(org_id)
            );
    END IF;
END
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_insert_self'
    ) THEN
        CREATE POLICY profiles_insert_self ON public.profiles
            FOR INSERT WITH CHECK (
                auth.uid() = user_id
                OR public.is_platform_admin()
                OR EXISTS (
                    SELECT 1
                    FROM public.memberships m
                    WHERE m.user_id = user_id
                      AND public.is_org_role(m.org_id, array['manager'::public.role_type, 'admin'::public.role_type])
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_update_self'
    ) THEN
        CREATE POLICY profiles_update_self ON public.profiles
            FOR UPDATE USING (
                auth.uid() = user_id
            ) WITH CHECK (
                auth.uid() = user_id
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_update_admin'
    ) THEN
        CREATE POLICY profiles_update_admin ON public.profiles
            FOR UPDATE USING (
                public.is_platform_admin()
                OR EXISTS (
                    SELECT 1
                    FROM public.memberships m
                    WHERE m.user_id = user_id
                      AND public.is_org_role(m.org_id, array['manager'::public.role_type, 'admin'::public.role_type])
                )
            ) WITH CHECK (
                public.is_platform_admin()
                OR EXISTS (
                    SELECT 1
                    FROM public.memberships m
                    WHERE m.user_id = user_id
                      AND public.is_org_role(m.org_id, array['manager'::public.role_type, 'admin'::public.role_type])
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF to_regclass('public.project_task_assignees') IS NULL THEN
        CREATE TABLE public.project_task_assignees (
            id uuid DEFAULT gen_random_uuid() NOT NULL,
            task_id uuid NOT NULL,
            org_id uuid NOT NULL,
            unit_id uuid NOT NULL,
            user_id uuid NOT NULL,
            created_at timestamp with time zone DEFAULT now() NOT NULL
        );
    END IF;
END
$$;

ALTER TABLE public.project_task_assignees
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.project_task_assignees
    ADD COLUMN IF NOT EXISTS task_id uuid NOT NULL;
ALTER TABLE public.project_task_assignees
    ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL;
ALTER TABLE public.project_task_assignees
    ADD COLUMN IF NOT EXISTS unit_id uuid NOT NULL;
ALTER TABLE public.project_task_assignees
    ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.project_task_assignees
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_task_assignees_pkey'
          AND conrelid = 'public.project_task_assignees'::regclass
    ) THEN
        ALTER TABLE public.project_task_assignees
            ADD CONSTRAINT project_task_assignees_pkey PRIMARY KEY (id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_task_assignees_task_user_key'
          AND conrelid = 'public.project_task_assignees'::regclass
    ) THEN
        ALTER TABLE public.project_task_assignees
            ADD CONSTRAINT project_task_assignees_task_user_key UNIQUE (task_id, user_id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_task_assignees_task_id_fkey'
          AND conrelid = 'public.project_task_assignees'::regclass
    ) THEN
        ALTER TABLE public.project_task_assignees
            ADD CONSTRAINT project_task_assignees_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.project_tasks(id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_task_assignees_org_id_fkey'
          AND conrelid = 'public.project_task_assignees'::regclass
    ) THEN
        ALTER TABLE public.project_task_assignees
            ADD CONSTRAINT project_task_assignees_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_task_assignees_unit_id_fkey'
          AND conrelid = 'public.project_task_assignees'::regclass
    ) THEN
        ALTER TABLE public.project_task_assignees
            ADD CONSTRAINT project_task_assignees_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_task_assignees_user_id_fkey'
          AND conrelid = 'public.project_task_assignees'::regclass
    ) THEN
        ALTER TABLE public.project_task_assignees
            ADD CONSTRAINT project_task_assignees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_project_task_assignees_task_id ON public.project_task_assignees USING btree (task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_assignees_org_id ON public.project_task_assignees USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_project_task_assignees_task_org ON public.project_task_assignees USING btree (task_id, org_id);

ALTER TABLE public.project_task_assignees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_task_assignees'
          AND policyname = 'project_task_assignees_select_org'
    ) THEN
        CREATE POLICY project_task_assignees_select_org ON public.project_task_assignees
            FOR SELECT USING (
                public.is_platform_admin()
                OR (
                    public.is_org_member(org_id)
                    AND EXISTS (
                        SELECT 1
                        FROM public.project_tasks t
                        WHERE t.id = task_id
                          AND t.org_id = org_id
                    )
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_task_assignees'
          AND policyname = 'project_task_assignees_insert_org'
    ) THEN
        CREATE POLICY project_task_assignees_insert_org ON public.project_task_assignees
            FOR INSERT WITH CHECK (
                public.is_platform_admin()
                OR (
                    public.is_org_member(org_id)
                    AND EXISTS (
                        SELECT 1
                        FROM public.project_tasks t
                        WHERE t.id = task_id
                          AND t.org_id = org_id
                    )
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_task_assignees'
          AND policyname = 'project_task_assignees_update_org'
    ) THEN
        CREATE POLICY project_task_assignees_update_org ON public.project_task_assignees
            FOR UPDATE USING (
                public.is_platform_admin()
                OR (
                    public.is_org_member(org_id)
                    AND EXISTS (
                        SELECT 1
                        FROM public.project_tasks t
                        WHERE t.id = task_id
                          AND t.org_id = org_id
                    )
                )
            ) WITH CHECK (
                public.is_platform_admin()
                OR (
                    public.is_org_member(org_id)
                    AND EXISTS (
                        SELECT 1
                        FROM public.project_tasks t
                        WHERE t.id = task_id
                          AND t.org_id = org_id
                    )
                )
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_task_assignees'
          AND policyname = 'project_task_assignees_delete_org'
    ) THEN
        CREATE POLICY project_task_assignees_delete_org ON public.project_task_assignees
            FOR DELETE USING (
                public.is_platform_admin()
                OR (
                    public.is_org_member(org_id)
                    AND EXISTS (
                        SELECT 1
                        FROM public.project_tasks t
                        WHERE t.id = task_id
                          AND t.org_id = org_id
                    )
                )
            );
    END IF;
END
$$;

ALTER TABLE public.orgs
    ADD COLUMN IF NOT EXISTS logo_url text;

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
