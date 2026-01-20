"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">儀表板</h1>
          <p className="text-muted-foreground">部門 → 專案 → 任務，快速掌握 KPI、進度與協助狀態。</p>
        </div>
      </div>

      <div className="card">
        <form className="flex flex-col md:flex-row gap-3" method="get">
          <Select name="unit_id" defaultValue={unitIdFilter || "all"}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="全部部門" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部部門</SelectItem>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select name="project_id" defaultValue={projectIdFilter || "all"}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="選擇專案" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">選擇專案</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit">
            套用篩選
          </Button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">部門總覽</div>
          <div className="flex items-center gap-2">
            <span className="badge">加權進度 + 紅黃綠</span>
            <Button variant="ghost" onClick={() => setPortfolioOpen((prev) => !prev)}>
              {portfolioOpen ? "收合" : "展開"}
            </Button>
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
          <div className="space-y-4">
            <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" action={createAssistAction}>
              <input type="hidden" name="project_id" value={selectedProject.id} />
              <Select name="to_unit_id" defaultValue="all">
                <SelectTrigger>
                  <SelectValue placeholder="指派部門（可選）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">指派部門（可選）</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input name="due_date" type="date" placeholder="到期日" />
              <Input name="note" placeholder="協助說明" />
              <Button type="submit">
                新增協助
              </Button>
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
                  <Select name="status" defaultValue={assist.status}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="open">待處理</SelectItem>
                        <SelectItem value="in_progress">進行中</SelectItem>
                        <SelectItem value="resolved">已結案</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" variant="ghost">
                    更新
                  </Button>
                </form>
              </div>
            ))}
          </div>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>任務</TableHead>
                  <TableHead>進度</TableHead>
                  <TableHead>到期</TableHead>
                  <TableHead>最後回報</TableHead>
                  <TableHead>協助</TableHead>
                  <TableHead>紅黃綠</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedProjectTasks.map((task) => (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <TableCell>
                      <div className="font-medium">
                        {task.code ? `[${task.code}] ` : ""}
                        {task.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{task.phase_name}</div>
                    </TableCell>
                    <TableCell>{task.progress}%</TableCell>
                    <TableCell>
                      <div className={task.overdue ? "text-destructive" : ""}>
                        {formatDate(task.due_date)}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(task.last_report_at)}</TableCell>
                    <TableCell>
                      {task.assist_open} / {task.assist_overdue}
                    </TableCell>
                    <TableCell>
                      <span className="badge" style={ragTone[task.rag]}>
                        {ragLabel[task.rag]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <SheetContent side="right" className="w-[420px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>任務抽屜</SheetTitle>
          </SheetHeader>
          {!selectedTask && <div className="text-muted-foreground p-6">尚未選擇任務</div>}
          {selectedTask && (
            <div className="space-y-6 p-6">
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold">
                  {selectedTask.code ? `[${selectedTask.code}] ` : ""}
                  {selectedTask.name}
                </h2>
                <p className="text-muted-foreground">階段 {selectedTask.phase_name}</p>
                <p className="text-muted-foreground">
                  到期 {formatDate(selectedTask.due_date)} ・最後回報 {formatDateTime(selectedTask.last_report_at)}
                </p>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">任務協助</h3>
                  <span className="badge">{selectedTask.assist_open} 未結案</span>
                </div>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end" action={createAssistAction}>
                  <input type="hidden" name="project_id" value={selectedTask.project_id} />
                  <input type="hidden" name="project_task_id" value={selectedTask.id} />
                  <div className="md:col-span-2">
                    <Select name="to_unit_id" defaultValue="all">
                      <SelectTrigger>
                        <SelectValue placeholder="指派部門（可選）" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">指派部門（可選）</SelectItem>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input name="due_date" type="date" placeholder="到期日" />
                  <Input name="note" placeholder="協助說明" />
                  <Button type="submit" className="md:col-span-2">
                    新增協助
                  </Button>
                </form>
                {(assistsByTask[selectedTask.id] ?? []).length === 0 && (
                  <div className="text-muted-foreground text-sm">尚無協助請求。</div>
                )}
                <div className="space-y-4">
                  {(assistsByTask[selectedTask.id] ?? []).map((assist) => (
                    <div className="rounded-lg border p-3 space-y-2" key={assist.id}>
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">
                          {unitNameById[assist.unit_id] ?? "未指派"} →
                          {assist.to_unit_id ? unitNameById[assist.to_unit_id] ?? "未指派" : "未指派"}
                        </div>
                        <span className="badge">狀態 {assistStatusLabel[assist.status] ?? assist.status}</span>
                      </div>
                      <p className="text-muted-foreground text-sm">到期 {assist.due_date ?? "-"}</p>
                      <p className="text-sm">{assist.note ?? "(無說明)"}</p>
                      <form className="flex gap-2 items-center" action={updateAssistStatusAction}>
                        <input type="hidden" name="assist_id" value={assist.id} />
                        <Select name="status" defaultValue={assist.status}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="open">待處理</SelectItem>
                              <SelectItem value="in_progress">進行中</SelectItem>
                              <SelectItem value="resolved">已結案</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="submit" variant="ghost">
                          更新
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-semibold">進度回報</h3>
                {(logsByTask[selectedTask.id] ?? []).length === 0 && (
                  <div className="text-muted-foreground text-sm">尚無回報紀錄</div>
                )}
                <div className="space-y-3">
                  {(logsByTask[selectedTask.id] ?? []).map((log) => (
                    <div className="p-2" key={log.id}>
                      <p className="text-sm">{log.note ?? "進度更新"}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(log.created_at)} ・{log.progress}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-semibold">文件連結</h3>
                {(driveItemsByTask[selectedTask.id] ?? []).length === 0 && (
                  <div className="text-muted-foreground text-sm">尚無文件</div>
                )}
                <div className="space-y-3">
                  {(driveItemsByTask[selectedTask.id] ?? []).map((item) => (
                    <div className="flex items-center gap-3 rounded-md border p-2" key={item.id}>
                      <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">FILE</div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">{item.name}</p>
                        <a className="text-xs text-muted-foreground hover:underline" href={item.web_view_link} target="_blank" rel="noreferrer">
                          {item.web_view_link}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
