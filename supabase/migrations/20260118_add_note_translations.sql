-- Add note translation records with verification metadata and RLS.
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.note_translations') IS NULL THEN
        CREATE TABLE public.note_translations (
            id uuid DEFAULT gen_random_uuid() NOT NULL,
            org_id uuid NOT NULL,
            unit_id uuid NOT NULL,
            to_unit_id uuid,
            source_table text NOT NULL,
            source_id uuid NOT NULL,
            source_note text NOT NULL,
            source_lang text DEFAULT 'zh-Hant'::text NOT NULL,
            source_updated_at timestamp with time zone,
            target_lang text NOT NULL,
            translated_note text NOT NULL,
            translated_by uuid NOT NULL,
            translated_at timestamp with time zone DEFAULT now() NOT NULL,
            status text DEFAULT 'pending'::text NOT NULL,
            verified_by uuid,
            verified_at timestamp with time zone,
            verification_note text,
            created_at timestamp with time zone DEFAULT now() NOT NULL,
            updated_at timestamp with time zone DEFAULT now() NOT NULL
        );
    END IF;
END
$$;

ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS unit_id uuid NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS to_unit_id uuid;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS source_table text NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS source_id uuid NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS source_note text NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS source_lang text DEFAULT 'zh-Hant'::text NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS source_updated_at timestamp with time zone;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS target_lang text NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS translated_note text NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS translated_by uuid NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS translated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS verified_by uuid;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS verification_note text;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.note_translations
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_pkey'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_pkey PRIMARY KEY (id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_source_table_check'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_source_table_check
            CHECK (source_table = ANY (ARRAY['progress_logs'::text, 'assist_requests'::text, 'cost_requests'::text]));
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_status_check'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_status_check
            CHECK (status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text]));
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_org_id_fkey'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_unit_id_fkey'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_to_unit_id_fkey'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_to_unit_id_fkey FOREIGN KEY (to_unit_id) REFERENCES public.units(id) ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_translated_by_fkey'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_translated_by_fkey FOREIGN KEY (translated_by) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_translations_verified_by_fkey'
          AND conrelid = 'public.note_translations'::regclass
    ) THEN
        ALTER TABLE public.note_translations
            ADD CONSTRAINT note_translations_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_note_translations_org_unit ON public.note_translations USING btree (org_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_note_translations_to_unit ON public.note_translations USING btree (org_id, to_unit_id);
CREATE INDEX IF NOT EXISTS idx_note_translations_source ON public.note_translations USING btree (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_note_translations_status ON public.note_translations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_note_translations_target_lang ON public.note_translations USING btree (target_lang);
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_translations_verified_unique
    ON public.note_translations (source_table, source_id, target_lang)
    WHERE status = 'verified';

ALTER TABLE public.note_translations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'note_translations'
          AND policyname = 'note_translations_select_org'
    ) THEN
        CREATE POLICY note_translations_select_org ON public.note_translations
            FOR SELECT USING (
                public.is_platform_admin()
                OR public.is_org_admin_or_manager(org_id)
                OR public.is_unit_member(org_id, unit_id)
                OR public.is_unit_member(org_id, to_unit_id)
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'note_translations'
          AND policyname = 'note_translations_insert_unit'
    ) THEN
        CREATE POLICY note_translations_insert_unit ON public.note_translations
            FOR INSERT WITH CHECK (
                public.is_platform_admin()
                OR public.is_org_admin_or_manager(org_id)
                OR public.is_unit_member(org_id, unit_id)
                OR public.is_unit_member(org_id, to_unit_id)
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'note_translations'
          AND policyname = 'note_translations_update_admin'
    ) THEN
        CREATE POLICY note_translations_update_admin ON public.note_translations
            FOR UPDATE USING (
                public.is_platform_admin()
                OR public.is_org_admin_or_manager(org_id)
            ) WITH CHECK (
                public.is_platform_admin()
                OR public.is_org_admin_or_manager(org_id)
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'note_translations'
          AND policyname = 'note_translations_update_author'
    ) THEN
        CREATE POLICY note_translations_update_author ON public.note_translations
            FOR UPDATE USING (
                translated_by = auth.uid()
                AND status = 'pending'
            ) WITH CHECK (
                translated_by = auth.uid()
                AND status = 'pending'
                AND verified_by IS NULL
                AND verified_at IS NULL
            );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'note_translations'
          AND policyname = 'note_translations_delete_author'
    ) THEN
        CREATE POLICY note_translations_delete_author ON public.note_translations
            FOR DELETE USING (
                public.is_platform_admin()
                OR public.is_org_admin_or_manager(org_id)
                OR (translated_by = auth.uid() AND status = 'pending')
            );
    END IF;
END
$$;

COMMIT;
