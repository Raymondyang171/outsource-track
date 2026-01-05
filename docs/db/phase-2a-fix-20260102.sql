begin;

-- Fix RLS recursion on helper functions
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_unit_member(p_org uuid, p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p_org
      and m.unit_id = p_unit
      and m.user_id = auth.uid()
  );
$$;

-- Remove legacy policies that bypass unit checks
drop policy if exists progress_logs_insert_org_member on public.progress_logs;
drop policy if exists progress_logs_select_org_member on public.progress_logs;

commit;
