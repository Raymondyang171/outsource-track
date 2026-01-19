import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";
import ConfirmForm from "@/components/confirm-form";
import ProjectForm from "@/components/admin/project-form";

export const dynamic = "force-dynamic";

async function deleteProjectAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!projectId) {
    redirect(`/admin/projects?error=${encodeURIComponent("missing_project_id")}`);
  }

  const adminClient = createAdminSupabase();
  const { data: project, error: projErr } = await adminClient
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projErr || !project) {
    redirect(`/admin/projects?error=${encodeURIComponent(projErr?.message ?? "project_not_found")}`);
  }

  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(adminClient, user.id);
  if (!isPlatformAdmin && (!userOrgId || project.org_id !== userOrgId)) {
    redirect(`/admin/projects?error=${encodeURIComponent("permission_denied")}`);
  }

  const allowed = isPlatformAdmin || await checkPermission(adminClient, user.id, project.org_id, "projects", "delete");
  if (!allowed) {
    redirect(`/admin/projects?error=${encodeURIComponent("permission_denied")}`);
  }

  const { error: delErr } = await adminClient.from("projects").delete().eq("id", projectId);
  if (delErr) {
    redirect(`/admin/projects?error=${encodeURIComponent(delErr.message)}`);
  }

  redirect(`/admin/projects?ok=deleted`);
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const PROJECT_SORT_FIELDS = new Set([
  "name",
  "org_id",
  "unit_id",
  "start_date",
  "status",
  "created_at",
]);

function buildQueryString(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) sp.set(key, value);
  });
  const query = sp.toString();
  return query ? `?${query}` : "";
}

function formatDateSlash(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnly = value.includes("T") ? value.split("T")[0] : value;
  return dateOnly.replaceAll("-", "/");
}

export default async function AdminProjectsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const errorMsg = getParam(sp?.error);
  const sortByRaw = getParam(sp?.sort_by);
  const sortDirRaw = getParam(sp?.sort_dir);
  const sortBy = sortByRaw && PROJECT_SORT_FIELDS.has(sortByRaw) ? sortByRaw : null;
  const sortDir = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : null;
  const okMsg =
    ok === "created" ? "已新增專案。" : ok === "deleted" ? "已刪除專案。" : null;

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
        <h1>專案管理</h1>
        <p className="admin-error">尚未綁定公司，請先建立成員關係。</p>
      </div>
    );
  }

  const { data: orgs, error: orgErr } = isPlatformAdmin
    ? await admin.from("orgs").select("id, name")
    : await admin.from("orgs").select("id, name").eq("id", orgId);

  const { data: units, error: unitErr } = isPlatformAdmin
    ? await admin.from("units").select("id, name, org_id").order("name", { ascending: true })
    : await admin.from("units").select("id, name, org_id").eq("org_id", orgId).order("name", { ascending: true });

  let projectsQuery = isPlatformAdmin
    ? admin.from("projects").select("id, name, org_id, unit_id, start_date, status, created_at")
    : admin.from("projects").select("id, name, org_id, unit_id, start_date, status, created_at").eq("org_id", orgId);

  if (sortBy && sortDir) {
    projectsQuery = projectsQuery.order(sortBy, { ascending: sortDir === "asc" });
  }

  const { data: projects, error } = await projectsQuery.order("created_at", { ascending: false });

  const projectPerms = await getPermissionsForResource(admin, user.id, orgId, "projects");
  const canRead = isPlatformAdmin ? true : projectPerms.permissions?.read ?? false;
  const canCreate = isPlatformAdmin ? true : projectPerms.permissions?.create ?? false;
  const canDelete = isPlatformAdmin ? true : projectPerms.permissions?.delete ?? false;

  const orgNameById = Object.fromEntries((orgs ?? []).map((org) => [org.id, org.name]));
  const unitNameById = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit.name]));

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>專案管理</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>專案管理</h1>
      {!isPlatformAdmin && !orgId && <p>尚未綁定公司，請先建立成員關係。</p>}
      {okMsg && <p className="admin-success">{okMsg}</p>}
      {errorMsg && <p className="admin-error">{decodeURIComponent(errorMsg)}</p>}
      {orgErr && <p className="admin-error">{orgErr.message}</p>}
      {unitErr && <p className="admin-error">{unitErr.message}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!projects || projects.length === 0) && <p>目前沒有專案。</p>}

      {!error && canCreate && (
        <ProjectForm orgs={orgs ?? []} units={units ?? []} defaultOrgId={orgId} />
      )}

      {!error && projects && projects.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <div className="flex items-center gap-2">
                  <span>專案</span>
                  <a
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    href={buildQueryString({
                      sort_by: "name",
                      sort_dir: sortBy === "name" && sortDir === "asc" ? "desc" : "asc",
                    })}
                  >
                    {sortBy === "name" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                  </a>
                </div>
              </th>
              <th>
                <div className="flex items-center gap-2">
                  <span>公司</span>
                  <a
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    href={buildQueryString({
                      sort_by: "org_id",
                      sort_dir: sortBy === "org_id" && sortDir === "asc" ? "desc" : "asc",
                    })}
                  >
                    {sortBy === "org_id" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                  </a>
                </div>
              </th>
              <th>
                <div className="flex items-center gap-2">
                  <span>部門</span>
                  <a
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    href={buildQueryString({
                      sort_by: "unit_id",
                      sort_dir: sortBy === "unit_id" && sortDir === "asc" ? "desc" : "asc",
                    })}
                  >
                    {sortBy === "unit_id" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                  </a>
                </div>
              </th>
              <th>操作</th>
              <th>
                <div className="flex items-center gap-2">
                  <span>開始日</span>
                  <a
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    href={buildQueryString({
                      sort_by: "start_date",
                      sort_dir: sortBy === "start_date" && sortDir === "asc" ? "desc" : "asc",
                    })}
                  >
                    {sortBy === "start_date" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                  </a>
                </div>
              </th>
              <th>
                <div className="flex items-center gap-2">
                  <span>狀態</span>
                  <a
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    href={buildQueryString({
                      sort_by: "status",
                      sort_dir: sortBy === "status" && sortDir === "asc" ? "desc" : "asc",
                    })}
                  >
                    {sortBy === "status" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                  </a>
                </div>
              </th>
              <th>
                <div className="flex items-center gap-2">
                  <span>建立時間</span>
                  <a
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    href={buildQueryString({
                      sort_by: "created_at",
                      sort_dir: sortBy === "created_at" && sortDir === "asc" ? "desc" : "asc",
                    })}
                  >
                    {sortBy === "created_at" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                  </a>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{orgNameById[p.org_id] ?? "-"}</td>
                <td>{unitNameById[p.unit_id] ?? "-"}</td>
                <td className="space-x-2">
                  <a className="btn btn-ghost" href={`/admin/tasks?project_id=${p.id}`}>
                    編輯任務
                  </a>
                  {canDelete && (
                    <ConfirmForm
                      action={deleteProjectAction}
                      confirmMessage="確定要刪除此專案嗎？相關任務與資料可能會一併移除。"
                      className="inline"
                    >
                      <input type="hidden" name="project_id" value={p.id} />
                      <button type="submit" className="btn btn-ghost text-red-600">
                        刪除
                      </button>
                    </ConfirmForm>
                  )}
                </td>
                <td>{formatDateSlash(p.start_date)}</td>
                <td>{p.status}</td>
                <td>{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

