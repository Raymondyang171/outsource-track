-- Seed: 綠能環保設備股份有限公司 demo 資料
-- 分段執行：每個區塊都是獨立 SQL，依序執行即可。

-- Step 1: org
insert into public.orgs (name)
select '綠能環保設備股份有限公司'
where not exists (
  select 1 from public.orgs where name = '綠能環保設備股份有限公司'
);

-- Step 2: units
insert into public.units (org_id, name)
select o.id, u.name
from public.orgs o
join (values
  ('管理'), ('採購'), ('倉管'), ('專案'),
  ('安裝一隊'), ('安裝二隊'), ('設計'), ('業務')
) as u(name) on true
where o.name = '綠能環保設備股份有限公司'
  and not exists (
    select 1 from public.units x where x.org_id = o.id and x.name = u.name
  );

-- Step 3: profiles
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
)
insert into public.profiles (user_id, display_name)
select user_id, display_name from auth_people
on conflict (user_id)
 do update set display_name = excluded.display_name;

-- Step 4: memberships
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
org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
units as (
  select id, name, org_id from public.units where org_id = (select id from org)
)
insert into public.memberships (org_id, unit_id, user_id, role)
select u.org_id, u.id, p.user_id, p.role::public.role_type
from auth_people p
join units u on u.name = p.unit_name
on conflict (org_id, unit_id, user_id)
 do update set role = excluded.role;

-- Step 5: admin permissions
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
  updated_at = now();

-- Step 6: template root
with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
seed_people as (
  select * from (values
    ('gm@green-demo.com')
  ) as p(email)
),
auth_people as (
  select sp.*, u.id as user_id
  from seed_people sp
  join auth.users u on u.email = sp.email
)
insert into public.templates (org_id, name, created_by)
select o.id, '環保設備安裝標準流程',
       (select user_id from auth_people limit 1)
from org o
where not exists (
  select 1 from public.templates t
  where t.org_id = o.id and t.name = '環保設備安裝標準流程'
);

-- Step 7: template phases
with template as (
  select id from public.templates
  where org_id = (select id from public.orgs where name = '綠能環保設備股份有限公司')
    and name = '環保設備安裝標準流程'
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
)
insert into public.template_phases (template_id, seq, name, color)
select t.id, v.seq, v.name, v.color
from template t
join template_phases_seed v on true
on conflict (template_id, seq)
 do update set name = excluded.name, color = excluded.color;

-- Step 8: template tasks
with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
units as (
  select id, name from public.units where org_id = (select id from org)
),
template as (
  select id from public.templates
  where org_id = (select id from org) and name = '環保設備安裝標準流程'
  limit 1
),
template_phases as (
  select id, seq from public.template_phases
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
)
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
  default_owner_unit_id = excluded.default_owner_unit_id;

-- Step 9: projects
with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
template as (
  select id, org_id from public.templates
  where org_id = (select id from org) and name = '環保設備安裝標準流程'
  limit 1
),
seed_people as (
  select * from (values
    ('pm@green-demo.com')
  ) as p(email)
),
auth_people as (
  select sp.*, u.id as user_id
  from seed_people sp
  join auth.users u on u.email = sp.email
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
)
insert into public.projects (org_id, template_id, name, start_date, status, created_by, unit_id)
select
  t.org_id,
  t.id,
  v.name,
  v.start_date,
  v.status,
  (select user_id from auth_people limit 1),
  (select id from public.units where org_id = t.org_id and name = '專案' limit 1)
from template t
join projects_seed v on true
where not exists (
  select 1 from public.projects p where p.org_id = t.org_id and p.name = v.name
);

