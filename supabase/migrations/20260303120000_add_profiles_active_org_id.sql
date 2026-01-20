-- Add active_org_id to profiles with FK and index.
ALTER TABLE public.profiles
  ADD COLUMN active_org_id uuid NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_org_id_fkey
  FOREIGN KEY (active_org_id)
  REFERENCES public.orgs(id);

CREATE INDEX profiles_active_org_id_idx
  ON public.profiles(active_org_id);

-- Allow users to update their own profile row (for active_org_id).
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
