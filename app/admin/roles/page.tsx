import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";

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

const roles = ["viewer", "member", "manager", "admin"];
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
  { id: "users", label: "使用者" },
  { id: "companies", label: "公司" },
  { id: "departments", label: "部門" },
  { id: "memberships", label: "成員" },
] as const;

const defaultRolePermissions: Record<string, Record<string, PermissionSet>> = Object.fromEntries(
  roles.map((role) => [
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
  if (!roles.includes(role)) {
    redirect(`/admin/roles?error=${encodeMsg("invalid role")}`);
  }

  const updates: PermissionRow[] = resources.map((resource) => ({
    role,
    resource: resource.id,
    can_read: formData.get(`${resource.id}__read`) === "on",
    can_create: formData.get(`${resource.id}__create`) === "on",
    can_update: formData.get(`${resource.id}__update`) === "on",
    can_delete: formData.get(`${resource.id}__delete`) === "on",
  }));

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

export default async function AdminRolesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const error = getParam(sp?.error);
  const okMsg = ok === "updated" ? "已更新角色權限。" : null;

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

  const rolePerms = await getPermissionsForResource(admin, user.id, null, "roles");
  const canRead = rolePerms.permissions?.read ?? false;
  const canUpdate = rolePerms.permissions?.update ?? false;

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

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>權限設定</h1>
        <p className="admin-error">目前角色沒有檢視權限。</p>
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
