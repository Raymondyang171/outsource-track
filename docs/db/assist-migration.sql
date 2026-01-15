-- Assist Requests (Epic B)
-- Creates assist_requests table + indexes + RLS policies.

create table if not exists public.assist_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_task_id uuid references public.project_tasks(id) on delete cascade,
  to_unit_id uuid references public.units(id) on delete set null,
  requested_by uuid references public.profiles(user_id) on delete set null,
  status text not null default 'open',
  due_date date,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_assist_requests_org_unit
  on public.assist_requests(org_id, unit_id);
create index if not exists idx_assist_requests_project
  on public.assist_requests(project_id);
create index if not exists idx_assist_requests_task
  on public.assist_requests(project_task_id);
create index if not exists idx_assist_requests_status
  on public.assist_requests(status);
create index if not exists idx_assist_requests_due
  on public.assist_requests(due_date);
create index if not exists idx_assist_requests_to_unit
  on public.assist_requests(to_unit_id);

alter table public.assist_requests enable row level security;

drop policy if exists assist_requests_select_org on public.assist_requests;
create policy assist_requests_select_org
on public.assist_requests
for select
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists assist_requests_insert_requester on public.assist_requests;
create policy assist_requests_insert_requester
on public.assist_requests
for insert
with check (public.is_platform_admin() or public.is_unit_member(org_id, unit_id));

drop policy if exists assist_requests_update_parties on public.assist_requests;
create policy assist_requests_update_parties
on public.assist_requests
for update
using (
  public.is_platform_admin() or public.is_unit_member(org_id, unit_id) or public.is_unit_member(org_id, to_unit_id)
)
with check (
  public.is_platform_admin() or public.is_unit_member(org_id, unit_id) or public.is_unit_member(org_id, to_unit_id)
);

drop policy if exists assist_requests_delete_requester on public.assist_requests;
create policy assist_requests_delete_requester
on public.assist_requests
for delete
using (public.is_platform_admin() or public.is_unit_member(org_id, unit_id));
