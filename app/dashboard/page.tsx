import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { createAssistRequest, updateAssistStatus } from "./actions";

export const dynamic = "force-dynamic";

const RAG_OVERDUE_LIMIT = 3;

type UnitRow = {
  id: string;
  name: string;
};

type ProjectRow = {
  id: string;
  name: string;
  start_date: string;
  status: string | null;
  unit_id: string;
  org_id: string;
};

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
  updated_at: string;
  seq: number;
};

type LogRow = {
  id: string;
  project_task_id: string;
  progress: number;
  note: string | null;
  created_at: string;
  user_id: string | null;
};

type DriveItemRow = {
  id: string;
  project_task_id: string;
  name: string;
  web_view_link: string;
  thumbnail_link: string | null;
  mime_type: string | null;
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
};

function getNextTaskLabel(tasks: TaskRow[]) {
  if (!tasks.length) return null;
  const ordered = tasks.slice().sort((a, b) => a.seq - b.seq);
  const next = ordered.find((task) => (task.progress ?? 0) < 100) ?? ordered[ordered.length - 1];
  const code = next.code ? `${next.code} ` : "";
  return `${code}${next.name}`.trim();
}

function isMissingTableError(error: any) {
  const message = String(error?.message ?? "");
  return message.includes("Could not find the table");
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function computeRag(opts: {
  overdueTasks: number;
  overdueAssist: number;
  lastReportAt: string | null;
}) {
  if (opts.overdueTasks >= RAG_OVERDUE_LIMIT || opts.overdueAssist > 0) return "red" as const;
  const lastReport = opts.lastReportAt ? new Date(opts.lastReportAt) : null;
  const daysSince = lastReport ? diffDays(new Date(), lastReport) : 999;
  if (opts.overdueTasks > 0 || daysSince > 7) return "yellow" as const;
  return "green" as const;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ unit_id?: string; project_id?: string }>;
}) {
  const sp = await searchParams;
  const unitIdFilter = sp?.unit_id ?? "";
  const projectIdFilter = sp?.project_id ?? "";

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let dataClient = supabase;
  if (isPlatformAdmin) {
    try {
      dataClient = createAdminSupabase();
    } catch {
      return <div className="page">缺少服務金鑰，無法載入平台資料。</div>;
    }
  }

  let orgId: string | null = null;
  if (!isPlatformAdmin) {
    const { data: mems } = await supabase
      .from("memberships")
      .select("org_id, unit_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    orgId = mems?.[0]?.org_id ?? null;
  }

  if (!isPlatformAdmin && !orgId) {
    return <div className="page">尚未綁定公司，無法載入儀表板。</div>;
  }

  let unitsQuery = dataClient.from("units").select("id, name").order("name", { ascending: true });
  if (!isPlatformAdmin) {
    unitsQuery = unitsQuery.eq("org_id", orgId);
  }
  const { data: units } = await unitsQuery;

  let projectsQuery = dataClient
    .from("projects")
    .select("id, name, start_date, status, unit_id, org_id")
    .order("created_at", { ascending: false });
  if (!isPlatformAdmin) {
    projectsQuery = projectsQuery.eq("org_id", orgId);
  }
  const { data: projects } = await projectsQuery;

  const projectList = (projects ?? []) as ProjectRow[];
  const allProjectIds = projectList.map((project) => project.id);
  const filteredProjects =
    unitIdFilter && unitIdFilter !== "all"
      ? projectList.filter((project) => project.unit_id === unitIdFilter)
      : projectList;
  const selectedProjectId = projectIdFilter || filteredProjects[0]?.id || "";

  const { data: tasks } = allProjectIds.length
    ? await dataClient
        .from("project_tasks")
        .select(
          "id, project_id, phase_name, code, name, progress, duration_days, start_offset_days, owner_unit_id, updated_at, seq"
        )
        .in("project_id", allProjectIds)
        .order("seq", { ascending: true })
    : { data: [] };

  const taskRows = (tasks ?? []) as TaskRow[];
  const taskIds = taskRows.map((task) => task.id);

  const { data: logs } = taskIds.length
    ? await dataClient
        .from("progress_logs")
        .select("id, project_task_id, progress, note, created_at, user_id")
        .in("project_task_id", taskIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const logRows = (logs ?? []) as LogRow[];
  const logLatestByTask = new Map<string, string>();

  for (const log of logRows) {
    const prev = logLatestByTask.get(log.project_task_id);
    if (!prev || new Date(log.created_at) > new Date(prev)) {
      logLatestByTask.set(log.project_task_id, log.created_at);
    }
  }

  let assistRows: AssistRow[] = [];
  if (allProjectIds.length > 0) {
    const { data: assistData, error: assistErr } = await dataClient
      .from("assist_requests")
      .select(
        "id, project_id, project_task_id, unit_id, to_unit_id, status, due_date, note, created_at, updated_at"
      )
      .in("project_id", allProjectIds)
      .order("created_at", { ascending: false });

    if (!assistErr || !isMissingTableError(assistErr)) {
      assistRows = (assistData ?? []) as AssistRow[];
    }
  }

  const selectedTaskIds = taskRows
    .filter((task) => task.project_id === selectedProjectId)
    .map((task) => task.id);

  const { data: driveItems } = selectedTaskIds.length
    ? await dataClient
        .from("drive_items")
        .select("id, project_task_id, name, web_view_link, thumbnail_link, mime_type")
        .in("project_task_id", selectedTaskIds)
        .order("modified_time", { ascending: false })
    : { data: [] };

  const driveRows = (driveItems ?? []) as DriveItemRow[];

  const unitNameById = Object.fromEntries((units ?? []).map((unit: UnitRow) => [unit.id, unit.name]));

  const tasksByProject = taskRows.reduce<Record<string, TaskRow[]>>((acc, task) => {
    if (!acc[task.project_id]) acc[task.project_id] = [];
    acc[task.project_id].push(task);
    return acc;
  }, {});

  const assistsByProject = assistRows.reduce<Record<string, AssistRow[]>>((acc, assist) => {
    if (!acc[assist.project_id]) acc[assist.project_id] = [];
    acc[assist.project_id].push(assist);
    return acc;
  }, {});

  const assistsByTask = assistRows.reduce<Record<string, AssistRow[]>>((acc, assist) => {
    if (!assist.project_task_id) return acc;
    if (!acc[assist.project_task_id]) acc[assist.project_task_id] = [];
    acc[assist.project_task_id].push(assist);
    return acc;
  }, {});

  const logsByTask = logRows.reduce<Record<string, LogRow[]>>((acc, log) => {
    if (!acc[log.project_task_id]) acc[log.project_task_id] = [];
    acc[log.project_task_id].push(log);
    return acc;
  }, {});

  const driveByTask = driveRows.reduce<Record<string, DriveItemRow[]>>((acc, item) => {
    if (!acc[item.project_task_id]) acc[item.project_task_id] = [];
    acc[item.project_task_id].push(item);
    return acc;
  }, {});

  const projectSummaries = filteredProjects.map((project) => {
    const projectTasks = tasksByProject[project.id] ?? [];
    const startDate = parseDateOnly(project.start_date) ?? new Date();

    let totalWeight = 0;
    let weightedProgressSum = 0;
    let overdueTasks = 0;
    let lastReportAt: string | null = null;

    projectTasks.forEach((task) => {
      const duration = Math.max(1, task.duration_days ?? 1);
      totalWeight += duration;
      weightedProgressSum += duration * Math.max(0, Math.min(100, task.progress ?? 0));

      const dueDate = addDays(startDate, (task.start_offset_days ?? 0) + duration);
      if (task.progress < 100 && dueDate < new Date()) {
        overdueTasks += 1;
      }

      const candidates: Date[] = [];
      if (task.updated_at) {
        candidates.push(new Date(task.updated_at));
      }
      const logLatest = logLatestByTask.get(task.id);
      if (logLatest) {
        candidates.push(new Date(logLatest));
      }
      const latest = candidates.sort((a, b) => a.getTime() - b.getTime()).pop();
      if (latest) {
        const latestIso = latest.toISOString();
        if (!lastReportAt || new Date(latestIso) > new Date(lastReportAt)) {
          lastReportAt = latestIso;
        }
      }
    });

    const assists = assistsByProject[project.id] ?? [];
    const openAssists = assists.filter((assist) => assist.status !== "resolved");
    const overdueAssists = assists.filter((assist) => {
      if (assist.status === "resolved") return false;
      if (!assist.due_date) return false;
      const due = parseDateOnly(assist.due_date);
      return !!due && due < new Date();
    });

    const pairCounts = new Map<string, number>();
    openAssists.forEach((assist) => {
      const from = unitNameById[assist.unit_id] ?? "未指派部門";
      const to = assist.to_unit_id ? unitNameById[assist.to_unit_id] ?? "未指派部門" : "未指派";
      const key = `${from} → ${to}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    });

    const topPairs = Array.from(pairCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => `${label} (${count})`);

    const weightedProgress = totalWeight === 0 ? 0 : Math.round(weightedProgressSum / totalWeight);
    const nextTaskLabel = getNextTaskLabel(projectTasks);

    return {
      id: project.id,
      name: project.name,
      unit_id: project.unit_id,
      start_date: project.start_date,
      status: project.status,
      next_task_label: nextTaskLabel,
      weighted_progress: weightedProgress,
      overdue_tasks: overdueTasks,
      last_report_at: lastReportAt,
      assist_open: openAssists.length,
      assist_overdue: overdueAssists.length,
      assist_pairs: topPairs,
      rag: computeRag({
        overdueTasks,
        overdueAssist: overdueAssists.length,
        lastReportAt,
      }),
    };
  });

  const portfolioSummaries = (units ?? []).map((unit: UnitRow) => {
    const unitProjects = projectList.filter((project) => project.unit_id === unit.id);
    const projectIds = new Set(unitProjects.map((project) => project.id));
    const unitTasks = taskRows.filter((task) => projectIds.has(task.project_id));
    const startDatesByProject = new Map(
      unitProjects.map((project) => [project.id, parseDateOnly(project.start_date) ?? new Date()])
    );

    let totalWeight = 0;
    let weightedProgressSum = 0;
    let overdueTasks = 0;
    let lastReportAt: string | null = null;

    unitTasks.forEach((task) => {
      const duration = Math.max(1, task.duration_days ?? 1);
      totalWeight += duration;
      weightedProgressSum += duration * Math.max(0, Math.min(100, task.progress ?? 0));

      const startDate = startDatesByProject.get(task.project_id) ?? new Date();
      const dueDate = addDays(startDate, (task.start_offset_days ?? 0) + duration);
      if (task.progress < 100 && dueDate < new Date()) {
        overdueTasks += 1;
      }

      const candidates: Date[] = [];
      if (task.updated_at) {
        candidates.push(new Date(task.updated_at));
      }
      const logLatest = logLatestByTask.get(task.id);
      if (logLatest) {
        candidates.push(new Date(logLatest));
      }
      const latest = candidates.sort((a, b) => a.getTime() - b.getTime()).pop();
      if (latest) {
        const latestIso = latest.toISOString();
        if (!lastReportAt || new Date(latestIso) > new Date(lastReportAt)) {
          lastReportAt = latestIso;
        }
      }
    });

    const unitAssists = assistRows.filter((assist) => projectIds.has(assist.project_id));
    const openAssists = unitAssists.filter((assist) => assist.status !== "resolved");
    const overdueAssists = unitAssists.filter((assist) => {
      if (assist.status === "resolved") return false;
      if (!assist.due_date) return false;
      const due = parseDateOnly(assist.due_date);
      return !!due && due < new Date();
    });

    const weightedProgress = totalWeight === 0 ? 0 : Math.round(weightedProgressSum / totalWeight);

    return {
      id: unit.id,
      name: unit.name,
      project_count: unitProjects.length,
      weighted_progress: weightedProgress,
      overdue_tasks: overdueTasks,
      last_report_at: lastReportAt,
      assist_open: openAssists.length,
      assist_overdue: overdueAssists.length,
      rag: computeRag({
        overdueTasks,
        overdueAssist: overdueAssists.length,
        lastReportAt,
      }),
    };
  });

  const selectedProject = projectList.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectTasks = (tasksByProject[selectedProjectId] ?? []).map((task) => {
    const startDate = selectedProject?.start_date
      ? parseDateOnly(selectedProject.start_date) ?? new Date()
      : new Date();
    const duration = Math.max(1, task.duration_days ?? 1);
    const dueDate = addDays(startDate, (task.start_offset_days ?? 0) + duration);

    const candidates: Date[] = [];
    if (task.updated_at) {
      candidates.push(new Date(task.updated_at));
    }
    const logLatest = logLatestByTask.get(task.id);
    if (logLatest) {
      candidates.push(new Date(logLatest));
    }
    const lastReport = candidates.sort((a, b) => a.getTime() - b.getTime()).pop() ?? null;

    const assistForTask = assistsByTask[task.id] ?? [];
    const openAssist = assistForTask.filter((assist) => assist.status !== "resolved");
    const overdueAssist = assistForTask.filter((assist) => {
      if (assist.status === "resolved") return false;
      if (!assist.due_date) return false;
      const due = parseDateOnly(assist.due_date);
      return !!due && due < new Date();
    });

    return {
      id: task.id,
      project_id: task.project_id,
      phase_name: task.phase_name,
      code: task.code,
      name: task.name,
      progress: task.progress,
      duration_days: task.duration_days,
      start_offset_days: task.start_offset_days,
      due_date: toIso(dueDate),
      overdue: task.progress < 100 && dueDate < new Date(),
      last_report_at: toIso(lastReport),
      assist_open: openAssist.length,
      assist_overdue: overdueAssist.length,
      rag: computeRag({
        overdueTasks: task.progress < 100 && dueDate < new Date() ? 1 : 0,
        overdueAssist: overdueAssist.length,
        lastReportAt: toIso(lastReport),
      }),
    };
  });

  return (
    <DashboardClient
      units={(units ?? []) as UnitRow[]}
      projects={filteredProjects}
      unitIdFilter={unitIdFilter}
      projectIdFilter={selectedProjectId}
      portfolioSummaries={portfolioSummaries}
      projectSummaries={projectSummaries}
      selectedProject={selectedProject}
      selectedProjectTasks={selectedProjectTasks}
      logsByTask={logsByTask}
      driveItemsByTask={driveByTask}
      assistsByProject={assistsByProject}
      assistsByTask={assistsByTask}
      unitNameById={unitNameById}
      createAssistAction={createAssistRequest}
      updateAssistStatusAction={updateAssistStatus}
    />
  );
}
