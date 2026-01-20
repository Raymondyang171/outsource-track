-- Add job_titles table, FK to profiles, and normalize profiles.job_title_id.
-- Choosing job_title_id keeps job titles in a dedicated table instead of duplicating raw text.
BEGIN;

CREATE TABLE public.job_titles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT job_titles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE,
    CONSTRAINT job_titles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    CONSTRAINT job_titles_org_name_key UNIQUE (org_id, name)
);

ALTER TABLE public.profiles
    ADD COLUMN job_title_id uuid;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_job_title_id_fkey FOREIGN KEY (job_title_id) REFERENCES public.job_titles(id);

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_titles_select_org ON public.job_titles
    FOR SELECT USING (
        public.is_platform_admin()
        OR public.is_org_member(org_id)
    );

CREATE POLICY job_titles_insert_org ON public.job_titles
    FOR INSERT WITH CHECK (
        public.is_platform_admin()
        OR public.is_org_member(org_id)
    );

CREATE POLICY job_titles_update_org ON public.job_titles
    FOR UPDATE USING (
        public.is_platform_admin()
        OR public.is_org_member(org_id)
    ) WITH CHECK (
        public.is_platform_admin()
        OR public.is_org_member(org_id)
    );

CREATE POLICY job_titles_delete_org ON public.job_titles
    FOR DELETE USING (
        public.is_platform_admin()
        OR public.is_org_member(org_id)
    );

COMMIT;
