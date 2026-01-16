import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import ConfirmForm from "@/components/confirm-form";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CostTypeRow = {
  id: string;
  org_id: string;
  name: string;
  active: boolean;
  created_at: string;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function encodeMsg(msg: string) {
  return encodeURIComponent(msg);
}

async function createCostTypeAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const name = String(formData.get("name") ?? "").trim();
  const orgId = String(formData.get("org_id") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!name || !orgId) {
    redirect(`/admin/cost-types?error=${encodeMsg("cost type name and org are required")}`);
  }

  const adminClient = createAdminSupabase();
  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(adminClient, user.id);
  if (!isPlatformAdmin && (!userOrgId || orgId !== userOrgId)) {
    redirect(`/admin/cost-types?error=${encodeMsg("permission_denied")}`);
  }
  const allowed = isPlatformAdmin || await checkPermission(adminClient, user.id, orgId, "cost_types", "create");
  if (!allowed) {
    redirect(`/admin/cost-types?error=${encodeMsg("permission_denied")}`);
  }

  const { error } = await adminClient.from("cost_types").insert({
    org_id: orgId,
    name,
    active,
  });
  if (error) {
    redirect(`/admin/cost-types?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/cost-types?ok=created`);
}

async function updateCostTypeAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!id || !name) {
    redirect(`/admin/cost-types?error=${encodeMsg("cost type id and name are required")}`);
  }

  const adminClient = createAdminSupabase();

  // 1) load row org_id from DB (source of truth)
  const { data: row, error: loadErr } = await adminClient
    .from("cost_types")
    .select("id, org_id")
    .eq("id", id)
    .single();

  if (loadErr || !row) {
    redirect(`/admin/cost-types?error=${encodeMsg("cost_type_not_found")}`);
  }

  const orgId = row.org_id; // Use org_id from DB
  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(adminClient, user.id);

  if (!isPlatformAdmin && (!userOrgId || orgId !== userOrgId)) {
    redirect(`/admin/cost-types?error=${encodeMsg("permission_denied")}`);
  }
  const allowed =
    isPlatformAdmin ||
    (await checkPermission(adminClient, user.id, orgId, "cost_types", "update"));

  if (!allowed) {
    redirect(`/admin/cost-types?error=${encodeMsg("permission_denied")}`);
  }

  // 2) scope update by BOTH id and org_id
  const { error: updateErr } = await adminClient
    .from("cost_types")
    .update({ name, active })
    .eq("id", id)
    .eq("org_id", orgId);

  if (updateErr) {
    redirect(`/admin/cost-types?error=${encodeMsg(updateErr.message)}`);
  }

  redirect(`/admin/cost-types?ok=updated`);
}

async function deleteCostTypeAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect(`/admin/cost-types?error=${encodeMsg("cost type id is required")}`);
  }

  const adminClient = createAdminSupabase();
  const { data: row } = await adminClient
    .from("cost_types")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(adminClient, user.id);
  if (!isPlatformAdmin && (!userOrgId || row?.org_id !== userOrgId)) {
    redirect(`/admin/cost-types?error=${encodeMsg("permission_denied")}`);
  }

  const allowed = isPlatformAdmin || await checkPermission(adminClient, user.id, row?.org_id ?? null, "cost_types", "delete");
  if (!allowed) {
    redirect(`/admin/cost-types?error=${encodeMsg("permission_denied")}`);
  }

  const { error } = await adminClient.from("cost_types").delete().eq("id", id);
  if (error) {
    redirect(`/admin/cost-types?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/cost-types?ok=deleted`);
}

export default async function AdminCostTypesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const errorMsg = getParam(sp?.error);
  const okMsg =
    ok === "created" ? "已新增費用類型。" : ok === "updated" ? "已更新費用類型。" : ok === "deleted" ? "已刪除費用類型。" : null;

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;

  const missingKey = !process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    admin = null;
  }

  if (missingKey || !admin) {
    return (
      <div className="admin-page">
        缺少 <code>SUPABASE_SERVICE_ROLE_KEY</code>，請在 <code>.env.local</code> 設定。
      </div>
    );
  }

  const orgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, user.id);

  if (!isPlatformAdmin && !orgId) {
    return (
      <div className="admin-page">
        <h1>費用類型</h1>
        <p className="admin-error">尚未綁定公司，請先建立成員關係。</p>
      </div>
    );
  }

  const orgQuery = admin.from("orgs").select("id, name");
  const { data: orgs, error: orgErr } = isPlatformAdmin ? await orgQuery : await orgQuery.eq("id", orgId);

  const typesQuery = admin
    .from("cost_types")
    .select("id, org_id, name, active, created_at")
    .order("created_at", { ascending: false });
  const { data: costTypes, error } = isPlatformAdmin ? await typesQuery : await typesQuery.eq("org_id", orgId);

  const perms = await getPermissionsForResource(admin, user.id, orgId, "cost_types");
  const canRead = isPlatformAdmin ? true : perms.permissions?.read ?? false;
  const canCreate = isPlatformAdmin ? true : perms.permissions?.create ?? false;
  const canUpdate = isPlatformAdmin ? true : perms.permissions?.update ?? false;
  const canDelete = isPlatformAdmin ? true : perms.permissions?.delete ?? false;

  const orgNameById = Object.fromEntries((orgs ?? []).map((org) => [org.id, org.name]));

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>費用類型</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>費用類型</h1>
      {!isPlatformAdmin && !orgId && <p>尚未綁定公司，請先建立成員關係。</p>}
      {okMsg && <p className="admin-success">{okMsg}</p>}
      {errorMsg && <p className="admin-error">{decodeURIComponent(errorMsg)}</p>}
      {orgErr && <p className="admin-error">{orgErr.message}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!costTypes || costTypes.length === 0) && <p>目前沒有費用類型。</p>}

      {!error && canCreate && (
        <form className="admin-form" action={createCostTypeAction}>
          <select name="org_id" defaultValue={orgId ?? ""}>
            <option value="">選擇公司</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="費用類型名稱" />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="active" defaultChecked />
            啟用
          </label>
          <button type="submit">新增費用類型</button>
        </form>
      )}

      {!error && costTypes && costTypes.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>費用類型</th>
              <th>公司</th>
              <th>啟用</th>
              <th>操作</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {(costTypes as CostTypeRow[]).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{orgNameById[row.org_id] ?? "-"}</td>
                <td>{row.active ? "啟用" : "停用"}</td>
                <td>
                  <div className="admin-row-actions">
                    <form action={updateCostTypeAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="org_id" value={row.org_id} />
                      <input name="name" defaultValue={row.name} />
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" name="active" defaultChecked={row.active} />
                        啟用
                      </label>
                      <button type="submit" disabled={!canUpdate}>更新</button>
                    </form>
                    <ConfirmForm action={deleteCostTypeAction} confirmMessage="確定要刪除此費用類型？" hidden={!canDelete}>
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className="btn btn-ghost" disabled={!canDelete}>刪除</button>
                    </ConfirmForm>
                  </div>
                </td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
