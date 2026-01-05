import { Fragment } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function emailToDisplayName(email: string | null | undefined) {
  if (!email) return "user";
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
}

async function updateTaskAction(formData: FormData) {
  "use server";

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

  const seq = seqRaw ? Number(seqRaw) : null;
  const progress = progressRaw ? Number(progressRaw) : null;
  const startOffsetDays = startOffsetRaw ? Number(startOffsetRaw) : null;
  const durationDays = durationRaw ? Number(durationRaw) : null;

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
  await admin.from("project_tasks").update(updates).eq("id", taskId);

  const { data: taskRow } = await admin
    .from("project_tasks")
    .select("org_id, unit_id")
    .eq("id", taskId)
    .maybeSingle();

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  await admin.from("task_change_logs").insert({
    task_id: taskId,
    org_id: taskRow?.org_id ?? null,
    unit_id: taskRow?.unit_id ?? null,
    user_id: userId,
    action: actionRaw || "update",
    completed_at: completedAtRaw || null,
    note: note || null,
  });
}

export default async function AdminTasksPage() {
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

  const { data: orgs, error: orgErr } = orgId
    ? await admin.from("orgs").select("id, name").eq("id", orgId)
    : await admin.from("orgs").select("id, name");

  const { data: units, error: unitErr } = orgId
    ? await admin.from("units").select("id, name, org_id").eq("org_id", orgId).order("name", { ascending: true })
    : await admin.from("units").select("id, name, org_id").order("name", { ascending: true });

  const { data: projects, error: projErr } = orgId
    ? await admin.from("projects").select("id, name, org_id").eq("org_id", orgId).order("created_at", { ascending: false })
    : await admin.from("projects").select("id, name, org_id").order("created_at", { ascending: false });

  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = userList?.users ?? [];
  const userIds = users.map((u) => u.id);
  const { data: profileList } = userIds.length
    ? await admin.from("profiles").select("user_id, display_name").in("user_id", userIds)
    : { data: [] as Array<{ user_id: string; display_name: string | null }> };

  const displayById = new Map((profileList ?? []).map((p) => [p.user_id, p.display_name]));
  const userOptions = users.map((u) => ({
    id: u.id,
    displayName: (displayById.get(u.id) ?? "").trim() || emailToDisplayName(u.email),
  }));

  const { data: tasks, error } = orgId
    ? await admin
        .from("project_tasks")
        .select("id, project_id, seq, phase_name, code, name, progress, updated_at, org_id, unit_id, start_offset_days, duration_days, owner_unit_id")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(200)
    : await admin
        .from("project_tasks")
        .select("id, project_id, seq, phase_name, code, name, progress, updated_at, org_id, unit_id, start_offset_days, duration_days, owner_unit_id")
        .order("updated_at", { ascending: false })
        .limit(200);

  const { data: taskLogs, error: logErr } = orgId
    ? await admin
        .from("task_change_logs")
        .select("id, task_id, user_id, action, completed_at, note, created_at, org_id, unit_id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200)
    : await admin
        .from("task_change_logs")
        .select("id, task_id, user_id, action, completed_at, note, created_at, org_id, unit_id")
        .order("created_at", { ascending: false })
        .limit(200);

  const orgNameById = Object.fromEntries((orgs ?? []).map((org) => [org.id, org.name]));
  const unitNameById = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit.name]));
  const taskNameById = Object.fromEntries((tasks ?? []).map((task) => [task.id, task.name]));

  return (
    <div className="admin-page">
      <h1>任務管理</h1>
      {!orgId && <p>尚未綁定組織，暫時顯示全部資料。</p>}
      {orgErr && <p className="admin-error">{orgErr.message}</p>}
      {unitErr && <p className="admin-error">{unitErr.message}</p>}
      {projErr && <p className="admin-error">{projErr.message}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {logErr && <p className="admin-error">task_change_logs: {logErr.message}</p>}
      {!error && (!tasks || tasks.length === 0) && <p>目前沒有任務。</p>}
      {!error && (
        <form className="admin-form" action={async (formData) => {
          "use server";
          const formOrgId = String(formData.get("org_id") ?? "").trim();
          const unitId = String(formData.get("unit_id") ?? "").trim();
          const projectId = String(formData.get("project_id") ?? "").trim();
          const phaseName = String(formData.get("phase_name") ?? "").trim();
          const code = String(formData.get("code") ?? "").trim();
          const name = String(formData.get("name") ?? "").trim();
          const seqRaw = String(formData.get("seq") ?? "").trim();
          const startOffsetRaw = String(formData.get("start_offset_days") ?? "").trim();
          const durationRaw = String(formData.get("duration_days") ?? "").trim();
          const ownerUnitId = String(formData.get("owner_unit_id") ?? "").trim();

          const seq = Number(seqRaw);
          const startOffsetDays = startOffsetRaw ? Number(startOffsetRaw) : 0;
          const durationDays = durationRaw ? Number(durationRaw) : 1;

          if (!formOrgId || !unitId || !projectId || !phaseName || !name || Number.isNaN(seq)) return;
          const adminClient = createAdminSupabase();
          await adminClient.from("project_tasks").insert({
            org_id: formOrgId,
            unit_id: unitId,
            project_id: projectId,
            phase_name: phaseName,
            code: code || null,
            name,
            seq,
            start_offset_days: Number.isNaN(startOffsetDays) ? 0 : startOffsetDays,
            duration_days: Number.isNaN(durationDays) ? 1 : durationDays,
            owner_unit_id: ownerUnitId || null,
            progress: 0,
          });
        }}>
          <select name="org_id" defaultValue={orgId ?? ""}>
            <option value="">選擇組織</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select name="unit_id" defaultValue="">
            <option value="">選擇單位</option>
            {(units ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select name="project_id" defaultValue="">
            <option value="">選擇專案</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input name="phase_name" placeholder="階段名稱" />
          <input name="code" placeholder="代碼（選填）" />
          <input name="name" placeholder="任務名稱" />
          <input name="seq" placeholder="序號" />
          <input name="start_offset_days" placeholder="開始偏移日" />
          <input name="duration_days" placeholder="工期（天）" />
          <select name="owner_unit_id" defaultValue="">
            <option value="">負責單位（選填）</option>
            {(units ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <button type="submit">新增任務</button>
        </form>
      )}
      {!error && tasks && tasks.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>任務</th>
              <th>序號</th>
              <th>組織</th>
              <th>單位</th>
              <th>進度</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <Fragment key={t.id}>
                <tr key={t.id}>
                  <td>
                    {t.phase_name} {t.code ? `[${t.code}] ` : ""}{t.name}
                  </td>
                  <td>{t.seq}</td>
                  <td>{orgNameById[t.org_id] ?? "-"}</td>
                  <td>{unitNameById[t.unit_id] ?? "-"}</td>
                  <td>{t.progress}%</td>
                  <td>{new Date(t.updated_at).toLocaleString()}</td>
                </tr>
                <tr key={`${t.id}-edit`}>
                  <td colSpan={6}>
                    <form className="admin-form" action={updateTaskAction}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <input name="phase_name" defaultValue={t.phase_name} placeholder="階段" />
                      <input name="code" defaultValue={t.code ?? ""} placeholder="代碼" />
                      <input name="name" defaultValue={t.name} placeholder="任務名稱" />
                      <input name="seq" defaultValue={String(t.seq)} placeholder="序號" />
                      <input name="progress" defaultValue={String(t.progress)} placeholder="進度" />
                      <input
                        name="start_offset_days"
                        defaultValue={String(t.start_offset_days ?? 0)}
                        placeholder="開始偏移日"
                      />
                      <input name="duration_days" defaultValue={String(t.duration_days ?? 1)} placeholder="工期" />
                      <select name="unit_id" defaultValue={t.unit_id}>
                        {(units ?? []).map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                      <select name="owner_unit_id" defaultValue={t.owner_unit_id ?? ""}>
                        <option value="">負責單位</option>
                        {(units ?? []).map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                      <input name="completed_at" placeholder="完成時間 (YYYY-MM-DD HH:mm)" />
                      <input name="action" placeholder="動作" />
                      <input name="note" placeholder="備註" />
                      <button type="submit">更新</button>
                    </form>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {!logErr && taskLogs && taskLogs.length > 0 && (
        <div className="admin-section">
          <h2>任務變更紀錄</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>任務</th>
                <th>動作</th>
                <th>人員</th>
                <th>組織</th>
                <th>單位</th>
                <th>完成時間</th>
                <th>備註</th>
                <th>時間</th>
              </tr>
            </thead>
            <tbody>
              {taskLogs.map((log) => (
                <tr key={log.id}>
                  <td>{taskNameById[log.task_id] ?? "未知任務"}</td>
                  <td>{log.action}</td>
                  <td>{userOptions.find((u) => u.id === log.user_id)?.displayName ?? "未知使用者"}</td>
                  <td>{log.org_id ? orgNameById[log.org_id] ?? "-" : "-"}</td>
                  <td>{log.unit_id ? unitNameById[log.unit_id] ?? "-" : "-"}</td>
                  <td>{log.completed_at ? new Date(log.completed_at).toLocaleString() : "-"}</td>
                  <td>{log.note ?? "-"}</td>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
