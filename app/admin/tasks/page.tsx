import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ListTodo } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";
import ConfirmForm from "@/components/confirm-form";
import SearchForm from "./search-form";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

function emailToDisplayName(email: string | null | undefined) {
  if (!email) return "user";
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
}

function isMissingTableError(error: any) {
  const message = String(error?.message ?? "");
  return message.includes("Could not find the table");
}

type DriveItem = {
  id: string;
  project_task_id: string | null;
  name: string;
  web_view_link: string;
  thumbnail_link: string | null;
  mime_type: string | null;
};

function getThumbnailSrc(file: DriveItem) {
  if (!file.thumbnail_link) return null;
  return `/api/drive/thumbnail?item_id=${encodeURIComponent(file.id)}`;
}

async function updateTaskAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const authedUser = data.user;
  if (!authedUser) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const taskId = String(formData.get("task_id") ?? "").trim();
  if (!taskId) return;

  const phaseName = String(formData.get("phase_name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const seqRaw = String(formData.get("seq") ?? "").trim();
  const progressRaw = String(formData.get("progress") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim();
  const ownerUnitId = String(formData.get("owner_unit_id") ?? "").trim();
  const startOffsetRaw = String(formData.get("start_offset_days") ?? "").trim();
  const durationRaw = String(formData.get("duration_days") ?? "").trim();
  const completedAtRaw = String(formData.get("completed_at") ?? "").trim();
  const actionRaw = String(formData.get("action") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const seq = seqRaw.length > 0 ? Number(seqRaw) : null;
  const progress = progressRaw.length > 0 ? Number(progressRaw) : null;
  const startOffsetDays = startOffsetRaw.length > 0 ? Number(startOffsetRaw) : null;
  const durationDays = durationRaw.length > 0 ? Number(durationRaw) : null;

  const updates: Record<string, any> = {};
  if (phaseName) updates.phase_name = phaseName;
  if (name) updates.name = name;
  if (!Number.isNaN(seq) && seq !== null) updates.seq = seq;
  if (!Number.isNaN(progress) && progress !== null) updates.progress = progress;
  if (!Number.isNaN(startOffsetDays) && startOffsetDays !== null) updates.start_offset_days = startOffsetDays;
  if (!Number.isNaN(durationDays) && durationDays !== null) updates.duration_days = durationDays;
  if (unitId) updates.unit_id = unitId;
  updates.code = code || null;
  updates.owner_unit_id = ownerUnitId || null;

  if (Object.keys(updates).length === 0) return;

  const admin = createAdminSupabase();
  const { data: taskRow } = await admin
    .from("project_tasks")
    .select("org_id, unit_id")
    .eq("id", taskId)
    .maybeSingle();

  const allowed = isPlatformAdmin || await checkPermission(admin, authedUser.id, taskRow?.org_id ?? null, "tasks", "update");
  if (!allowed) {
    redirect(`/admin/tasks?error=${encodeURIComponent("permission_denied")}`);
  }

  await admin.from("project_tasks").update(updates).eq("id", taskId);

  const { error: logErr } = await admin.from("task_change_logs").insert({
    task_id: taskId,
    org_id: taskRow?.org_id ?? null,
    unit_id: taskRow?.unit_id ?? null,
    user_id: authedUser.id ?? null,
    action: actionRaw || "update",
    completed_at: completedAtRaw || null,
    note: note || null,
  });

  if (logErr && !isMissingTableError(logErr)) {
    console.warn("task_change_logs insert failed", logErr.message ?? logErr);
  }
  revalidatePath("/admin/tasks");
}

async function deleteTaskAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const authedUser = data.user;
  if (!authedUser) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const taskId = String(formData.get("task_id") ?? "").trim();
  const redirectProjectId = String(formData.get("project_id") ?? "").trim();
  if (!taskId) return;

  const admin = createAdminSupabase();
  const { data: taskRow } = await admin
    .from("project_tasks")
    .select("org_id")
    .eq("id", taskId)
    .maybeSingle();

  const allowed = isPlatformAdmin || await checkPermission(admin, authedUser.id, taskRow?.org_id ?? null, "tasks", "delete");
  if (!allowed) {
    redirect(`/admin/tasks?error=${encodeURIComponent("permission_denied")}`);
  }

  await admin.from("project_tasks").delete().eq("id", taskId);
  if (redirectProjectId) {
    redirect(`/admin/tasks?project_id=${encodeURIComponent(redirectProjectId)}`);
  }
  redirect("/admin/tasks");
}

async function createTaskAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const formOrgId = String(formData.get("org_id") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const phaseName = String(formData.get("phase_name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const startOffsetRaw = String(formData.get("start_offset_days") ?? "").trim();
  const durationRaw = String(formData.get("duration_days") ?? "").trim();
  const ownerUnitId = String(formData.get("owner_unit_id") ?? "").trim();

  const startOffsetDays = startOffsetRaw ? Number(startOffsetRaw) : 0;
  const durationDays = durationRaw ? Number(durationRaw) : 1;

  if (!projectId || !phaseName || !name) {
    redirect(`/admin/tasks?error=${encodeURIComponent("missing_required_fields")}`);
  }
  const adminClient = createAdminSupabase();
  const { data: projectRow, error: projectErr } = await adminClient
    .from("projects")
    .select("org_id, unit_id")
    .eq("id", projectId)
    .maybeSingle();
  const resolvedOrgId = formOrgId || projectRow?.org_id || "";
  const resolvedUnitId = unitId || projectRow?.unit_id || "";
  if (projectErr || !resolvedOrgId || !resolvedUnitId) {
    redirect(`/admin/tasks?error=${encodeURIComponent(projectErr?.message || "project_lookup_failed")}`);
  }

  const allowed = isPlatformAdmin || await checkPermission(adminClient, user.id, resolvedOrgId, "tasks", "create");
  if (!allowed) {
    redirect(`/admin/tasks?error=${encodeURIComponent("permission_denied")}`);
  }

  const { data: seqRow } = await adminClient
    .from("project_tasks")
    .select("seq")
    .eq("project_id", projectId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = (seqRow?.seq ?? 0) + 1;

  const { error: insertErr } = await adminClient.from("project_tasks").insert({
    org_id: resolvedOrgId,
    unit_id: resolvedUnitId,
    project_id: projectId,
    phase_name: phaseName,
    code: code || null,
    name,
    seq: nextSeq,
    start_offset_days: Number.isNaN(startOffsetDays) ? 0 : startOffsetDays,
    duration_days: Number.isNaN(durationDays) ? 1 : durationDays,
    owner_unit_id: ownerUnitId || null,
    progress: 0,
  });
  if (insertErr) {
    redirect(`/admin/tasks?error=${encodeURIComponent(insertErr.message)}`);
  }
  redirect(`/admin/tasks?project_id=${encodeURIComponent(projectId)}`);
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const TASK_SORT_FIELDS = new Set([
  "name",
  "phase_name",
  "owner_unit_id",
  "progress",
  "updated_at",
]);

function buildQueryString(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) sp.set(key, value);
  });
  const query = sp.toString();
  return query ? `?${query}` : "";
}

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    project_id?: string | string[];
    q?: string | string[];
    sort_by?: string | string[];
    sort_dir?: string | string[];
    error?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const projectIdFilter = getParam(sp?.project_id);
  const searchTerm = getParam(sp?.q);
  const sortByRaw = getParam(sp?.sort_by);
  const sortDirRaw = getParam(sp?.sort_dir);
  const errorMsg = getParam(sp?.error);
  const sortBy = sortByRaw && TASK_SORT_FIELDS.has(sortByRaw) ? sortByRaw : null;
  const sortDir = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : null;

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
        <h1>任務管理</h1>
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

  const { data: projects, error: projErr } = isPlatformAdmin
    ? await admin.from("projects").select("id, name, org_id, unit_id").order("created_at", { ascending: false })
    : await admin.from("projects").select("id, name, org_id, unit_id").eq("org_id", orgId).order("created_at", { ascending: false });

  let userOptions: Array<{ id: string; displayName: string }> = [];
  if (isPlatformAdmin) {
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const users = userList?.users ?? [];
    const userIds = users.map((u) => u.id);
    const { data: profileList } = userIds.length
      ? await admin.from("profiles").select("user_id, display_name").in("user_id", userIds)
      : { data: [] as Array<{ user_id: string; display_name: string | null }> };
    const displayById = new Map((profileList ?? []).map((p) => [p.user_id, p.display_name]));
    userOptions = users.map((u) => ({
      id: u.id,
      displayName: (displayById.get(u.id) ?? "").trim() || emailToDisplayName(u.email),
    }));
  } else if (orgId) {
    const { data: memberRows } = await admin
      .from("memberships")
      .select("user_id")
      .eq("org_id", orgId);
    const memberIds = Array.from(new Set((memberRows ?? []).map((m) => m.user_id)));
    const { data: profileList } = memberIds.length
      ? await admin.from("profiles").select("user_id, display_name").in("user_id", memberIds)
      : { data: [] as Array<{ user_id: string; display_name: string | null }> };
    const displayById = new Map((profileList ?? []).map((p) => [p.user_id, p.display_name]));
    userOptions = memberIds.map((id) => ({
      id,
      displayName: (displayById.get(id) ?? "").trim() || "未知使用者",
    }));
  }

  let taskQuery = admin
    .from("project_tasks")
    .select(
      "id, project_id, seq, phase_name, code, name, progress, updated_at, org_id, unit_id, start_offset_days, duration_days, owner_unit_id"
    );

  if (orgId) {
    taskQuery = taskQuery.eq("org_id", orgId);
  }
  if (projectIdFilter) {
    taskQuery = taskQuery.eq("project_id", projectIdFilter);
  }
  if (searchTerm) {
    taskQuery = taskQuery.ilike("name", `%${searchTerm}%`);
  }

  if (sortBy && sortDir) {
    taskQuery = taskQuery.order(sortBy, { ascending: sortDir === "asc" });
  }

  const { data: tasks, error } = await taskQuery
    .order("updated_at", { ascending: false })
    .limit(200);

  const taskIds = (tasks ?? []).map((task) => task.id);
  let driveItems: DriveItem[] = [];
  let driveErr: { message?: string } | null = null;
  let allowedUnitIds: string[] | null = null;

  if (!isPlatformAdmin && orgId) {
    const { data: membershipRows } = await admin
      .from("memberships")
      .select("unit_id, role")
      .eq("org_id", orgId)
      .eq("user_id", user.id);
    const rows = membershipRows ?? [];
    const isOrgAdmin = rows.some((row) => row.role === "admin");
    if (!isOrgAdmin) {
      allowedUnitIds = rows.map((row) => row.unit_id).filter((unitId) => !!unitId);
    }
  }

  if (taskIds.length > 0) {
    let driveQuery = admin
      .from("drive_items")
      .select("id, project_task_id, name, web_view_link, thumbnail_link, mime_type")
      .in("project_task_id", taskIds)
      .order("modified_time", { ascending: false });
    if (!isPlatformAdmin && orgId) {
      driveQuery = driveQuery.eq("org_id", orgId);
    }
    let executeQuery = true;
    if (allowedUnitIds) {
      if (allowedUnitIds.length === 0) {
        driveItems = [];
        driveErr = { message: "permission_denied" };
        executeQuery = false;
      } else {
        driveQuery = driveQuery.in("unit_id", allowedUnitIds);
      }
    }
    if (executeQuery) {
      const { data: driveList, error: driveError } = await driveQuery;
      driveItems = driveList ?? [];
      if (driveError) {
        driveErr = driveError;
      }
    }
  }

  const filesByTask = (driveItems ?? []).reduce<Record<string, DriveItem[]>>((acc, item) => {
    if (!item.project_task_id) return acc;
    if (!acc[item.project_task_id]) acc[item.project_task_id] = [];
    acc[item.project_task_id].push(item);
    return acc;
  }, {});

  let taskLogs: Array<{
    id: string;
    task_id: string;
    user_id: string | null;
    action: string | null;
    completed_at: string | null;
    note: string | null;
    created_at: string;
    org_id: string | null;
    unit_id: string | null;
  }> = [];
  let logErr: { message?: string } | null = null;

  const logBase = orgId
    ? admin
        .from("task_change_logs")
        .select("id, task_id, user_id, action, completed_at, note, created_at, org_id, unit_id")
        .eq("org_id", orgId)
    : admin
        .from("task_change_logs")
        .select("id, task_id, user_id, action, completed_at, note, created_at, org_id, unit_id");

  const logRes = projectIdFilter && taskIds.length > 0
    ? await logBase.in("task_id", taskIds).order("created_at", { ascending: false }).limit(200)
    : await logBase.order("created_at", { ascending: false }).limit(200);

  if (logRes.error) {
    if (!isMissingTableError(logRes.error)) {
      logErr = logRes.error;
    }
  } else {
    taskLogs = logRes.data ?? [];
  }

  const orgNameById = Object.fromEntries((orgs ?? []).map((org) => [org.id, org.name]));
  const unitNameById = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit.name]));
  const taskNameById = Object.fromEntries((tasks ?? []).map((task) => [task.id, task.name]));
  const selectedProject = (projects ?? []).find((project) => project.id === projectIdFilter);
  const taskPerms = await getPermissionsForResource(admin, user.id, orgId, "tasks");
  const canRead = isPlatformAdmin ? true : taskPerms.permissions?.read ?? false;
  const canCreate = isPlatformAdmin ? true : taskPerms.permissions?.create ?? false;
  const canUpdate = isPlatformAdmin ? true : taskPerms.permissions?.update ?? false;
  const canDelete = isPlatformAdmin ? true : taskPerms.permissions?.delete ?? false;

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>任務管理</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 space-y-6">
      {/* 標題與統計區 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-blue-600" />
            任務管理
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            管理所有專案的任務進度與詳細資訊
            {!isPlatformAdmin && !orgId && <span className="text-amber-600 ml-2">(尚未綁定組織)</span>}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center">
            <span className="text-xs text-slate-500 uppercase font-bold">總任務數</span>
            <span className="text-xl font-bold text-slate-800">{tasks?.length ?? 0}</span>
          </div>
        </div>
      </div>

      {/* 錯誤訊息區 */}
      {(errorMsg || orgErr || unitErr || projErr || error || logErr || driveErr) && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-red-700">
                {errorMsg && decodeURIComponent(errorMsg)}
                {orgErr?.message}
                {unitErr?.message}
                {projErr?.message}
                {error?.message}
                {logErr?.message}
                {driveErr?.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 篩選與工具列 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
        <SearchForm
          projects={projects ?? []}
          projectIdFilter={projectIdFilter}
          searchTerm={searchTerm}
        />

        {canCreate && (
          <details className="group relative">
            <summary className="list-none cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <span>+ 新增任務</span>
            </summary>
            <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-10 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="font-bold text-slate-800 mb-3">快速新增任務</h3>
              <form className="flex flex-col gap-3" action={createTaskAction}>
                {projectIdFilter && (
                  <>
                    <input type="hidden" name="project_id" value={projectIdFilter} />
                    <input type="hidden" name="org_id" value={selectedProject?.org_id ?? orgId ?? ""} />
                    <input type="hidden" name="unit_id" value={selectedProject?.unit_id ?? ""} />
                  </>
                )}
                <select name="org_id" defaultValue={selectedProject?.org_id ?? orgId ?? ""} disabled={!!projectIdFilter} className="w-full p-2 border rounded text-sm">
                  <option value="">選擇公司</option>
              {(orgs ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
                <select name="unit_id" defaultValue={selectedProject?.unit_id ?? ""} disabled={!!projectIdFilter} className="w-full p-2 border rounded text-sm">
                  <option value="">選擇部門</option>
              {(units ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
                <select name="project_id" defaultValue={projectIdFilter ?? ""} disabled={!!projectIdFilter} className="w-full p-2 border rounded text-sm">
                  <option value="">選擇專案</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
                <input name="phase_name" placeholder="階段名稱 *" className="w-full p-2 border rounded text-sm" />
                <input name="name" placeholder="任務名稱 *" className="w-full p-2 border rounded text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input name="code" placeholder="代碼" className="w-full p-2 border rounded text-sm" />
                  <input name="start_offset_days" placeholder="開始偏移" className="w-full p-2 border rounded text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input name="duration_days" placeholder="工期" className="w-full p-2 border rounded text-sm" />
                  <select name="owner_unit_id" defaultValue="" className="w-full p-2 border rounded text-sm">
                    <option value="">負責部門</option>
              {(units ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                  確認新增
                </button>
              </form>
            </div>
          </details>
        )}
      </div>

      {/* 任務列表表格 */}
      {!error && (!tasks || tasks.length === 0) ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
          <p className="text-slate-400">目前沒有符合條件的任務</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto overflow-y-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span>任務名稱</span>
                    <a
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      href={buildQueryString({
                        project_id: projectIdFilter,
                        q: searchTerm,
                        sort_by: "name",
                        sort_dir: sortBy === "name" && sortDir === "asc" ? "desc" : "asc",
                      })}
                    >
                      {sortBy === "name" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                    </a>
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span>專案 / 階段</span>
                    <a
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      href={buildQueryString({
                        project_id: projectIdFilter,
                        q: searchTerm,
                        sort_by: "phase_name",
                        sort_dir: sortBy === "phase_name" && sortDir === "asc" ? "desc" : "asc",
                      })}
                    >
                      {sortBy === "phase_name" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                    </a>
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span>負責部門</span>
                    <a
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      href={buildQueryString({
                        project_id: projectIdFilter,
                        q: searchTerm,
                        sort_by: "owner_unit_id",
                        sort_dir: sortBy === "owner_unit_id" && sortDir === "asc" ? "desc" : "asc",
                      })}
                    >
                      {sortBy === "owner_unit_id" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                    </a>
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span>進度</span>
                    <a
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      href={buildQueryString({
                        project_id: projectIdFilter,
                        q: searchTerm,
                        sort_by: "progress",
                        sort_dir: sortBy === "progress" && sortDir === "asc" ? "desc" : "asc",
                      })}
                    >
                      {sortBy === "progress" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                    </a>
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span>更新時間</span>
                    <a
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      href={buildQueryString({
                        project_id: projectIdFilter,
                        q: searchTerm,
                        sort_by: "updated_at",
                        sort_dir: sortBy === "updated_at" && sortDir === "asc" ? "desc" : "asc",
                      })}
                    >
                      {sortBy === "updated_at" ? (sortDir === "asc" ? "▲" : "▼") : "△"}
                    </a>
                  </div>
                </th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
          {tasks?.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      {t.code && <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono">{t.code}</span>}
                      {t.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">Seq: {t.seq}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-900">{selectedProject?.name ?? "未知專案"}</div>
                    <div className="text-xs text-slate-500">{t.phase_name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {unitNameById[t.unit_id] ?? "-"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${t.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                          style={{ width: `${t.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-medium text-slate-600">{t.progress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(t.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative inline-block text-left">
                      <input
                        id={`task-edit-${t.id}`}
                        type="checkbox"
                        className="peer hidden"
                      />
                      <label
                        htmlFor={`task-edit-${t.id}`}
                        className="text-slate-400 hover:text-blue-600 cursor-pointer list-none p-1 rounded hover:bg-slate-100"
                      >
                        編輯
                      </label>
                      <label
                        htmlFor={`task-edit-${t.id}`}
                        className="fixed inset-0 bg-black/40 z-40 hidden peer-checked:block"
                      />
                      <div className="fixed inset-0 z-50 hidden items-center justify-center peer-checked:flex">
                        <div className="w-[min(520px,92vw)] max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 p-4 text-left">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold text-slate-800 text-sm">編輯任務</h4>
                            <label
                              htmlFor={`task-edit-${t.id}`}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              ✕
                            </label>
                          </div>
                          <form className="flex flex-col gap-3" action={updateTaskAction}>
                            <input type="hidden" name="task_id" value={t.id} />
                            <div className="grid grid-cols-2 gap-2">
                              <input name="phase_name" defaultValue={t.phase_name} placeholder="階段" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                              <input name="code" defaultValue={t.code ?? ""} placeholder="代碼" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                            </div>
                            <input name="name" defaultValue={t.name} placeholder="任務名稱" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                            <div className="grid grid-cols-3 gap-2">
                              <input name="seq" defaultValue={String(t.seq)} placeholder="序號" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                              <input name="progress" defaultValue={String(t.progress)} placeholder="進度" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                              <input name="duration_days" defaultValue={String(t.duration_days ?? 1)} placeholder="工期" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                            </div>
                            <input
                              name="start_offset_days"
                              defaultValue={String(t.start_offset_days ?? 0)}
                              placeholder="開始偏移日"
                              className="w-full p-2 border rounded text-xs"
                              disabled={!canUpdate}
                            />
                            <select name="unit_id" defaultValue={t.unit_id} className="w-full p-2 border rounded text-xs" disabled={!canUpdate}>
                              {(units ?? []).map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.name}
                                </option>
                              ))}
                            </select>
                            <select name="owner_unit_id" defaultValue={t.owner_unit_id ?? ""} className="w-full p-2 border rounded text-xs" disabled={!canUpdate}>
                              <option value="">選擇部門</option>
                              {(units ?? []).map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.name}
                                </option>
                              ))}
                            </select>
                            <div className="border-t border-slate-100 my-1"></div>
                            <input name="completed_at" placeholder="完成時間 (YYYY/MM/DD HH:mm)" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                            <input name="action" placeholder="動作紀錄" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                            <input name="note" placeholder="備註" className="w-full p-2 border rounded text-xs" disabled={!canUpdate} />
                            <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded text-xs font-medium" disabled={!canUpdate}>
                              更新任務
                            </button>
                          </form>
                          
                          {(filesByTask[t.id] ?? []).length > 0 && (
                            <div className="mt-4 pt-3 border-t border-slate-100">
                              <h5 className="text-xs font-bold text-slate-500 mb-2">已上傳檔案</h5>
                              {(filesByTask[t.id] ?? []).map((file) => {
                                const thumbSrc = getThumbnailSrc(file);
                                return (
                                  <div className="flex items-center gap-2 mb-2 p-1.5 bg-slate-50 rounded border border-slate-100" key={file.id}>
                                    {thumbSrc ? (
                                      <img className="w-8 h-8 rounded object-cover" src={thumbSrc} alt={file.name} loading="lazy" />
                                    ) : (
                                      <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-[10px] text-slate-500">FILE</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium truncate">{file.name}</div>
                                      <a className="text-[10px] text-blue-500 hover:underline truncate block" href={file.web_view_link} target="_blank" rel="noreferrer">
                                        開啟連結
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {canDelete && (
                            <div className="mt-4 pt-3 border-t border-slate-100">
                              <ConfirmForm
                                className="w-full"
                                action={deleteTaskAction}
                                confirmMessage="確定要刪除此任務嗎？相關檔案也會一起刪除。"
                              >
                                <input type="hidden" name="task_id" value={t.id} />
                                {projectIdFilter && <input type="hidden" name="project_id" value={projectIdFilter} />}
                                <button type="submit" className="w-full text-red-600 hover:bg-red-50 py-2 rounded text-xs font-medium transition-colors">
                                  刪除任務
                                </button>
                              </ConfirmForm>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
              </tr>
          ))}
            </tbody>
          </table>
        </div>
      )}

      {!logErr && taskLogs && taskLogs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-8">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-bold text-slate-800">任務變更紀錄</h2>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                <th className="px-6 py-3">任務</th>
                <th className="px-6 py-3">動作</th>
                <th className="px-6 py-3">人員</th>
                <th className="px-6 py-3">時間</th>
                <th className="px-6 py-3">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {taskLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-sm font-medium text-slate-900">{taskNameById[log.task_id] ?? "未知任務"}</td>
                  <td className="px-6 py-3 text-sm text-slate-600">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{log.action}</span>
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-600">{userOptions.find((u) => u.id === log.user_id)?.displayName ?? "-"}</td>
                  <td className="px-6 py-3 text-sm text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-6 py-3 text-sm text-slate-500">{log.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
