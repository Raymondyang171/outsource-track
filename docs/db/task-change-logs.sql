-- Task change logs (per-task history)
create table if not exists public.task_change_logs (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  org_id uuid,
  unit_id uuid,
  user_id uuid,
  action text not null,
  completed_at timestamptz,
  note text,
  created_at timestamptz default now() not null
);

create index if not exists idx_task_change_logs_task_id on public.task_change_logs(task_id);
create index if not exists idx_task_change_logs_org_unit on public.task_change_logs(org_id, unit_id);
