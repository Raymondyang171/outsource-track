-- Rollback for 20260122_seed_role_permissions_member_manager.sql
delete from role_permissions
where role in ('member', 'manager')
  and resource in ('projects', 'tasks');
