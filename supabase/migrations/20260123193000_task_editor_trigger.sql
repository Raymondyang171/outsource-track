create or replace function public.is_task_editor(p_task_id uuid)
returns boolean
language sql
stable
as $$
  select
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.project_tasks t
        where t.id = p_task_id
          and t.owner_user_id = auth.uid()
      )
      or exists (
        select 1
        from public.project_task_assignees a
        where a.task_id = p_task_id
          and a.user_id = auth.uid()
      )
    );
$$;

create or replace function public.project_tasks_before_update_guard()
returns trigger
language plpgsql
as $function$
begin
  if new.progress is distinct from old.progress then
    if not (
      public.has_project_perm(new.project_id, 'timeline.edit.progress')
      or public.is_task_editor(new.id)
    ) then
      raise exception 'permission_denied';
    end if;
  end if;

  if new.start_offset_days is distinct from old.start_offset_days
     or new.duration_days is distinct from old.duration_days then
    if not (
      public.has_project_perm(new.project_id, 'timeline.edit.schedule')
      or public.is_task_editor(new.id)
    ) then
      raise exception 'permission_denied';
    end if;
  end if;

  if new.owner_unit_id is distinct from old.owner_unit_id
     or new.owner_user_id is distinct from old.owner_user_id then
    if not (
      public.has_project_perm(new.project_id, 'timeline.edit.owner')
      or public.is_task_editor(new.id)
    ) then
      raise exception 'permission_denied';
    end if;
  end if;

  if new.name is distinct from old.name
     or new.code is distinct from old.code
     or new.phase_name is distinct from old.phase_name
     or new.seq is distinct from old.seq then
    if not (
      public.has_project_perm(new.project_id, 'task.update')
      or public.is_task_editor(new.id)
    ) then
      raise exception 'permission_denied';
    end if;
  end if;

  return new;
end;
$function$;
