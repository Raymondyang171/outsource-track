-- Create a dedicated multi-assignee table for tasks while keeping the legacy owner columns.
-- Backfill strategy: later work should copy each task's `owner_user_id`/`owner_unit_id` into this table once clients read from it.
BEGIN;

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
          AND tablename = 'project_task_assignees'
          AND policyname = 'project_task_assignees_insert_org'
    ) THEN
        CREATE POLICY project_task_assignees_insert_org ON public.project_task_assignees
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
          AND tablename = 'project_task_assignees'
          AND policyname = 'project_task_assignees_update_org'
    ) THEN
        CREATE POLICY project_task_assignees_update_org ON public.project_task_assignees
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
          AND tablename = 'project_task_assignees'
          AND policyname = 'project_task_assignees_delete_org'
    ) THEN
        CREATE POLICY project_task_assignees_delete_org ON public.project_task_assignees
            FOR DELETE USING (
                public.is_platform_admin()
                OR public.is_org_member(org_id)
            );
    END IF;
END
$$;

COMMIT;
