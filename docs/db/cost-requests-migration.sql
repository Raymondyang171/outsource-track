-- Project Cost Requests (Costs Module)
-- Creates cost_types, cost_requests, cost_items, cost_attachments + RLS + triggers.

create table if not exists public.cost_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_cost_types_org
  on public.cost_types(org_id);

create table if not exists public.cost_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  doc_no text not null,
  request_date date not null,
  requested_by uuid not null references public.profiles(user_id),
  payee_type text not null,
  payee_name text not null,
  currency text not null,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'draft',
  submitted_at timestamp with time zone,
  approved_at timestamp with time zone,
  approved_by uuid references public.profiles(user_id),
  rejected_at timestamp with time zone,
  rejected_reason text,
  payment_date date,
  payment_method text,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint cost_requests_status_check
    check (status in ('draft','submitted','approved','rejected','paid','canceled')),
  constraint cost_requests_payment_date_check
    check (status = 'paid' or payment_date is null)
);

create unique index if not exists idx_cost_requests_org_doc
  on public.cost_requests(org_id, doc_no);
create index if not exists idx_cost_requests_org_project
  on public.cost_requests(org_id, project_id);
create index if not exists idx_cost_requests_org_unit
  on public.cost_requests(org_id, unit_id);
create index if not exists idx_cost_requests_org_status
  on public.cost_requests(org_id, status);
create index if not exists idx_cost_requests_org_request_date
  on public.cost_requests(org_id, request_date);

