import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import ConfirmForm from "@/components/confirm-form";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function encodeMsg(msg: string) {
  return encodeURIComponent(msg);
}

async function createUnitAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const formOrgId = String(formData.get("org_id") ?? "").trim();
  if (!name || !formOrgId) {
    redirect(`/admin/units?error=${encodeMsg("department name and company are required")}`);
  }
  const adminClient = createAdminSupabase();
  const allowed = await checkPermission(adminClient, user.id, formOrgId, "departments", "create");
  if (!allowed) {
    redirect(`/admin/units?error=${encodeMsg("permission_denied")}`);
  }
  const { error } = await adminClient.from("units").insert({ name, org_id: formOrgId });
  if (error) {
    redirect(`/admin/units?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/units?ok=created`);
}

async function updateUnitAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const unitId = String(formData.get("unit_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!unitId || !name || !orgId) {
    redirect(`/admin/units?error=${encodeMsg("department id, name, and company are required")}`);
  }
  const adminClient = createAdminSupabase();
  const allowed = await checkPermission(adminClient, user.id, orgId, "departments", "update");
  if (!allowed) {
    redirect(`/admin/units?error=${encodeMsg("permission_denied")}`);
  }
  const { error } = await adminClient.from("units").update({ name, org_id: orgId }).eq("id", unitId);
  if (error) {
    redirect(`/admin/units?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/units?ok=updated`);
}

async function deleteUnitAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const unitId = String(formData.get("unit_id") ?? "").trim();
  if (!unitId) {
    redirect(`/admin/units?error=${encodeMsg("department id is required")}`);
  }
  const adminClient = createAdminSupabase();
  const { data: unitRow } = await adminClient
    .from("units")
    .select("org_id")
    .eq("id", unitId)
    .maybeSingle();
  const allowed = await checkPermission(adminClient, user.id, unitRow?.org_id ?? null, "departments", "delete");
  if (!allowed) {
    redirect(`/admin/units?error=${encodeMsg("permission_denied")}`);
  }
  const { error } = await adminClient.from("units").delete().eq("id", unitId);
  if (error) {
    redirect(`/admin/units?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/units?ok=deleted`);
}

export default async function AdminUnitsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const errorMsg = getParam(sp?.error);
  const okMsg =
    ok === "created" ? "已新增部門。" : ok === "updated" ? "已更新部門。" : ok === "deleted" ? "已刪除部門。" : null;

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const missingKey = !process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!user) {
    redirect("/login");
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    admin = null;
  }

  if (missingKey || !admin) {
    return (
      <div className="admin-page">
        Missing <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>.
      </div>
    );
  }

  const { data: myMems, error: myErr } = await admin
    .from("memberships")
    .select("org_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (myErr) {
    return <div className="admin-page">membership lookup failed: {myErr.message}</div>;
  }

  const orgId = myMems?.[0]?.org_id ?? null;

  const orgQuery = admin.from("orgs").select("id, name");
  const { data: orgs, error: orgErr } = orgId ? await orgQuery.eq("id", orgId) : await orgQuery;

  const unitsQuery = admin
    .from("units")
    .select("id, name, created_at, org_id")
    .order("name", { ascending: true });
  const { data: units, error } = orgId ? await unitsQuery.eq("org_id", orgId) : await unitsQuery;

  const orgNameById = Object.fromEntries((orgs ?? []).map((org) => [org.id, org.name]));
  const deptPerms = await getPermissionsForResource(admin, user.id, orgId, "departments");
  const canRead = deptPerms.permissions?.read ?? false;
  const canCreate = deptPerms.permissions?.create ?? false;
  const canUpdate = deptPerms.permissions?.update ?? false;
  const canDelete = deptPerms.permissions?.delete ?? false;

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>部門設定</h1>
        <p className="admin-error">目前角色沒有檢視權限。</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>部門設定</h1>
      {!orgId && <p>尚未綁定公司，暫時顯示全部資料。</p>}
      {okMsg && <p className="admin-success">{okMsg}</p>}
      {errorMsg && <p className="admin-error">{decodeURIComponent(errorMsg)}</p>}
      {orgErr && <p className="admin-error">{orgErr.message}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!units || units.length === 0) && <p>目前沒有部門。</p>}
      {!error && canCreate && (
        <form className="admin-form" action={createUnitAction}>
          <select name="org_id" defaultValue={orgId ?? ""}>
            <option value="">選擇公司</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="部門名稱" />
          <button type="submit">新增部門</button>
        </form>
      )}
      {!error && units && units.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>部門</th>
              <th>公司</th>
              <th>操作</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.id}>
                <td>{unit.name}</td>
                <td>{orgNameById[unit.org_id] ?? "-"}</td>
                <td>
                  <div className="admin-row-actions">
                    <form action={updateUnitAction}>
                      <input type="hidden" name="unit_id" value={unit.id} />
                      <select name="org_id" defaultValue={unit.org_id}>
                        {(orgs ?? []).map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                      <input name="name" defaultValue={unit.name} />
                      <button type="submit" disabled={!canUpdate}>更新</button>
                    </form>
                    <ConfirmForm action={deleteUnitAction} confirmMessage="確定要刪除此部門？" hidden={!canDelete}>
                      <input type="hidden" name="unit_id" value={unit.id} />
                      <button type="submit" className="btn btn-ghost" disabled={!canDelete}>刪除</button>
                    </ConfirmForm>
                  </div>
                </td>
                <td>{new Date(unit.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
