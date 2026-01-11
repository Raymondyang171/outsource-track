begin;

-- Seed: 綠能環保設備股份有限公司 demo 資料
-- 注意：若 template_tasks 未成功寫入，project_tasks 會是 0。
-- 這裡加入 guard，避免「成功但沒資料」的情況重演。

with seed_people as (
  select * from (values
    ('王志明-總經理', 'admin',   '管理',   'gm@green-demo.com'),
    ('林采恩-採購',   'member',  '採購',   'buy@green-demo.com'),
    ('陳建豪-倉管',   'member',  '倉管',   'wh@green-demo.com'),
    ('張雅婷-專案',   'manager', '專案',   'pm@green-demo.com'),
    ('郭承叡-安裝A1', 'member',  '安裝一隊', 'a1@green-demo.com'),
    ('黃思怡-安裝A2', 'member',  '安裝一隊', 'a2@green-demo.com'),
    ('蔡博翔-安裝A3', 'member',  '安裝一隊', 'a3@green-demo.com'),
    ('吳佩蓉-安裝A4', 'member',  '安裝一隊', 'a4@green-demo.com'),
    ('何俊宏-安裝B1', 'member',  '安裝二隊', 'b1@green-demo.com'),
    ('李佳蓉-安裝B2', 'member',  '安裝二隊', 'b2@green-demo.com'),
    ('周偉廷-安裝B3', 'member',  '安裝二隊', 'b3@green-demo.com'),
    ('蘇雨潔-安裝B4', 'member',  '安裝二隊', 'b4@green-demo.com'),
    ('許庭瑜-設計1',  'member',  '設計',   'd1@green-demo.com'),
    ('鄭柏宇-設計2',  'member',  '設計',   'd2@green-demo.com'),
    ('邱紹傑-業務1',  'member',  '業務',   's1@green-demo.com'),
    ('潘若馨-業務2',  'member',  '業務',   's2@green-demo.com')
  ) as p(display_name, role, unit_name, email)
),
auth_people as (
  select sp.*, u.id as user_id
  from seed_people sp
  join auth.users u on u.email = sp.email
),
missing_people as (
  select sp.email
  from seed_people sp
  left join auth.users u on u.email = sp.email
  where u.id is null
),

org_ins as (
  insert into public.orgs (name)
  select '綠能環保設備股份有限公司'
  where not exists (
    select 1 from public.orgs where name = '綠能環保設備股份有限公司'
  )
  returning id
),
org as (
  select id from org_ins
  union all
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),

units_ins as (
  insert into public.units (org_id, name)
  select o.id, u.name
  from org o
  join (values
    ('管理'), ('採購'), ('倉管'), ('專案'),
    ('安裝一隊'), ('安裝二隊'), ('設計'), ('業務')
  ) as u(name) on true
  where not exists (
    select 1 from public.units x where x.org_id = o.id and x.name = u.name
  )
  returning id, name, org_id
),
units as (
  select id, name, org_id
  from public.units
  where org_id = (select id from org)
),

profiles_upsert as (
  insert into public.profiles (user_id, display_name)
  select user_id, display_name from auth_people
  on conflict (user_id)
  do update set display_name = excluded.display_name
  returning user_id
),
memberships_upsert as (
  insert into public.memberships (org_id, unit_id, user_id, role)
  select u.org_id, u.id, p.user_id, p.role::public.role_type
  from auth_people p
  join units u on u.name = p.unit_name
  on conflict (org_id, unit_id, user_id)
  do update set role = excluded.role
  returning user_id
),

admin_perm as (
  insert into public.role_permissions (role, resource, can_read, can_create, can_update, can_delete)
  values
    ('admin', 'users', true, true, true, true),
    ('admin', 'memberships', true, true, true, true)
  on conflict (role, resource)
  do update set
    can_read = excluded.can_read,
    can_create = excluded.can_create,
    can_update = excluded.can_update,
    can_delete = excluded.can_delete,
    updated_at = now()
),

template_root as (
  insert into public.templates (org_id, name, created_by)
  select o.id, '環保設備安裝標準流程',
         (select user_id from auth_people where email = 'gm@green-demo.com' limit 1)
  from org o
  where not exists (
    select 1 from public.templates t
    where t.org_id = o.id and t.name = '環保設備安裝標準流程'
  )
  returning id, org_id
),
template as (
  select id, org_id from template_root
  union all
  select id, org_id from public.templates
  where org_id = (select id from org) and name = '環保設備安裝標準流程'
  limit 1
),

template_phases_seed as (
  select * from (values
    (1, '需求/現勘', '#2f80ed'),
    (2, '設計',     '#27ae60'),
    (3, '採購',     '#f2994a'),
    (4, '備料/排程', '#9b51e0'),
    (5, '現場安裝', '#eb5757'),
    (6, '試車/驗收', '#333333')
  ) as v(seq, name, color)
),
template_phases_upsert as (
  insert into public.template_phases (template_id, seq, name, color)
  select t.id, v.seq, v.name, v.color
  from template t
  join template_phases_seed v on true
  on conflict (template_id, seq)
  do update set name = excluded.name, color = excluded.color
  returning id, template_id, seq
),
template_phases as (
  select id, template_id, seq
  from public.template_phases
  where template_id = (select id from template)
),

