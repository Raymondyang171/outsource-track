-- Activity logs: actions + system errors/warnings
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('action', 'error', 'warn', 'info')),
  action text null,
  resource text null,
  record_id uuid null,
  org_id uuid null,
  unit_id uuid null,
  user_id uuid null,
  user_email text null,
  source text null,
  message text null,
  meta jsonb null
);

create index if not exists idx_activity_logs_org_created
  on public.activity_logs(org_id, created_at desc);

create index if not exists idx_activity_logs_event
  on public.activity_logs(event_type);

create index if not exists idx_activity_logs_action
  on public.activity_logs(action);

alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_select_org on public.activity_logs;

create policy activity_logs_select_org
on public.activity_logs
for select
using (public.is_platform_admin() or public.is_org_member(org_id));

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_unit uuid;
  v_record uuid;
  v_email text;
  v_new jsonb;
  v_old jsonb;
begin
  v_new := to_jsonb(NEW);
  v_old := to_jsonb(OLD);
  v_org := coalesce(
    (v_new->>'org_id')::uuid,
    (v_old->>'org_id')::uuid
  );
  v_unit := coalesce(
    (v_new->>'unit_id')::uuid,
    (v_old->>'unit_id')::uuid
  );
  v_record := coalesce(
    (v_new->>'id')::uuid,
    (v_new->>'user_id')::uuid,
    (v_old->>'id')::uuid,
    (v_old->>'user_id')::uuid
  );
  begin
    v_email := current_setting('request.jwt.claim.email', true);
  exception when others then
    v_email := null;
  end;

  insert into public.activity_logs (
    event_type,
    action,
    resource,
    record_id,
    org_id,
    unit_id,
    user_id,
    user_email,
    source,
    message,
    meta
  ) values (
    'action',
    lower(TG_OP),
    TG_TABLE_NAME,
    v_record,
    v_org,
    v_unit,
    auth.uid(),
    v_email,
    'db',
    null,
    jsonb_build_object('new', v_new, 'old', v_old)
  );

  return coalesce(NEW, OLD);
end;
$$;

-- Attach triggers to core tables
drop trigger if exists trg_activity_projects on public.projects;
create trigger trg_activity_projects
after insert or update or delete on public.projects
for each row execute function public.log_activity();

drop trigger if exists trg_activity_project_tasks on public.project_tasks;
create trigger trg_activity_project_tasks
after insert or update or delete on public.project_tasks
for each row execute function public.log_activity();

drop trigger if exists trg_activity_drive_items on public.drive_items;
create trigger trg_activity_drive_items
after insert or update or delete on public.drive_items
for each row execute function public.log_activity();

drop trigger if exists trg_activity_cost_requests on public.cost_requests;
create trigger trg_activity_cost_requests
after insert or update or delete on public.cost_requests
for each row execute function public.log_activity();

drop trigger if exists trg_activity_cost_items on public.cost_items;
create trigger trg_activity_cost_items
after insert or update or delete on public.cost_items
for each row execute function public.log_activity();

drop trigger if exists trg_activity_cost_attachments on public.cost_attachments;
create trigger trg_activity_cost_attachments
after insert or update or delete on public.cost_attachments
for each row execute function public.log_activity();

drop trigger if exists trg_activity_orgs on public.orgs;
create trigger trg_activity_orgs
after insert or update or delete on public.orgs
for each row execute function public.log_activity();

drop trigger if exists trg_activity_units on public.units;
create trigger trg_activity_units
after insert or update or delete on public.units
for each row execute function public.log_activity();

drop trigger if exists trg_activity_memberships on public.memberships;
create trigger trg_activity_memberships
after insert or update or delete on public.memberships
for each row execute function public.log_activity();

drop trigger if exists trg_activity_role_permissions on public.role_permissions;
create trigger trg_activity_role_permissions
after insert or update or delete on public.role_permissions
for each row execute function public.log_activity();

drop trigger if exists trg_activity_profiles on public.profiles;
create trigger trg_activity_profiles
after insert or update or delete on public.profiles
for each row execute function public.log_activity();