create table if not exists public.cost_items (
  id uuid primary key default gen_random_uuid(),
  cost_request_id uuid not null references public.cost_requests(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_task_id uuid references public.project_tasks(id) on delete set null,
  expense_type_id uuid not null references public.cost_types(id),
  description text not null,
  qty numeric(14,3) not null default 1,
  uom text,
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  tax_rate numeric(6,4),
  tax_amount numeric(14,2),
  is_tax_included boolean default true,
  incurred_on date,
  used_by uuid references public.profiles(user_id),
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_cost_items_request
  on public.cost_items(cost_request_id);
create index if not exists idx_cost_items_org_unit
  on public.cost_items(org_id, unit_id);
create index if not exists idx_cost_items_project
  on public.cost_items(project_id);

create table if not exists public.cost_attachments (
  id uuid primary key default gen_random_uuid(),
  cost_request_id uuid references public.cost_requests(id) on delete cascade,
  cost_item_id uuid references public.cost_items(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(user_id),
  kind text not null,
  file_name text not null,
  mime_type text,
  storage_provider text not null default 'gdrive',
  external_file_id text,
  web_view_link text,
  invoice_no text,
  issued_on date,
  created_at timestamp with time zone not null default now(),
  constraint cost_attachments_request_or_item_check
    check (cost_request_id is not null or cost_item_id is not null)
);

create index if not exists idx_cost_attachments_request
  on public.cost_attachments(cost_request_id);
create index if not exists idx_cost_attachments_item
  on public.cost_attachments(cost_item_id);
create index if not exists idx_cost_attachments_org_unit
  on public.cost_attachments(org_id, unit_id);

create or replace function public.is_org_role(p_org uuid, p_roles public.role_type[])
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

create or replace function public.cost_items_compute_amount()
returns trigger
language plpgsql
as $$
begin
  if new.qty is null then
    new.qty := 1;
  end if;
  if new.unit_price is null then
    new.unit_price := 0;
  end if;
  new.amount := round(new.qty * new.unit_price, 2);
  if new.tax_rate is not null and new.tax_amount is null then
    new.tax_amount := round(new.amount * new.tax_rate, 2);
  end if;
  return new;
end;
$$;

create or replace function public.recalc_cost_request_total()
returns trigger
language plpgsql
as $$
declare
  v_request_id uuid;
begin
  if tg_op = 'DELETE' then
    v_request_id := old.cost_request_id;
  else
    v_request_id := new.cost_request_id;
  end if;

  update public.cost_requests
  set total_amount = coalesce((
    select sum(amount)
    from public.cost_items
    where cost_request_id = v_request_id
  ), 0)
  where id = v_request_id;

  return null;
end;
$$;

create or replace function public.cost_requests_enforce()
returns trigger
language plpgsql
as $$
declare
  is_admin boolean;
  is_manager boolean;
  transition_ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'paid' and new.payment_date is not null then
      raise exception 'payment_date only allowed when status=paid';
    end if;
    return new;
  end if;

  new.updated_at := now();
  is_admin := public.is_platform_admin() or public.is_org_role(new.org_id, array['admin']::public.role_type[]);
  is_manager := public.is_platform_admin() or public.is_org_role(new.org_id, array['manager','admin']::public.role_type[]);

  if not is_admin and new.status <> old.status then
    transition_ok := false;
    if old.status = 'draft' and new.status = 'submitted' then
      transition_ok := true;
    elsif old.status = 'submitted' and new.status in ('approved', 'rejected') then
      transition_ok := is_manager;
    elsif old.status = 'approved' and new.status = 'paid' then
      transition_ok := is_manager;
    end if;

    if not transition_ok then
      raise exception 'invalid status transition from % to %', old.status, new.status;
    end if;
  end if;

  if new.status in ('approved','rejected','paid') and not is_manager then
    raise exception 'manager or admin role required for % status', new.status;
  end if;

  if new.status <> 'submitted' and new.submitted_at is not null then
    raise exception 'submitted_at only allowed when status=submitted';
  end if;

  if new.status <> 'approved' and (new.approved_at is not null or new.approved_by is not null) then
    raise exception 'approved_at/approved_by only allowed when status=approved';
  end if;

  if new.status <> 'rejected' and (new.rejected_at is not null or new.rejected_reason is not null) then
    raise exception 'rejected_at/rejected_reason only allowed when status=rejected';
  end if;

  if new.status <> 'paid' and new.payment_date is not null then
    raise exception 'payment_date only allowed when status=paid';
  end if;

  return new;
end;
$$;

create or replace function public.upsert_cost_request_with_items(
  p_request_id uuid,
  p_unit_id uuid,
  p_project_id uuid,
  p_doc_no text,
  p_request_date date,
  p_requested_by uuid,
  p_payee_type text,
  p_payee_name text,
  p_currency text,
  p_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'on'
as $$
declare
  v_request_id uuid;
  v_org_id uuid;
  v_unit_id uuid;
  v_items_count int;
begin
  select org_id into v_org_id from public.units where id = p_unit_id;
  if v_org_id is null then
    raise exception 'invalid unit_id';
  end if;

  if not (public.is_platform_admin() or public.is_unit_member(v_org_id, p_unit_id) or public.is_org_role(v_org_id, array['manager','admin']::public.role_type[])) then
    raise exception 'permission_denied';
  end if;

  v_items_count := coalesce(jsonb_array_length(p_items), 0);
  if v_items_count < 1 then
    raise exception 'items_required';
  end if;

  if p_request_id is null then
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
      note
    ) values (
      v_org_id,
      p_unit_id,
      p_project_id,
      p_doc_no,
      p_request_date,
      p_requested_by,
      p_payee_type,
      p_payee_name,
      p_currency,
      p_note
    )
    returning id into v_request_id;
  else
    select org_id, unit_id into v_org_id, v_unit_id
    from public.cost_requests
    where id = p_request_id;

    if v_org_id is null then
      raise exception 'request_not_found';
    end if;

    if not (public.is_platform_admin() or public.is_unit_member(v_org_id, v_unit_id) or public.is_org_role(v_org_id, array['manager','admin']::public.role_type[])) then
      raise exception 'permission_denied';
    end if;

    update public.cost_requests
    set doc_no = p_doc_no,
        request_date = p_request_date,
        payee_type = p_payee_type,
        payee_name = p_payee_name,
        currency = p_currency,
        note = p_note
    where id = p_request_id
    returning id into v_request_id;

    delete from public.cost_items where cost_request_id = v_request_id;
  end if;

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
    v_request_id,
    v_org_id,
    p_unit_id,
    p_project_id,
    (item->>'expense_type_id')::uuid,
    item->>'description',
    coalesce((item->>'qty')::numeric, 1),
    nullif(item->>'uom', ''),
    coalesce((item->>'unit_price')::numeric, 0),
    nullif(item->>'tax_rate', '')::numeric,
    coalesce((item->>'is_tax_included')::boolean, true),
    nullif(item->>'incurred_on', '')::date
  from jsonb_array_elements(p_items) as item;

  return v_request_id;
end;
$$;

grant execute on function public.upsert_cost_request_with_items(
  uuid,
  uuid,
  uuid,
  text,
  date,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;

drop trigger if exists trg_cost_items_compute_amount on public.cost_items;
create trigger trg_cost_items_compute_amount
before insert or update on public.cost_items
for each row
execute function public.cost_items_compute_amount();

drop trigger if exists trg_recalc_cost_request_total on public.cost_items;
create trigger trg_recalc_cost_request_total
after insert or update or delete on public.cost_items
for each row
execute function public.recalc_cost_request_total();

drop trigger if exists trg_cost_requests_enforce on public.cost_requests;
create trigger trg_cost_requests_enforce
before insert or update on public.cost_requests
for each row
execute function public.cost_requests_enforce();

alter table public.cost_types enable row level security;
alter table public.cost_requests enable row level security;
alter table public.cost_items enable row level security;
alter table public.cost_attachments enable row level security;

drop policy if exists cost_types_select_org on public.cost_types;
create policy cost_types_select_org
on public.cost_types
for select
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists cost_types_write_admin on public.cost_types;
create policy cost_types_write_admin
on public.cost_types
for all
using (public.is_platform_admin() or public.is_org_role(org_id, array['manager','admin']::public.role_type[]))
with check (public.is_platform_admin() or public.is_org_role(org_id, array['manager','admin']::public.role_type[]));

drop policy if exists cost_requests_select_org on public.cost_requests;
create policy cost_requests_select_org
on public.cost_requests
for select
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or public.is_unit_member(org_id, unit_id)
);

drop policy if exists cost_requests_insert_unit on public.cost_requests;
create policy cost_requests_insert_unit
on public.cost_requests
for insert
with check (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (public.is_unit_member(org_id, unit_id) and status in ('draft','submitted'))
);

drop policy if exists cost_requests_update_unit on public.cost_requests;
create policy cost_requests_update_unit
on public.cost_requests
for update
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or public.is_unit_member(org_id, unit_id)
)
with check (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (public.is_unit_member(org_id, unit_id) and status in ('draft','submitted'))
);

drop policy if exists cost_requests_delete_unit on public.cost_requests;
create policy cost_requests_delete_unit
on public.cost_requests
for delete
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (public.is_unit_member(org_id, unit_id) and status in ('draft','submitted'))
);

drop policy if exists cost_items_select_org on public.cost_items;
create policy cost_items_select_org
on public.cost_items
for select
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or public.is_unit_member(org_id, unit_id)
);