-- Step 10: project tasks
with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
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
projects as (
  select id, name, org_id, template_id, unit_id
  from public.projects
  where org_id = (select id from org)
    and name in (select name from projects_seed)
),
template_phases as (
  select id, seq, template_id, name
  from public.template_phases
  where template_id in (select template_id from projects)
),
template_tasks as (
  select tt.*
  from public.template_tasks tt
  join template_phases ph on ph.id = tt.phase_id
)
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
join template_phases ph on ph.template_id = p.template_id
join template_tasks tt on tt.phase_id = ph.id
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
  unit_id = excluded.unit_id;

-- Step 11: progress logs
with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
projects as (
  select id, name, org_id, unit_id
  from public.projects
  where org_id = (select id from org)
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
  (select id from auth.users where email = 'pm@green-demo.com' limit 1),
  v.progress,
  v.note
from progress_logs_seed v
join projects p on p.name = v.project_name
join public.project_tasks t on t.project_id = p.id and t.name = v.task_name;

-- Step 12: set admin claims (run before cost data blocks)
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    '11fb6653-e9c9-4e46-8fb5-31330cd56530',
    'role',
    'authenticated',
    'platform_role',
    'super_admin'
  )::text,
  true
);

-- Step 13: ensure admin profile
insert into public.profiles (user_id, display_name)
values ('11fb6653-e9c9-4e46-8fb5-31330cd56530', '平台管理者')
on conflict (user_id)
 do update set display_name = excluded.display_name;

-- Step 14: ensure admin membership
with admin_unit as (
  select u.id, u.org_id
  from public.units u
  join public.orgs o on o.id = u.org_id
  where o.name = '綠能環保設備股份有限公司' and u.name = '管理'
  limit 1
)
insert into public.memberships (org_id, unit_id, user_id, role)
select au.org_id, au.id, '11fb6653-e9c9-4e46-8fb5-31330cd56530', 'admin'::public.role_type
from admin_unit au
on conflict (org_id, unit_id, user_id)
 do update set role = excluded.role;

-- Step 15: cost types
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    '11fb6653-e9c9-4e46-8fb5-31330cd56530',
    'role',
    'authenticated',
    'platform_role',
    'super_admin'
  )::text,
  true
);

with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
cost_types_seed as (
  select * from (values
    ('設備採購'),
    ('外包工程'),
    ('運輸物流'),
    ('耗材'),
    ('人工'),
    ('租賃'),
    ('其他')
  ) as v(name)
)
insert into public.cost_types (org_id, name)
select o.id, v.name
from org o
join cost_types_seed v on true
where not exists (
  select 1 from public.cost_types ct
  where ct.org_id = o.id and ct.name = v.name
);

-- Step 16: cost requests
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    '11fb6653-e9c9-4e46-8fb5-31330cd56530',
    'role',
    'authenticated',
    'platform_role',
    'super_admin'
  )::text,
  true
);

