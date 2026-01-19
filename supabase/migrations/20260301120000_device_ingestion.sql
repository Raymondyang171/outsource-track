-- Device and ingestion logging
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text null,
  org_id uuid not null references public.orgs(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  device_id text not null,
  device_name text null,
  user_agent text null,
  last_seen_at timestamptz not null default now(),
  approved boolean not null default false,
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id)
);

create unique index if not exists idx_devices_user_device
  on public.devices(user_id, device_id);

create index if not exists idx_devices_org_unit
  on public.devices(org_id, unit_id);

create index if not exists idx_devices_approved
  on public.devices(approved);

create or replace function public.touch_devices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_devices_updated_at on public.devices;
create trigger trg_devices_updated_at
before update on public.devices
for each row execute function public.touch_devices_updated_at();

alter table public.devices enable row level security;

drop policy if exists devices_select_unit on public.devices;
drop policy if exists devices_insert_unit on public.devices;
drop policy if exists devices_update_admin on public.devices;

create policy devices_select_unit
on public.devices
for select
using (public.is_unit_member(org_id, unit_id));

create policy devices_insert_unit
on public.devices
for insert
with check (
  public.is_unit_member(org_id, unit_id)
  and user_id = auth.uid()
);

create policy devices_update_admin
on public.devices
for update
using (
  public.is_org_role(org_id, array['manager'::public.role_type, 'admin'::public.role_type])
)
with check (
  public.is_org_role(org_id, array['manager'::public.role_type, 'admin'::public.role_type])
);

create table if not exists public.ingestion_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_ingestion_logs_user_key
  on public.ingestion_logs(user_id, idempotency_key);

create index if not exists idx_ingestion_logs_org_unit
  on public.ingestion_logs(org_id, unit_id);

create index if not exists idx_ingestion_logs_device
  on public.ingestion_logs(device_id);

alter table public.ingestion_logs enable row level security;

drop policy if exists ingestion_logs_select_unit on public.ingestion_logs;
drop policy if exists ingestion_logs_insert_unit on public.ingestion_logs;

create policy ingestion_logs_select_unit
on public.ingestion_logs
for select
using (public.is_unit_member(org_id, unit_id));

create policy ingestion_logs_insert_unit
on public.ingestion_logs
for insert
with check (
  public.is_unit_member(org_id, unit_id)
  and user_id = auth.uid()
);

alter table public.progress_logs
  add column if not exists device_id text;

alter table public.drive_items
  add column if not exists device_id text;

create index if not exists idx_progress_logs_device_id
  on public.progress_logs(device_id);

create index if not exists idx_drive_items_device_id
  on public.drive_items(device_id);
