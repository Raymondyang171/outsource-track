-- Add project updates table with RLS.
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.project_updates') IS NULL THEN
        CREATE TABLE public.project_updates (
            id uuid DEFAULT gen_random_uuid() NOT NULL,
            org_id uuid NOT NULL,
            project_id uuid NOT NULL,
            content text NOT NULL,
            created_by uuid,
            created_at timestamp with time zone DEFAULT now() NOT NULL
        );
    END IF;
END
$$;

ALTER TABLE public.project_updates
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.project_updates
    ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL;
ALTER TABLE public.project_updates
    ADD COLUMN IF NOT EXISTS project_id uuid NOT NULL;
ALTER TABLE public.project_updates
    ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.project_updates
    ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.project_updates
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_updates_pkey'
          AND conrelid = 'public.project_updates'::regclass
    ) THEN
        ALTER TABLE public.project_updates
            ADD CONSTRAINT project_updates_pkey PRIMARY KEY (id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_updates_project_id_fkey'
          AND conrelid = 'public.project_updates'::regclass
    ) THEN
        ALTER TABLE public.project_updates
            ADD CONSTRAINT project_updates_project_id_fkey
            FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_updates_created_by_fkey'
          AND conrelid = 'public.project_updates'::regclass
    ) THEN
        ALTER TABLE public.project_updates
            ADD CONSTRAINT project_updates_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_project_updates_project_created_at
    ON public.project_updates (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_updates_org_id
    ON public.project_updates (org_id);

ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_updates'
          AND policyname = 'project_updates_select'
    ) THEN
        CREATE POLICY project_updates_select ON public.project_updates
            FOR SELECT USING (
                public.has_project_perm(project_id, 'project.view')
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_updates'
          AND policyname = 'project_updates_insert'
    ) THEN
        CREATE POLICY project_updates_insert ON public.project_updates
            FOR INSERT WITH CHECK (
                public.has_project_perm(project_id, 'project.update')
                AND (created_by IS NULL OR created_by = auth.uid())
            );
    END IF;
END
$$;

COMMIT;