with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
cost_requests_seed as (
  select * from (values
    ('P01 竹北科技廠廢氣處理', '採購',   'CR-2025-001', date '2025-01-10', 'pm@green-demo.com', 'vendor', '宏盛環保設備', 'TWD', 'approved', null::date, '主要設備採購'),
    ('P01 竹北科技廠廢氣處理', '安裝一隊', 'CR-2025-002', date '2025-02-05', 'pm@green-demo.com', 'vendor', '鼎立工程行',   'TWD', 'paid',    date '2025-02-20', '現場安裝工資'),
    ('P02 高雄化工廠除塵系統', '採購',   'CR-2025-003', date '2025-01-15', 'pm@green-demo.com', 'vendor', '高雄機電有限公司', 'TWD', 'approved', null::date, '除塵系統材料'),
    ('P02 高雄化工廠除塵系統', '安裝二隊', 'CR-2025-004', date '2025-03-01', 'pm@green-demo.com', 'vendor', '天揚管線',       'TWD', 'paid',    date '2025-03-15', '管線外包'),
    ('P03 桃園電子廠 VOC 回收', '設計',   'CR-2025-005', date '2025-02-18', 'pm@green-demo.com', 'vendor', '新衡設計顧問',     'TWD', 'approved', null::date, 'VOC 回收設計費'),
    ('P04 台中鋼鐵廠水處理',  '採購',   'CR-2025-006', date '2025-01-22', 'pm@green-demo.com', 'vendor', '中台水務',         'TWD', 'paid',    date '2025-02-05', '水處理設備'),
    ('P05 新竹園區洗滌塔',    '安裝一隊', 'CR-2025-007', date '2025-01-30', 'pm@green-demo.com', 'vendor', '新竹安裝有限公司', 'TWD', 'approved', null::date, '洗滌塔安裝'),
    ('P06 宜蘭食品廠臭氣處理', '安裝二隊', 'CR-2025-008', date '2025-02-10', 'pm@green-demo.com', 'vendor', '宜蘭設備工程',     'TWD', 'paid',    date '2025-02-25', '臭氣處理收尾'),
    ('P07 台南電鍍廠廢水',    '倉管',   'CR-2025-009', date '2025-01-18', 'pm@green-demo.com', 'vendor', '南部物流',         'TWD', 'approved', null::date, '電鍍廠廢水耗材'),
    ('P08 彰化塑膠廠集塵',    '採購',   'CR-2025-010', date '2025-02-25', 'pm@green-demo.com', 'vendor', '彰化塑膠機電',     'TWD', 'approved', null::date, '集塵設備採購')
  ) as v(project_name, unit_name, doc_no, request_date, requested_by_email, payee_type, payee_name, currency, status, payment_date, note)
)
insert into public.cost_requests (
  org_id,
  unit_id,
  project_id,
  doc_no,
  request_date,
  requested_by,
  payee_type,
  payee_name,
  currency,
  status,
  payment_date,
  note
)
select
  o.id,
  u.id,
  p.id,
  v.doc_no,
  v.request_date,
  pr.user_id,
  v.payee_type,
  v.payee_name,
  v.currency,
  v.status,
  v.payment_date,
  v.note
from cost_requests_seed v
join org o on true
join public.projects p on p.org_id = o.id and p.name = v.project_name
join public.units u on u.org_id = o.id and u.name = v.unit_name
join auth.users au on au.email = v.requested_by_email
join public.profiles pr on pr.user_id = au.id
on conflict (org_id, doc_no) do nothing;

-- Step 17: cost items
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    '11fb6653-e9c9-4e46-8fb5-31330cd56530',
    'role',
    'authenticated',
    'platform_role',
    'super_admin'
  )::text,
  true
);

