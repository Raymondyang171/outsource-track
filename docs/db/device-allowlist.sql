-- Device allowlist for access control
create table if not exists public.device_allowlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text null,
  org_id uuid null references public.orgs(id) on delete set null,
  unit_id uuid null references public.units(id) on delete set null,
  device_id text not null,
  device_name text null,
  user_agent text null,
  last_seen_at timestamptz not null default now(),
  approved boolean not null default false,
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id)
);

create unique index if not exists idx_device_allowlist_user_device
  on public.device_allowlist(user_id, device_id);

create index if not exists idx_device_allowlist_org
  on public.device_allowlist(org_id);

create index if not exists idx_device_allowlist_user
  on public.device_allowlist(user_id);

create index if not exists idx_device_allowlist_approved
  on public.device_allowlist(approved);

create or replace function public.touch_device_allowlist_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_device_allowlist_updated_at on public.device_allowlist;
create trigger trg_device_allowlist_updated_at
before update on public.device_allowlist
for each row execute function public.touch_device_allowlist_updated_at();

alter table public.device_allowlist enable row level security;

drop policy if exists device_allowlist_select_own on public.device_allowlist;
drop policy if exists device_allowlist_insert_own on public.device_allowlist;
drop policy if exists device_allowlist_update_admin on public.device_allowlist;

create policy device_allowlist_select_own
on public.device_allowlist
for select
using (user_id = auth.uid() or public.is_platform_admin());

create policy device_allowlist_insert_own
on public.device_allowlist
for insert
with check (user_id = auth.uid());

create policy device_allowlist_update_admin
on public.device_allowlist
for update
using (public.is_platform_admin());

do $$
begin
  if to_regclass('public.device_allowlist') is not null
     and to_regprocedure('public.log_activity()') is not null then
    drop trigger if exists trg_activity_device_allowlist on public.device_allowlist;
    create trigger trg_activity_device_allowlist
    after insert or update or delete on public.device_allowlist
    for each row execute function public.log_activity();
  end if;
end $$;
