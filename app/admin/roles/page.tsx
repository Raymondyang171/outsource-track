import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PermissionRow = {
  role: string;
  resource: string;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
};

type PermissionSet = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

const baseRoles = ["viewer", "member", "manager", "admin"];
const permissionLabels = [
  { id: "read", label: "可讀" },
  { id: "create", label: "可新增" },
  { id: "update", label: "可修改" },
  { id: "delete", label: "可刪除" },
] as const;
const resources = [
  { id: "projects", label: "專案" },
  { id: "tasks", label: "任務" },
  { id: "files", label: "檔案" },
  { id: "costs", label: "費用分析" },
  { id: "cost_types", label: "費用類型" },
  { id: "users", label: "使用者" },
  { id: "roles", label: "權限設定" },
  { id: "memberships", label: "成員管理（使用者頁面）" },
  { id: "departments", label: "部門" },
  { id: "companies", label: "公司" },
  { id: "devices", label: "設備授權" },
  { id: "logs", label: "系統記錄" },
] as const;

const defaultRolePermissions: Record<string, Record<string, PermissionSet>> = Object.fromEntries(
  baseRoles.map((role) => [
    role,
    Object.fromEntries(
      resources.map((resource) => {
        if (role === "viewer") {
          return [resource.id, { read: true, create: false, update: false, delete: false }];
        }
        if (role === "member") {
          return [resource.id, { read: true, create: true, update: true, delete: false }];
        }
        return [resource.id, { read: true, create: true, update: true, delete: true }];
      })
    ),
  ])
);

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function encodeMsg(msg: string) {
  return encodeURIComponent(msg);
}

function isMissingTableError(error: any) {
  const message = String(error?.message ?? "");
  return message.includes("Could not find the table");
}

async function updateRolePermissionsAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const role = String(formData.get("role") ?? "").trim();
  if (!role) {
    redirect(`/admin/roles?error=${encodeMsg("invalid role")}`);
  }

  const updates: PermissionRow[] = resources.map((resource) => ({
    role,
    resource: resource.id,
    can_read: formData.get(`${resource.id}__read`) === "on",
    can_create: formData.get(`${resource.id}__create`) === "on",
    can_update: formData.get(`${resource.id}__update`) === "on",
    can_delete: formData.get(`${resource.id}__delete`) === "on",
  }))
    .map((row) =>
      row.can_read
        ? row
        : { ...row, can_create: false, can_update: false, can_delete: false }
    );

  const admin = createAdminSupabase();
  const allowed = await checkPermission(admin, user.id, null, "roles", "update");
  if (!allowed) {
    redirect(`/admin/roles?error=${encodeMsg("permission_denied")}`);
  }
  const { error } = await admin
    .from("role_permissions")
    .upsert(updates, { onConflict: "role,resource" });

  if (error) {
    redirect(`/admin/roles?error=${encodeMsg(error.message)}`);
  }

  redirect(`/admin/roles?ok=updated`);
}

async function createRoleAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const role = String(formData.get("role") ?? "").trim();
  if (!role) {
    redirect(`/admin/roles?error=${encodeMsg("role_name_required")}`);
  }

  const admin = createAdminSupabase();
  const allowed = await checkPermission(admin, user.id, null, "roles", "create");
  if (!allowed) {
    redirect(`/admin/roles?error=${encodeMsg("permission_denied")}`);
  }

  const { data: existing } = await admin
    .from("role_permissions")
    .select("role")
    .eq("role", role)
    .limit(1);

  if ((existing ?? []).length > 0 || baseRoles.includes(role)) {
    redirect(`/admin/roles?error=${encodeMsg("role_already_exists")}`);
  }

  const rows: PermissionRow[] = resources.map((resource) => ({
    role,
    resource: resource.id,
    can_read: true,
    can_create: false,
    can_update: false,
    can_delete: false,
  }));

  const { error } = await admin
    .from("role_permissions")
    .insert(rows);

  if (error) {
    redirect(`/admin/roles?error=${encodeMsg(error.message)}`);
  }

  redirect(`/admin/roles?ok=created`);
}

