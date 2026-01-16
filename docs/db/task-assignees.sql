-- Task assignees: add per-task unit/user assignment

alter table public.project_tasks
  add column if not exists owner_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_tasks_owner_user_id_fkey'
  ) then
    alter table public.project_tasks
      add constraint project_tasks_owner_user_id_fkey
      foreign key (owner_user_id)
      references public.profiles(user_id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_project_tasks_owner_user_id
  on public.project_tasks(owner_user_id);
