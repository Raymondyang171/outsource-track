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

async function createOrgAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/admin/orgs?error=${encodeMsg("company name is required")}`);
  }
  const adminClient = createAdminSupabase();
  const allowed = await checkPermission(adminClient, user.id, null, "companies", "create");
  if (!allowed) {
    redirect(`/admin/orgs?error=${encodeMsg("permission_denied")}`);
  }
  const { error } = await adminClient.from("orgs").insert({ name });
  if (error) {
    redirect(`/admin/orgs?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/orgs?ok=created`);
}

async function updateOrgAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const orgId = String(formData.get("org_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!orgId || !name) {
    redirect(`/admin/orgs?error=${encodeMsg("company id and name are required")}`);
  }
  const adminClient = createAdminSupabase();
  const allowed = await checkPermission(adminClient, user.id, orgId, "companies", "update");
  if (!allowed) {
    redirect(`/admin/orgs?error=${encodeMsg("permission_denied")}`);
  }
  const { error } = await adminClient.from("orgs").update({ name }).eq("id", orgId);
  if (error) {
    redirect(`/admin/orgs?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/orgs?ok=updated`);
}

async function deleteOrgAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) {
    redirect(`/admin/orgs?error=${encodeMsg("company id is required")}`);
  }
  const adminClient = createAdminSupabase();
  const allowed = await checkPermission(adminClient, user.id, orgId, "companies", "delete");
  if (!allowed) {
    redirect(`/admin/orgs?error=${encodeMsg("permission_denied")}`);
  }
  const { error } = await adminClient.from("orgs").delete().eq("id", orgId);
  if (error) {
    redirect(`/admin/orgs?error=${encodeMsg(error.message)}`);
  }
  redirect(`/admin/orgs?ok=deleted`);
}

export default async function AdminOrgsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const errorMsg = getParam(sp?.error);
  const okMsg =
    ok === "created" ? "已新增公司。" : ok === "updated" ? "已更新公司。" : ok === "deleted" ? "已刪除公司。" : null;

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

  const { data: orgs, error } = await admin.from("orgs").select("id, name, created_at");
  const companyPerms = await getPermissionsForResource(admin, user.id, orgId, "companies");
  const canRead = companyPerms.permissions?.read ?? false;
  const canCreate = companyPerms.permissions?.create ?? false;
  const canUpdate = companyPerms.permissions?.update ?? false;
  const canDelete = companyPerms.permissions?.delete ?? false;

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>公司設定</h1>
        <p className="admin-error">目前角色沒有檢視權限。</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>公司設定</h1>
      {!orgId && <p>尚未綁定公司，暫時顯示全部資料。</p>}
      {okMsg && <p className="admin-success">{okMsg}</p>}
      {errorMsg && <p className="admin-error">{decodeURIComponent(errorMsg)}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!orgs || orgs.length === 0) && <p>目前沒有公司。</p>}
      {!error && canCreate && (
        <form className="admin-form" action={createOrgAction}>
          <input name="name" placeholder="公司名稱" />
          <button type="submit">新增公司</button>
        </form>
      )}
      {!error && orgs && orgs.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>公司</th>
              <th>操作</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>
                  <div className="admin-row-actions">
                    <form action={updateOrgAction}>
                      <input type="hidden" name="org_id" value={org.id} />
                      <input name="name" defaultValue={org.name} />
                      <button type="submit" disabled={!canUpdate}>更新</button>
                    </form>
                    <ConfirmForm action={deleteOrgAction} confirmMessage="確定要刪除此公司？" hidden={!canDelete}>
                      <input type="hidden" name="org_id" value={org.id} />
                      <button type="submit" className="btn btn-ghost" disabled={!canDelete}>刪除</button>
                    </ConfirmForm>
                  </div>
                </td>
                <td>{new Date(org.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