export default async function AdminRolesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const error = getParam(sp?.error);
  const okMsg =
    ok === "updated" ? "已更新權限。" : ok === "created" ? "已新增權限。" : null;

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
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
        缺少 <code>SUPABASE_SERVICE_ROLE_KEY</code>，請在 <code>.env.local</code> 設定。
      </div>
    );
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const rolePerms = await getPermissionsForResource(admin, user.id, null, "roles");
  const canRead = isPlatformAdmin ? true : rolePerms.permissions?.read ?? false;
  const canCreate = isPlatformAdmin ? true : rolePerms.permissions?.create ?? false;
  const canUpdate = isPlatformAdmin ? true : rolePerms.permissions?.update ?? false;

  let permissionRows: PermissionRow[] = [];
  let tableMissing = false;
  let loadError: string | null = null;

  const { data: rows, error: listErr } = await admin
    .from("role_permissions")
    .select("role, resource, can_read, can_create, can_update, can_delete");

  if (listErr) {
    if (isMissingTableError(listErr)) {
      tableMissing = true;
    } else {
      loadError = listErr.message;
    }
  } else {
    permissionRows = rows ?? [];
  }

  const permissionMap: Record<string, Record<string, PermissionSet>> = JSON.parse(
    JSON.stringify(defaultRolePermissions)
  );

  permissionRows.forEach((row) => {
    if (!permissionMap[row.role]) return;
    if (!permissionMap[row.role][row.resource]) return;
    permissionMap[row.role][row.resource] = {
      read: row.can_read,
      create: row.can_create,
      update: row.can_update,
      delete: row.can_delete,
    };
  });

  const roleSet = new Set<string>(baseRoles);
  permissionRows.forEach((row) => roleSet.add(row.role));
  const roles = [...roleSet].sort((a, b) => {
    const ai = baseRoles.indexOf(a);
    const bi = baseRoles.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  roles.forEach((role) => {
    if (!permissionMap[role]) {
      permissionMap[role] = Object.fromEntries(
        resources.map((resource) => [
          resource.id,
          { read: false, create: false, update: false, delete: false },
        ])
      );
    }
    resources.forEach((resource) => {
      const perms = permissionMap[role][resource.id];
      if (!perms.read) {
        permissionMap[role][resource.id] = {
          read: false,
          create: false,
          update: false,
          delete: false,
        };
      }
    });
  });

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>權限設定</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>權限設定</h1>
      {okMsg && <p className="admin-success">{okMsg}</p>}
      {error && <p className="admin-error">{decodeURIComponent(error)}</p>}
      {loadError && <p className="admin-error">{loadError}</p>}
      {tableMissing && (
        <p className="admin-error">
          缺少 <code>role_permissions</code> 資料表，請先建立後再設定權限。
        </p>
      )}

      <form className="admin-form" action={createRoleAction}>
        <input name="role" placeholder="新權限名稱（例如: contractor）" />
        <button type="submit" className="btn btn-primary" disabled={tableMissing || !canCreate}>
          新增權限
        </button>
      </form>

      {roles.map((role) => (
        <form key={role} className="admin-section" action={updateRolePermissionsAction}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{role}</h2>
            <input type="hidden" name="role" value={role} />
            <button type="submit" className="btn btn-primary" disabled={tableMissing || !canUpdate}>更新</button>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>模組</th>
                {permissionLabels.map((perm) => (
                  <th key={perm.id}>{perm.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => {
                const perms = permissionMap[role][resource.id];
                return (
                  <tr key={`${role}-${resource.id}`}>
                    <td>{resource.label}</td>
                    {permissionLabels.map((perm) => (
                      <td key={perm.id}>
                        <input
                          type="checkbox"
                          name={`${resource.id}__${perm.id}`}
                          defaultChecked={perms[perm.id]}
                          disabled={tableMissing || !canUpdate}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </form>
      ))}
    </div>
  );
}