template_tasks_seed as (
  select * from (values
    (1, 1, 'A1', '現勘排程', 2, '業務'),
    (1, 2, 'A2', '現勘與需求確認', 3, '專案'),
    (1, 3, 'A3', '提案/報價確認', 3, '業務'),

    (2, 1, 'B1', '系統設計初版', 5, '設計'),
    (2, 2, 'B2', '圖面審核定版', 4, '設計'),

    (3, 1, 'C1', '主要設備採購', 7, '採購'),
    (3, 2, 'C2', '加工/外包協調', 5, '採購'),

    (4, 1, 'D1', '到貨點收/入庫', 2, '倉管'),
    (4, 2, 'D2', '排程與人力配置', 2, '專案'),

    (5, 1, 'E1', '安裝施工', 10, '安裝一隊'),
    (5, 2, 'E2', '配管/配線', 7, '安裝二隊'),

    (6, 1, 'F1', '試車調校', 4, '專案'),
    (6, 2, 'F2', '驗收文件', 2, '專案')
  ) as v(phase_seq, seq, code, name, days, unit_name)
),
template_tasks_upsert as (
  insert into public.template_tasks
    (phase_id, seq, code, name, default_duration_days, default_owner_unit_id)
  select ph.id, v.seq, v.code, v.name, v.days, u.id
  from template_tasks_seed v
  join template_phases ph on ph.seq = v.phase_seq
  join units u on u.name = v.unit_name
  on conflict (phase_id, seq)
  do update set
    code = excluded.code,
    name = excluded.name,
    default_duration_days = excluded.default_duration_days,
    default_owner_unit_id = excluded.default_owner_unit_id
  returning id
),

projects_seed as (
  select * from (values
    ('P01 竹北科技廠廢氣處理', date '2025-01-05', 'active', 15),
    ('P02 高雄化工廠除塵系統', date '2025-01-12', 'active', 30),
    ('P03 桃園電子廠 VOC 回收', date '2025-01-20', 'active', 45),
    ('P04 台中鋼鐵廠水處理',  date '2024-12-20', 'active', 60),
    ('P05 新竹園區洗滌塔',    date '2024-12-10', 'active', 80),
    ('P06 宜蘭食品廠臭氣處理', date '2024-11-01', 'done',   100),
    ('P07 台南電鍍廠廢水',    date '2025-01-08', 'paused', 35),
    ('P08 彰化塑膠廠集塵',    date '2025-02-01', 'active', 5)
  ) as v(name, start_date, status, progress)
),

projects_ins as (
  insert into public.projects (org_id, template_id, name, start_date, status, created_by, unit_id)
  select
    t.org_id,
    t.id,
    v.name,
    v.start_date,
    v.status,
    (select user_id from auth_people where email = 'pm@green-demo.com' limit 1),
    (select id from units where name = '專案' limit 1)
  from template t
  join projects_seed v on true
  where not exists (
    select 1 from public.projects p where p.org_id = t.org_id and p.name = v.name
  )
  returning id, name, org_id, template_id
),
projects as (
  select id, name, org_id, template_id, unit_id
  from public.projects
  where org_id = (select id from org)
    and name in (select name from projects_seed)
),

guard_template_tasks as (
  select 1 as ok
  from public.template_tasks tt
  join public.template_phases tp on tp.id = tt.phase_id
  join public.templates t on t.id = tp.template_id
  where t.org_id = (select id from org)
  limit 1
),

project_tasks_upsert as (
  insert into public.project_tasks
    (project_id, phase_name, seq, code, name, start_offset_days, duration_days, owner_unit_id, progress, org_id, unit_id)
  select
    p.id,
    ph.name as phase_name,
    row_number() over (partition by p.id order by ph.seq, tt.seq) as seq,
    tt.code,
    tt.name,
    case ph.seq
      when 1 then 0
      when 2 then 7
      when 3 then 21
      when 4 then 35
      when 5 then 49
      else 70
    end as start_offset_days,
    tt.default_duration_days,
    tt.default_owner_unit_id,
    v.progress,
    p.org_id,
    p.unit_id
  from projects p
  join projects_seed v on v.name = p.name
  join public.template_phases ph on ph.template_id = p.template_id
  join public.template_tasks tt on tt.phase_id = ph.id
  join guard_template_tasks g on true
  on conflict (project_id, seq)
  do update set
    phase_name = excluded.phase_name,
    code = excluded.code,
    name = excluded.name,
    start_offset_days = excluded.start_offset_days,
    duration_days = excluded.duration_days,
    owner_unit_id = excluded.owner_unit_id,
    progress = excluded.progress,
    org_id = excluded.org_id,
    unit_id = excluded.unit_id
  returning id, project_id, name
),

progress_logs_seed as (
  select * from (values
    ('P04 台中鋼鐵廠水處理', '安裝施工', 60, '現場安裝進行中'),
    ('P05 新竹園區洗滌塔',   '試車調校', 80, '試車調校中'),
    ('P06 宜蘭食品廠臭氣處理', '驗收文件', 100, '已完成驗收')
  ) as v(project_name, task_name, progress, note)
)

insert into public.progress_logs
  (project_task_id, org_id, unit_id, user_id, progress, note)
select
  t.id,
  p.org_id,
  p.unit_id,
  (select user_id from auth_people where email = 'pm@green-demo.com' limit 1),
  v.progress,
  v.note
from progress_logs_seed v
join projects p on p.name = v.project_name
join public.project_tasks t on t.project_id = p.id and t.name = v.task_name;

-- 若有缺少 auth.users 的帳號會列在這裡
select * from missing_people;

commit;
