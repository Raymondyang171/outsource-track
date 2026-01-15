import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  project_id: string;
  phase_name: string;
  code: string | null;
  name: string;
  progress: number;
  duration_days: number;
  start_offset_days: number;
  owner_unit_id: string | null;
  owner_user_id: string | null;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  start_date: string;
};

type AssistRow = {
  id: string;
  project_id: string;
  project_task_id: string | null;
  unit_id: string;
  to_unit_id: string | null;
  status: string;
  due_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  project_tasks?: {
    name: string;
    code: string | null;
  } | null;
};

type TaskItem = {
  id: string;
  kind: "task" | "assist";
  title: string;
  subtitle: string;
  dueDate: Date | null;
  href: string;
  completed: boolean;
};

function isMissingTableError(error: any) {
  const message = String(error?.message ?? "");
  return message.includes("Could not find the table");
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(value: Date | null) {
  if (!value) return "未設定";
  return value.toISOString().slice(0, 10);
}

async function updateProfileAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    redirect(`/settings?error=${encodeURIComponent("display_name_required")}`);
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" });

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/settings?ok=updated");
}

async function sendPasswordResetAction() {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) {
    redirect("/login");
  }

  const redirectBase = process.env.NEXT_PUBLIC_SITE_URL;
  const { error } = redirectBase
    ? await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${redirectBase}/reset-password`,
      })
    : await supabase.auth.resetPasswordForEmail(user.email);

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/settings?ok=password_email_sent");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = Array.isArray(sp?.ok) ? sp?.ok?.[0] : sp?.ok;
  const error = Array.isArray(sp?.error) ? sp?.error?.[0] : sp?.error;
  const okMsg =
    ok === "updated"
      ? "已更新個人設定。"
      : ok === "password_email_sent"
        ? "已寄出密碼重設信，請至信箱完成確認。"
        : ok === "password_updated"
          ? "密碼已更新，請重新登入確認。"
          : null;

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("org_id, unit_id, role, created_at, units(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const membershipRows = (memberships ?? []).map((m) => {
    const unit = Array.isArray(m.units) ? m.units[0] : m.units;
    return {
      unit_id: m.unit_id,
      unit_name: unit?.name ?? "未指派部門",
      role: m.role ?? "-",
    };
  });

  const unitIds = Array.from(new Set((memberships ?? []).map((m) => m.unit_id)));
  const unitNameById = Object.fromEntries(
    (memberships ?? []).map((m) => {
      const unit = Array.isArray(m.units) ? m.units[0] : m.units;
      return [m.unit_id, unit?.name ?? "未指派部門"];
    })
  );

  let taskQuery = supabase
    .from("project_tasks")
    .select(
      "id, project_id, phase_name, code, name, progress, duration_days, start_offset_days, owner_unit_id, owner_user_id, updated_at"
    )
    .order("updated_at", { ascending: false });
  if (unitIds.length && user.id) {
    const inUnits = unitIds.map((id) => `"${id}"`).join(",");
    taskQuery = taskQuery.or(`owner_unit_id.in.(${inUnits}),owner_user_id.eq.${user.id}`);
  } else if (unitIds.length) {
    taskQuery = taskQuery.in("owner_unit_id", unitIds);
  } else {
    taskQuery = taskQuery.eq("owner_user_id", user.id);
  }
  const { data: tasks } = unitIds.length || user.id ? await taskQuery : { data: [] };

  let assistRows: AssistRow[] = [];
  if (unitIds.length) {
    const { data: assists, error: assistErr } = await supabase
      .from("assist_requests")
      .select(
        "id, project_id, project_task_id, unit_id, to_unit_id, status, due_date, note, created_at, updated_at, project_tasks(name, code)"
      )
      .in("to_unit_id", unitIds)
      .order("created_at", { ascending: false });

    if (!assistErr || !isMissingTableError(assistErr)) {
      assistRows = (assists ?? []) as AssistRow[];
    }
  }

  const taskRows = (tasks ?? []) as TaskRow[];
  const projectIds = Array.from(
    new Set([
      ...taskRows.map((task) => task.project_id),
      ...assistRows.map((assist) => assist.project_id),
    ])
  );

  const { data: projects } = projectIds.length
    ? await supabase.from("projects").select("id, name, start_date").in("id", projectIds)
    : { data: [] };

  const projectById = Object.fromEntries((projects ?? []).map((project: ProjectRow) => [project.id, project]));
  const today = startOfDay(new Date());
  const soonLimit = addDays(today, 3);

  const taskItems: TaskItem[] = taskRows.map((task) => {
    const project = projectById[task.project_id] as ProjectRow | undefined;
    const projectStart = project?.start_date ? parseDateOnly(project.start_date) : null;
    const dueDate = projectStart
      ? addDays(projectStart, (task.start_offset_days ?? 0) + Math.max(1, task.duration_days ?? 1))
      : null;
    const code = task.code ? `[${task.code}] ` : "";
    return {
      id: task.id,
      kind: "task",
      title: `${code}${task.name}`.trim(),
      subtitle: project ? `專案：${project.name}` : "專案：未指定",
      dueDate,
      href: `/projects/${task.project_id}?tab=board`,
      completed: (task.progress ?? 0) >= 100,
    };
  });

  const assistItems: TaskItem[] = assistRows.map((assist) => {
    const project = projectById[assist.project_id] as ProjectRow | undefined;
    const assistTaskName = assist.project_tasks?.name;
    const assistTaskCode = assist.project_tasks?.code ? `[${assist.project_tasks.code}] ` : "";
    const title = assistTaskName
      ? `${assistTaskCode}${assistTaskName}`.trim()
      : assist.note
        ? `協助：${assist.note}`
        : "協助需求";
    const fromUnit = unitNameById[assist.unit_id] ?? "未指派部門";
    const projectLabel = project ? `專案：${project.name}` : "專案：未指定";
    const dueDate = assist.due_date ? parseDateOnly(assist.due_date) : null;

    return {
      id: assist.id,
      kind: "assist",
      title,
      subtitle: `${projectLabel} · 來源部門：${fromUnit}`,
      dueDate,
      href: `/projects/${assist.project_id}?tab=board`,
      completed: assist.status === "resolved",
    };
  });

  const allItems = [...taskItems, ...assistItems];
  const overdueItems = allItems.filter(
    (item) => !item.completed && item.dueDate && item.dueDate < today
  );
  const soonItems = allItems.filter(
    (item) => !item.completed && item.dueDate && item.dueDate >= today && item.dueDate <= soonLimit
  );
  const assignedItems = allItems.filter((item) => {
    if (item.completed) return false;
    if (item.dueDate && item.dueDate < today) return false;
    if (item.dueDate && item.dueDate <= soonLimit) return false;
    return true;
  });
  const completedItems = allItems.filter((item) => item.completed);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">個人設定</div>
          <div className="page-subtitle">管理你的顯示名稱與基本資料。</div>
        </div>
      </div>

      {okMsg && <p className="admin-success">{okMsg}</p>}
      {error && <p className="admin-error">{decodeURIComponent(error)}</p>}

      <div className="card-grid">
        <form className="card space-y-4" action={updateProfileAction}>
          <div className="card-header">
            <div className="card-title">個人資料</div>
          </div>
          <div className="admin-field">
            <label>電子郵件</label>
            <div className="admin-inline-meta">{user.email ?? "-"}</div>
          </div>
          <div className="admin-field">
            <label>單位 / 權限</label>
            <div className="admin-inline-meta">
              {membershipRows.length === 0 && <div>尚未加入單位</div>}
              {membershipRows.map((row) => (
                <div key={`${row.unit_id}-${row.role}`}>
                  {row.unit_name} · {row.role}
                </div>
              ))}
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor="display_name">顯示名稱</label>
            <input
              id="display_name"
              name="display_name"
              defaultValue={profile?.display_name ?? ""}
              placeholder="請輸入顯示名稱"
              required
            />
          </div>
          <div className="topbar-right">
            <button type="submit" className="btn btn-primary">
              儲存設定
            </button>
          </div>
        </form>

        <form className="card space-y-4" action={sendPasswordResetAction}>
          <div className="card-header">
            <div className="card-title">安全性</div>
          </div>
          <div className="page-subtitle">
            透過寄送密碼重設信完成驗證後，再重新設定密碼。
          </div>
          <div className="admin-field">
            <label>密碼重設信寄送至</label>
            <div className="admin-inline-meta">{user.email ?? "-"}</div>
          </div>
          <div className="topbar-right">
            <button type="submit" className="btn btn-primary">
              寄送密碼重設信
            </button>
          </div>
        </form>
      </div>

      <div className="card space-y-4">
        <div className="card-header">
          <div>
            <div className="card-title">我的待辦</div>
            <div className="page-subtitle">專案任務與協助需求的個人清單。</div>
          </div>
        </div>

        {!unitIds.length && (
          <div className="page-subtitle">尚未加入任何部門，暫無待辦項目。</div>
        )}

        {unitIds.length > 0 && (
          <div className="card-grid">
            <div className="card space-y-3">
              <div className="card-title">過期</div>
              {overdueItems.length === 0 && <div className="page-subtitle">沒有過期項目。</div>}
              {overdueItems.map((item) => (
                <a className="task-card" key={`overdue-${item.kind}-${item.id}`} href={item.href}>
                  <div className="task-card-title">{item.title}</div>
                  <div className="page-subtitle">{item.subtitle}</div>
                  <div className="page-subtitle">到期日：{formatDate(item.dueDate)}</div>
                </a>
              ))}
            </div>

            <div className="card space-y-3">
              <div className="card-title">快到期（三天內）</div>
              {soonItems.length === 0 && <div className="page-subtitle">沒有快到期項目。</div>}
              {soonItems.map((item) => (
                <a className="task-card" key={`soon-${item.kind}-${item.id}`} href={item.href}>
                  <div className="task-card-title">{item.title}</div>
                  <div className="page-subtitle">{item.subtitle}</div>
                  <div className="page-subtitle">到期日：{formatDate(item.dueDate)}</div>
                </a>
              ))}
            </div>

            <div className="card space-y-3">
              <div className="card-title">被指派</div>
              {assignedItems.length === 0 && <div className="page-subtitle">沒有被指派項目。</div>}
              {assignedItems.map((item) => (
                <a className="task-card" key={`assigned-${item.kind}-${item.id}`} href={item.href}>
                  <div className="task-card-title">{item.title}</div>
                  <div className="page-subtitle">{item.subtitle}</div>
                  <div className="page-subtitle">到期日：{formatDate(item.dueDate)}</div>
                </a>
              ))}
            </div>

            <div className="card space-y-3">
            <div className="card-title">已完成</div>
              {completedItems.length === 0 && <div className="page-subtitle">尚無已完成項目。</div>}
              {completedItems.map((item) => (
                <a className="task-card" key={`done-${item.kind}-${item.id}`} href={item.href}>
                  <div className="task-card-title">{item.title}</div>
                  <div className="page-subtitle">{item.subtitle}</div>
                  <div className="page-subtitle">到期日：{formatDate(item.dueDate)}</div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
