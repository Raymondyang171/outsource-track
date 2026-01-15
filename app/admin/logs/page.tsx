import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPermissionsForResource } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ActivityLog = {
  id: string;
  created_at: string;
  event_type: string;
  action: string | null;
  resource: string | null;
  record_id: string | null;
  org_id: string | null;
  unit_id: string | null;
  user_id: string | null;
  user_email: string | null;
  source: string | null;
  message: string | null;
};

const eventTypes = ["action", "error", "warn", "info"] as const;

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toStartOfDay(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(start.getTime()) ? null : start.toISOString();
}

function toEndOfDay(dateStr: string) {
  const end = new Date(`${dateStr}T23:59:59.999`);
  return Number.isNaN(end.getTime()) ? null : end.toISOString();
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

export default async function AdminLogsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const startDate = getParam(sp?.start_date) ?? "";
  const endDate = getParam(sp?.end_date) ?? "";
  const selectedUser = getParam(sp?.user_id) ?? "";
  const selectedEvent = getParam(sp?.event_type) ?? "";
  const selectedAction = getParam(sp?.action) ?? "";
  const selectedOrg = getParam(sp?.org_id) ?? "";

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    return (
      <div className="admin-page">
        缺少 <code>SUPABASE_SERVICE_ROLE_KEY</code>，請在 <code>.env.local</code> 設定。
      </div>
    );
  }

  const orgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, user.id);
  const perms = await getPermissionsForResource(admin, user.id, orgId, "logs");
  const canRead = isPlatformAdmin ? true : perms.permissions?.read ?? false;
  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>系統記錄</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }
  if (!isPlatformAdmin && !orgId) {
    return (
      <div className="admin-page">
        <h1>系統記錄</h1>
        <p className="admin-error">找不到對應的公司資料。</p>
      </div>
    );
  }
  const orgFilter = isPlatformAdmin ? selectedOrg || null : orgId;

  let logs: ActivityLog[] = [];
  let loadError: string | null = null;
  let orgOptions: Array<{ id: string; name: string }> = [];

  if (isPlatformAdmin) {
    const { data: orgList } = await admin.from("orgs").select("id, name").order("name");
    orgOptions = orgList ?? [];
  }

  let query = admin
    .from("activity_logs")
    .select("id, created_at, event_type, action, resource, record_id, org_id, unit_id, user_id, user_email, source, message")
    .order("created_at", { ascending: false })
    .limit(500);

  if (orgFilter) {
    query = query.eq("org_id", orgFilter);
  }
  if (selectedUser) {
    query = query.eq("user_id", selectedUser);
  }
  if (selectedEvent) {
    query = query.eq("event_type", selectedEvent);
  }
  if (selectedAction) {
    query = query.eq("action", selectedAction);
  }
  if (startDate) {
    const startIso = toStartOfDay(startDate);
    if (startIso) {
      query = query.gte("created_at", startIso);
    }
  }
  if (endDate) {
    const endIso = toEndOfDay(endDate);
    if (endIso) {
      query = query.lte("created_at", endIso);
    }
  }

  const { data: rows, error: listErr } = await query;
  if (listErr) {
    loadError = listErr.message;
  } else {
    logs = rows ?? [];
  }

  const userOptions = new Map<string, string>();
  const actionOptions = new Set<string>();
  logs.forEach((log) => {
    if (log.user_id) {
      const label = log.user_email || log.user_id;
      if (!userOptions.has(log.user_id)) {
        userOptions.set(log.user_id, label);
      }
    }
    if (log.action) {
      actionOptions.add(log.action);
    }
  });

  return (
    <div className="admin-page">
      <h1>系統記錄</h1>
      {loadError && <p className="admin-error">{loadError}</p>}

      <form className="admin-form" method="get">
        {isPlatformAdmin && (
          <select name="org_id" defaultValue={selectedOrg}>
            <option value="">全部公司</option>
            {orgOptions.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
        <input type="date" name="start_date" defaultValue={startDate} />
        <input type="date" name="end_date" defaultValue={endDate} />
        <select name="user_id" defaultValue={selectedUser}>
          <option value="">全部使用者</option>
          {[...userOptions.entries()].map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select name="event_type" defaultValue={selectedEvent}>
          <option value="">全部類型</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={selectedAction}>
          <option value="">全部動作</option>
          {[...actionOptions.values()].map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">
          查詢
        </button>
      </form>

      <table className="admin-table">
        <thead>
          <tr>
            <th>時間</th>
            <th>類型</th>
            <th>動作</th>
            <th>資源</th>
            <th>記錄 ID</th>
            <th>使用者</th>
            <th>訊息</th>
            <th>來源</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 && (
            <tr>
              <td colSpan={8}>沒有符合條件的記錄。</td>
            </tr>
          )}
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{formatDate(log.created_at)}</td>
              <td>{log.event_type}</td>
              <td>{log.action ?? "-"}</td>
              <td>{log.resource ?? "-"}</td>
              <td>{log.record_id ?? "-"}</td>
              <td>{log.user_email || log.user_id || "-"}</td>
              <td>{log.message ?? "-"}</td>
              <td>{log.source ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