drop policy if exists cost_items_write_unit on public.cost_items;
create policy cost_items_write_unit
on public.cost_items
for insert
with check (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (
    public.is_unit_member(org_id, unit_id)
    and exists (
      select 1
      from public.cost_requests cr
      where cr.id = cost_items.cost_request_id
        and cr.status in ('draft','submitted')
    )
  )
);

drop policy if exists cost_items_update_unit on public.cost_items;
create policy cost_items_update_unit
on public.cost_items
for update
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (
    public.is_unit_member(org_id, unit_id)
    and exists (
      select 1
      from public.cost_requests cr
      where cr.id = cost_items.cost_request_id
        and cr.status in ('draft','submitted')
    )
  )
)
with check (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (
    public.is_unit_member(org_id, unit_id)
    and exists (
      select 1
      from public.cost_requests cr
      where cr.id = cost_items.cost_request_id
        and cr.status in ('draft','submitted')
    )
  )
);

drop policy if exists cost_items_delete_unit on public.cost_items;
create policy cost_items_delete_unit
on public.cost_items
for delete
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (
    public.is_unit_member(org_id, unit_id)
    and exists (
      select 1
      from public.cost_requests cr
      where cr.id = cost_items.cost_request_id
        and cr.status in ('draft','submitted')
    )
  )
);

drop policy if exists cost_attachments_select_org on public.cost_attachments;
create policy cost_attachments_select_org
on public.cost_attachments
for select
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or public.is_unit_member(org_id, unit_id)
);

drop policy if exists cost_attachments_insert_unit on public.cost_attachments;
create policy cost_attachments_insert_unit
on public.cost_attachments
for insert
with check (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (
    public.is_unit_member(org_id, unit_id)
    and (
      exists (
        select 1
        from public.cost_requests cr
        where cr.id = cost_attachments.cost_request_id
          and cr.status in ('draft','submitted')
      )
      or exists (
        select 1
        from public.cost_items ci
        join public.cost_requests cr on cr.id = ci.cost_request_id
        where ci.id = cost_attachments.cost_item_id
          and cr.status in ('draft','submitted')
      )
    )
  )
);

drop policy if exists cost_attachments_update_unit on public.cost_attachments;
create policy cost_attachments_update_unit
on public.cost_attachments
for update
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or public.is_unit_member(org_id, unit_id)
)
with check (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (
    public.is_unit_member(org_id, unit_id)
    and (
      exists (
        select 1
        from public.cost_requests cr
        where cr.id = cost_attachments.cost_request_id
          and cr.status in ('draft','submitted')
      )
      or exists (
        select 1
        from public.cost_items ci
        join public.cost_requests cr on cr.id = ci.cost_request_id
        where ci.id = cost_attachments.cost_item_id
          and cr.status in ('draft','submitted')
      )
    )
  )
);

drop policy if exists cost_attachments_delete_unit on public.cost_attachments;
create policy cost_attachments_delete_unit
on public.cost_attachments
for delete
using (
  public.is_platform_admin()
  or public.is_org_role(org_id, array['manager','admin']::public.role_type[])
  or (
    public.is_unit_member(org_id, unit_id)
    and (
      exists (
        select 1
        from public.cost_requests cr
        where cr.id = cost_attachments.cost_request_id
          and cr.status in ('draft','submitted')
      )
      or exists (
        select 1
        from public.cost_items ci
        join public.cost_requests cr on cr.id = ci.cost_request_id
        where ci.id = cost_attachments.cost_item_id
          and cr.status in ('draft','submitted')
      )
    )
  )
);
