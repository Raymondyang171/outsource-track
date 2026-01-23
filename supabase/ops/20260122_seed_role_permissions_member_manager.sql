-- Seed minimal read access for member/manager to restore sidebar visibility.
insert into role_permissions (role, resource, can_read, can_create, can_update, can_delete)
values
  ('member', 'projects', true, true, true, false),
  ('member', 'tasks', true, true, true, false),
  ('manager', 'projects', true, true, true, true),
  ('manager', 'tasks', true, true, true, true)
on conflict (role, resource) do update
set
  can_read = excluded.can_read,
  can_create = excluded.can_create,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete;
