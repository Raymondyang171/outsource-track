"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ragTone = {
  green: { background: "#d1fae5", color: "#047857" },
  yellow: { background: "#fef3c7", color: "#b45309" },
  red: { background: "#ffe4e6", color: "#be123c" },
} as const;

const ragLabel = {
  green: "綠",
  yellow: "黃",
  red: "紅",
} as const;

const assistStatusLabel: Record<string, string> = {
  open: "待處理",
  in_progress: "進行中",
  resolved: "已結案",
};

type UnitRow = {
  id: string;
  name: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  unit_id: string;
  start_date: string;
  status: string | null;
  next_task_label: string | null;
  weighted_progress: number;
  overdue_tasks: number;
  last_report_at: string | null;
  assist_open: number;
  assist_overdue: number;
  assist_pairs: string[];
  rag: "green" | "yellow" | "red";
};

type PortfolioSummary = {
  id: string;
  name: string;
  project_count: number;
  weighted_progress: number;
  overdue_tasks: number;
  last_report_at: string | null;
  assist_open: number;
  assist_overdue: number;
  rag: "green" | "yellow" | "red";
};

type ProjectRow = {
  id: string;
  name: string;
  start_date: string;
  status: string | null;
  unit_id: string;
  org_id: string;
};

type TaskSummary = {
  id: string;
  project_id: string;
  phase_name: string;
  code: string | null;
  name: string;
  progress: number;
  duration_days: number;
  start_offset_days: number;
  due_date: string | null;
  overdue: boolean;
  last_report_at: string | null;
  assist_open: number;
  assist_overdue: number;
  rag: "green" | "yellow" | "red";
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

type Props = {
  units: UnitRow[];
  projects: ProjectRow[];
  unitIdFilter: string;
  projectIdFilter: string;
  portfolioSummaries: PortfolioSummary[];
  projectSummaries: ProjectSummary[];
  selectedProject: ProjectRow | null;
  selectedProjectTasks: TaskSummary[];
  logsByTask: Record<string, LogRow[]>;
  driveItemsByTask: Record<string, DriveItemRow[]>;
  assistsByProject: Record<string, AssistRow[]>;
  assistsByTask: Record<string, AssistRow[]>;
  unitNameById: Record<string, string>;
  createAssistAction: (formData: FormData) => Promise<void>;
  updateAssistStatusAction: (formData: FormData) => Promise<void>;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export default function DashboardClient({
  units,
  projects,
  unitIdFilter,
  projectIdFilter,
  portfolioSummaries,
  projectSummaries,
  selectedProject,
  selectedProjectTasks,
  logsByTask,
  driveItemsByTask,
  assistsByProject,
  assistsByTask,
  unitNameById,
  createAssistAction,
  updateAssistStatusAction,
}: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(true);
  const selectedTask = useMemo(
    () => selectedProjectTasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedProjectTasks, selectedTaskId]
  );

  const projectSummaryById = useMemo(() => {
    return Object.fromEntries(projectSummaries.map((summary) => [summary.id, summary]));
  }, [projectSummaries]);

  const selectedProjectAssists = selectedProject ? assistsByProject[selectedProject.id] ?? [] : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">儀表板</div>
          <div className="page-subtitle">部門 → 專案 → 任務，快速掌握 KPI、進度與協助狀態。</div>
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <form className="flex flex-col md:flex-row gap-3" method="get">
          <select name="unit_id" defaultValue={unitIdFilter} className="select">
            <option value="">全部部門</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select name="project_id" defaultValue={projectIdFilter} className="select">
            <option value="">選擇專案</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            套用篩選
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">部門總覽</div>
          <div className="topbar-right">
            <span className="badge">加權進度 + 紅黃綠</span>
            <button type="button" className="btn btn-ghost" onClick={() => setPortfolioOpen((prev) => !prev)}>
              {portfolioOpen ? "收合" : "展開"}
            </button>
          </div>
        </div>
        {portfolioOpen && (
          <div className="card-grid">
            {portfolioSummaries.length === 0 && <div className="page-subtitle">尚無部門資料。</div>}
            {portfolioSummaries.map((summary) => {
              const active = unitIdFilter && summary.id === unitIdFilter;
              return (
                <a
                  key={summary.id}
                  className="card"
                  style={{ borderColor: active ? "var(--brand)" : undefined }}
                  href={`/dashboard?unit_id=${summary.id}`}
                >
                  <div className="card-header">
                    <div className="card-title">{summary.name}</div>
                    <span className="badge" style={ragTone[summary.rag]}>
                      {ragLabel[summary.rag]}
                    </span>
                  </div>
                  <div className="page-title">{summary.weighted_progress}%</div>
                  <div className="page-subtitle">
                    專案 {summary.project_count} ・逾期 {summary.overdue_tasks} ・協助 {summary.assist_open}
                  </div>
                  <div className="page-subtitle">最後回報 {formatDateTime(summary.last_report_at)}</div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">專案</div>
          <span className="badge">部門 → 專案</span>
        </div>
        {projects.length === 0 && <div className="page-subtitle">尚無專案。</div>}
        <div className="card-grid">
          {projects.map((project) => {
            const summary = projectSummaryById[project.id];
            const active = projectIdFilter && projectIdFilter === project.id;
            return (
              <a
                key={project.id}
                className="card"
                style={{ borderColor: active ? "var(--brand)" : undefined }}
                href={`/dashboard?unit_id=${unitIdFilter || ""}&project_id=${project.id}`}
              >
                <div className="card-header">
                  <div className="card-title">{project.name}</div>
                  <span className="badge" style={summary ? ragTone[summary.rag] : undefined}>
                    {summary ? ragLabel[summary.rag] : "-"}
                  </span>
                </div>
                <div className="page-title">{summary ? `${summary.weighted_progress}%` : "-"}</div>
                <div className="page-subtitle">
                  逾期 {summary?.overdue_tasks ?? 0} ・協助 {summary?.assist_open ?? 0}
                </div>
                <div className="page-subtitle">
                  目前任務 {summary?.next_task_label ?? "-"}
                </div>
                <div className="page-subtitle">最後回報 {formatDateTime(summary?.last_report_at ?? null)}</div>
                {summary && summary.assist_pairs.length > 0 && (
                  <div className="page-subtitle">誰欠誰：{summary.assist_pairs.join(" / ")}</div>
                )}
              </a>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">協助請求</div>
          <span className="badge">專案層</span>
        </div>
        {!selectedProject && <div className="page-subtitle">請先選擇專案。</div>}
        {selectedProject && (
          <>
            <form className="admin-form-grid" action={createAssistAction}>
              <input type="hidden" name="project_id" value={selectedProject.id} />
              <select name="to_unit_id" defaultValue="" className="select">
                <option value="">指派部門（可選）</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <input name="due_date" type="date" placeholder="到期日" />
              <input name="note" placeholder="協助說明" />
                <button type="submit" className="btn btn-primary">
                  新增協助
                </button>
            </form>
            {selectedProjectAssists.length === 0 && (
              <div className="page-subtitle">目前沒有協助請求。</div>
            )}
            {selectedProjectAssists.map((assist) => (
              <div className="task-card" key={assist.id}>
                <div className="card-header">
                  <div className="card-title">
                    {unitNameById[assist.unit_id] ?? "未指派"} →
                    {assist.to_unit_id ? unitNameById[assist.to_unit_id] ?? "未指派" : "未指派"}
                  </div>
                  <span className="badge">狀態 {assistStatusLabel[assist.status] ?? assist.status}</span>
                </div>
                <div className="page-subtitle">到期 {assist.due_date ?? "-"}</div>
                <div className="page-subtitle">{assist.note ?? "(無說明)"}</div>
                <form className="flex gap-2 items-center" action={updateAssistStatusAction}>
                  <input type="hidden" name="assist_id" value={assist.id} />
                  <select name="status" defaultValue={assist.status} className="select">
                    <option value="open">待處理</option>
                    <option value="in_progress">進行中</option>
                    <option value="resolved">已結案</option>
                  </select>
                  <button type="submit" className="btn btn-ghost">
                    更新
                  </button>
                </form>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">任務</div>
          <span className="badge">點擊任務開啟抽屜</span>
        </div>
        {!selectedProject && <div className="page-subtitle">請先選擇專案。</div>}
        {selectedProject && selectedProjectTasks.length === 0 && (
          <div className="page-subtitle">此專案尚無任務。</div>
        )}
        {selectedProject && selectedProjectTasks.length > 0 && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                <th className="px-4 py-3">任務</th>
                <th className="px-4 py-3">進度</th>
                <th className="px-4 py-3">到期</th>
                <th className="px-4 py-3">最後回報</th>
                <th className="px-4 py-3">協助</th>
                <th className="px-4 py-3">紅黃綠</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedProjectTasks.map((task) => (
                <tr
                  key={task.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {task.code ? `[${task.code}] ` : ""}
                      {task.name}
                    </div>
                    <div className="text-xs text-slate-500">{task.phase_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-700">{task.progress}%</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={task.overdue ? "text-rose-600" : "text-slate-600"}>
                      {formatDate(task.due_date)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(task.last_report_at)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {task.assist_open} / {task.assist_overdue}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge" style={ragTone[task.rag]}>
                      {ragLabel[task.rag]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <SheetContent side="right" className="task-panel">
          <SheetHeader>
            <SheetTitle>任務抽屜</SheetTitle>
          </SheetHeader>
          {!selectedTask && <div className="page-subtitle">尚未選擇任務</div>}
          {selectedTask && (
            <div className="panel-stack">
              <div className="card" style={{ padding: 14 }}>
                <div className="card-title">
                  {selectedTask.code ? `[${selectedTask.code}] ` : ""}
                  {selectedTask.name}
                </div>
                <div className="page-subtitle">階段 {selectedTask.phase_name}</div>
                <div className="page-subtitle">
                  到期 {formatDate(selectedTask.due_date)} ・最後回報 {formatDateTime(selectedTask.last_report_at)}
                </div>
              </div>

              <div className="card" style={{ padding: 14 }}>
                <div className="card-header">
                  <div className="card-title">任務協助</div>
                  <span className="badge">{selectedTask.assist_open} 未結案</span>
                </div>
                <form className="admin-form-grid" action={createAssistAction}>
                  <input type="hidden" name="project_id" value={selectedTask.project_id} />
                  <input type="hidden" name="project_task_id" value={selectedTask.id} />
                  <select name="to_unit_id" defaultValue="" className="select">
                    <option value="">指派部門（可選）</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                  <input name="due_date" type="date" placeholder="到期日" />
                  <input name="note" placeholder="協助說明" />
                  <button type="submit" className="btn btn-primary">
                    新增協助
                  </button>
                </form>
                {(assistsByTask[selectedTask.id] ?? []).length === 0 && (
                  <div className="page-subtitle">尚無協助請求。</div>
                )}
                {(assistsByTask[selectedTask.id] ?? []).map((assist) => (
                  <div className="task-card" key={assist.id}>
                    <div className="card-header">
                      <div className="card-title">
                        {unitNameById[assist.unit_id] ?? "未指派"} →
                        {assist.to_unit_id ? unitNameById[assist.to_unit_id] ?? "未指派" : "未指派"}
                      </div>
                      <span className="badge">狀態 {assistStatusLabel[assist.status] ?? assist.status}</span>
                    </div>
                    <div className="page-subtitle">到期 {assist.due_date ?? "-"}</div>
                    <div className="page-subtitle">{assist.note ?? "(無說明)"}</div>
                    <form className="flex gap-2 items-center" action={updateAssistStatusAction}>
                      <input type="hidden" name="assist_id" value={assist.id} />
                      <select name="status" defaultValue={assist.status} className="select">
                        <option value="open">待處理</option>
                        <option value="in_progress">進行中</option>
                        <option value="resolved">已結案</option>
                      </select>
                      <button type="submit" className="btn btn-ghost">
                        更新
                      </button>
                    </form>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: 14 }}>
                <div className="card-header">
                  <div className="card-title">進度回報</div>
                </div>
                {(logsByTask[selectedTask.id] ?? []).length === 0 && (
                  <div className="page-subtitle">尚無回報紀錄</div>
                )}
                {(logsByTask[selectedTask.id] ?? []).map((log) => (
                  <div className="task-card" key={log.id}>
                    <div>{log.note ?? "進度更新"}</div>
                    <div className="page-subtitle">
                      {formatDateTime(log.created_at)} ・{log.progress}%
                    </div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: 14 }}>
                <div className="card-header">
                  <div className="card-title">文件連結</div>
                </div>
                {(driveItemsByTask[selectedTask.id] ?? []).length === 0 && (
                  <div className="page-subtitle">尚無文件</div>
                )}
                {(driveItemsByTask[selectedTask.id] ?? []).map((item) => (
                  <div className="file-item" key={item.id}>
                    <div className="file-thumb file-thumb-fallback">FILE</div>
                    <div className="file-meta">
                      <div className="file-title">{item.name}</div>
                      <a className="page-subtitle" href={item.web_view_link} target="_blank" rel="noreferrer">
                        {item.web_view_link}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
