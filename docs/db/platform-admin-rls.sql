begin;

-- Platform admin guard + org status isolation.

alter table public.orgs
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orgs_status_check'
  ) then
    alter table public.orgs
      add constraint orgs_status_check
      check (status in ('active', 'suspended'));
  end if;
end $$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'platform_role') = 'super_admin', false);
$$;

create or replace function public.is_org_active(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.orgs o
    where o.id = p_org
      and o.status = 'active'
  );
$$;

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
      and public.is_org_active(p_org)
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
      and public.is_org_active(p_org)
  );
$$;

create or replace function public.is_org_role(p_org uuid, p_roles public.role_type[])
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
      and m.role = any(p_roles)
      and public.is_org_active(p_org)
  );
$$;

alter table public.orgs enable row level security;

drop policy if exists orgs_select_member on public.orgs;
drop policy if exists orgs_platform_admin on public.orgs;

create policy orgs_platform_admin
on public.orgs
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists memberships_select_member on public.memberships;
drop policy if exists memberships_select_own on public.memberships;

create policy memberships_select_member
on public.memberships
for select
using (
  public.is_org_active(org_id)
  and (
    user_id = auth.uid()
    or public.is_org_member(org_id)
  )
);

create policy memberships_select_own
on public.memberships
for select
to authenticated
using (public.is_org_active(org_id) and user_id = auth.uid());

commit;
