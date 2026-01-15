import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

type DeviceRow = {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string | null;
  org_id: string | null;
  unit_id: string | null;
  device_id: string;
  device_name: string | null;
  last_seen_at: string | null;
  approved: boolean;
  approved_at: string | null;
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function approveDeviceAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const deviceId = String(formData.get("device_id") ?? "").trim();
  if (!deviceId) {
    redirect("/admin/devices?error=missing_device_id");
  }

  const admin = createAdminSupabase();
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const orgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, user.id);
  const allowed = isPlatformAdmin || await checkPermission(admin, user.id, orgId, "devices", "update");
  if (!allowed) {
    redirect("/admin/devices?error=permission_denied");
  }
  const { error } = await admin
    .from("device_allowlist")
    .update({
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq("id", deviceId);

  if (error) {
    redirect(`/admin/devices?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/devices?ok=approved");
}

async function revokeDeviceAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const deviceId = String(formData.get("device_id") ?? "").trim();
  if (!deviceId) {
    redirect("/admin/devices?error=missing_device_id");
  }

  const admin = createAdminSupabase();
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const orgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, user.id);
  const allowed = isPlatformAdmin || await checkPermission(admin, user.id, orgId, "devices", "update");
  if (!allowed) {
    redirect("/admin/devices?error=permission_denied");
  }
  const { error } = await admin
    .from("device_allowlist")
    .update({
      approved: false,
      approved_at: null,
      approved_by: null,
    })
    .eq("id", deviceId);

  if (error) {
    redirect(`/admin/devices?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/devices?ok=revoked");
}

export default async function AdminDevicesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = getParam(sp?.status) ?? "";
  const ok = getParam(sp?.ok);
  const error = getParam(sp?.error);

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminSupabase();
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const orgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, user.id);
  const perms = await getPermissionsForResource(admin, user.id, orgId, "devices");
  const canRead = isPlatformAdmin ? true : perms.permissions?.read ?? false;
  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>設備授權</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }

  let query = admin
    .from("device_allowlist")
    .select("id, created_at, user_id, user_email, org_id, unit_id, device_id, device_name, last_seen_at, approved, approved_at")
    .order("created_at", { ascending: false });

  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  if (status === "approved") {
    query = query.eq("approved", true);
  }
  if (status === "pending") {
    query = query.eq("approved", false);
  }

  const { data: rows, error: listErr } = await query;
  const devices = (rows ?? []) as DeviceRow[];

  const { data: orgRows } = await admin.from("orgs").select("id, name");
  const { data: unitRows } = await admin.from("units").select("id, name, org_id");
  const orgMap = new Map((orgRows ?? []).map((row) => [row.id, row.name]));
  const unitMap = new Map((unitRows ?? []).map((row) => [row.id, row.name]));
  const userIds = Array.from(new Set(devices.map((device) => device.user_id).filter(Boolean)));
  const userNameById: Record<string, string> = {};
  const roleByUserOrgKey: Record<string, string> = {};
  const roleSeenAt: Record<string, string> = {};

  if (userIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);
    (profileRows ?? []).forEach((row) => {
      if (row.user_id) {
        userNameById[row.user_id] = String(row.display_name ?? "").trim();
      }
    });

    let membershipQuery = admin
      .from("memberships")
      .select("user_id, org_id, role, created_at")
      .in("user_id", userIds);
    if (orgId) {
      membershipQuery = membershipQuery.eq("org_id", orgId);
    }
    const { data: membershipRows } = await membershipQuery.order("created_at", { ascending: false });
    (membershipRows ?? []).forEach((row) => {
      if (!row.user_id) return;
      const key = `${row.user_id}:${row.org_id ?? ""}`;
      const existingAt = roleSeenAt[key];
      if (!existingAt || String(row.created_at ?? "") > existingAt) {
        roleSeenAt[key] = String(row.created_at ?? "");
        roleByUserOrgKey[key] = String(row.role ?? "").trim();
      }
    });
  }

  return (
    <div className="admin-page">
      <h1>設備授權</h1>
      {ok === "approved" && <p className="admin-success">已核准設備。</p>}
      {ok === "revoked" && <p className="admin-success">已取消設備授權。</p>}
      {error && <p className="admin-error">{decodeURIComponent(error)}</p>}
      {listErr && <p className="admin-error">{listErr.message}</p>}

      <form className="admin-form" method="get">
        <select name="status" defaultValue={status}>
          <option value="">全部狀態</option>
          <option value="approved">已核准</option>
          <option value="pending">待核准</option>
        </select>
        <button className="btn btn-primary" type="submit">
          查詢
        </button>
      </form>

      <table className="admin-table">
        <thead>
          <tr>
            <th>使用者</th>
            <th>公司 / 部門</th>
            <th>裝置</th>
            <th>最近使用</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 && (
            <tr>
              <td colSpan={6}>沒有符合條件的裝置。</td>
            </tr>
          )}
          {devices.map((device) => (
            <tr key={device.id}>
              <td>
                <div>{userNameById[device.user_id] || device.user_email || device.user_id}</div>
                <div className="page-subtitle">
                  {device.user_email || device.user_id}
                  {roleByUserOrgKey[`${device.user_id}:${device.org_id ?? ""}`]
                    ? ` ・權限：${roleByUserOrgKey[`${device.user_id}:${device.org_id ?? ""}`]}`
                    : ""}
                </div>
              </td>
              <td>
                {(device.org_id && orgMap.get(device.org_id)) || "-"}
                {" / "}
                {(device.unit_id && unitMap.get(device.unit_id)) || "-"}
              </td>
              <td>
                <div>{device.device_name || device.device_id}</div>
                <div className="page-subtitle">{device.device_id}</div>
              </td>
              <td>{formatDate(device.last_seen_at)}</td>
              <td>{device.approved ? "已核准" : "待核准"}</td>
              <td>
                {device.approved ? (
                  <form action={revokeDeviceAction}>
                    <input type="hidden" name="device_id" value={device.id} />
                    <button className="btn btn-ghost" type="submit">
                      取消授權
                    </button>
                  </form>
                ) : (
                  <form action={approveDeviceAction}>
                    <input type="hidden" name="device_id" value={device.id} />
                    <button className="btn btn-primary" type="submit">
                      核准
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