with org as (
  select id from public.orgs where name = '綠能環保設備股份有限公司' limit 1
),
cost_items_seed as (
  select * from (values
    ('CR-2025-001', '設備採購', '主機設備與濾材', 1::numeric, '批', 680000::numeric, null::numeric, true, date '2025-01-10'),
    ('CR-2025-001', '運輸物流', '設備運輸與吊裝', 1::numeric, '批', 45000::numeric, null::numeric, true, date '2025-01-11'),
    ('CR-2025-002', '人工',   '安裝施工人力', 120::numeric, '工時', 650::numeric, null::numeric, true, date '2025-02-08'),
    ('CR-2025-002', '耗材',   '配管耗材', 1::numeric, '批', 38000::numeric, null::numeric, true, date '2025-02-06'),
    ('CR-2025-003', '設備採購', '除塵主機與風管', 1::numeric, '批', 520000::numeric, null::numeric, true, date '2025-01-16'),
    ('CR-2025-003', '運輸物流', '運輸與裝卸', 1::numeric, '批', 32000::numeric, null::numeric, true, date '2025-01-17'),
    ('CR-2025-004', '外包工程', '管線外包施工', 1::numeric, '批', 210000::numeric, null::numeric, true, date '2025-03-02'),
    ('CR-2025-004', '租賃',   '高空作業車租賃', 5::numeric, '日', 4500::numeric, null::numeric, true, date '2025-03-03'),
    ('CR-2025-005', '其他',   'VOC 回收系統設計', 1::numeric, '案', 180000::numeric, null::numeric, true, date '2025-02-18'),
    ('CR-2025-006', '設備採購', '水處理主機設備', 1::numeric, '批', 760000::numeric, null::numeric, true, date '2025-01-23'),
    ('CR-2025-006', '耗材',   '濾材耗材', 1::numeric, '批', 52000::numeric, null::numeric, true, date '2025-01-24'),
    ('CR-2025-007', '人工',   '安裝施工人力', 80::numeric, '工時', 650::numeric, null::numeric, true, date '2025-02-01'),
    ('CR-2025-007', '租賃',   '吊車租賃', 2::numeric, '日', 12000::numeric, null::numeric, true, date '2025-02-01'),
    ('CR-2025-008', '外包工程', '收尾調整外包', 1::numeric, '批', 145000::numeric, null::numeric, true, date '2025-02-12'),
    ('CR-2025-008', '耗材',   '現場耗材補充', 1::numeric, '批', 28000::numeric, null::numeric, true, date '2025-02-12'),
    ('CR-2025-009', '耗材',   '管件與耗材', 1::numeric, '批', 62000::numeric, null::numeric, true, date '2025-01-19'),
    ('CR-2025-009', '運輸物流', '倉管配送', 1::numeric, '批', 15000::numeric, null::numeric, true, date '2025-01-20'),
    ('CR-2025-010', '設備採購', '集塵主機設備', 1::numeric, '批', 480000::numeric, null::numeric, true, date '2025-02-26'),
    ('CR-2025-010', '運輸物流', '運輸吊裝', 1::numeric, '批', 30000::numeric, null::numeric, true, date '2025-02-26')
  ) as v(doc_no, expense_type_name, description, qty, uom, unit_price, tax_rate, is_tax_included, incurred_on)
),
cost_requests as (
  select cr.id, cr.org_id, cr.unit_id, cr.project_id, cr.doc_no
  from public.cost_requests cr
  join org o on o.id = cr.org_id
  where cr.doc_no in (
    'CR-2025-001',
    'CR-2025-002',
    'CR-2025-003',
    'CR-2025-004',
    'CR-2025-005',
    'CR-2025-006',
    'CR-2025-007',
    'CR-2025-008',
    'CR-2025-009',
    'CR-2025-010'
  )
),
cost_items_clear as (
  delete from public.cost_items ci
  using cost_requests cr
  where ci.cost_request_id = cr.id
  returning ci.id
)
insert into public.cost_items (
  cost_request_id,
  org_id,
  unit_id,
  project_id,
  expense_type_id,
  description,
  qty,
  uom,
  unit_price,
  tax_rate,
  is_tax_included,
  incurred_on
)
select
  cr.id,
  cr.org_id,
  cr.unit_id,
  cr.project_id,
  ct.id,
  v.description,
  v.qty,
  v.uom,
  v.unit_price,
  v.tax_rate,
  v.is_tax_included,
  v.incurred_on
from cost_items_seed v
join cost_requests cr on cr.doc_no = v.doc_no
join public.cost_types ct on ct.org_id = cr.org_id and ct.name = v.expense_type_name;

-- Step 18: list missing auth.users
select sp.email
from (values
  ('gm@green-demo.com'),
  ('buy@green-demo.com'),
  ('wh@green-demo.com'),
  ('pm@green-demo.com'),
  ('a1@green-demo.com'),
  ('a2@green-demo.com'),
  ('a3@green-demo.com'),
  ('a4@green-demo.com'),
  ('b1@green-demo.com'),
  ('b2@green-demo.com'),
  ('b3@green-demo.com'),
  ('b4@green-demo.com'),
  ('d1@green-demo.com'),
  ('d2@green-demo.com'),
  ('s1@green-demo.com'),
  ('s2@green-demo.com')
) as sp(email)
left join auth.users u on u.email = sp.email
where u.id is null;
