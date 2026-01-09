"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createProjectTask, updateTaskProgress, updateTaskSchedule } from "./actions";

type Project = {
  id: string;
  name: string;
  start_date: string;
  status: string | null;
  org_id: string;
  unit_id: string;
};

type TaskStatus = "ready" | "in_progress" | "completed" | "error";
type FlagLevel = "warning" | "danger";

type Task = {
  id: string;
  seq: number;
  phase_name: string;
  code: string | null;
  name: string;
  progress: number;
  duration_days: number;
  start_offset_days: number;
  owner_unit_id: string | null;
  parent_id?: string | null;
  level?: number;
  status?: TaskStatus;
};

type TaskFlag = {
  id: string;
  text: string;
  level: FlagLevel;
  offset_days: number;
  offset_hours: number;
};

type DriveItem = {
  id: string;
  project_task_id: string;
  name: string;
  web_view_link: string;
  thumbnail_link: string | null;
  mime_type: string | null;
};

type FileItem = {
  id: string;
  name: string;
  url: string;
  thumbnailLink?: string | null;
  mimeType?: string | null;
};

type Props = {
  project: Project;
  tasks: Task[];
  role: string | null;
  driveItems: DriveItem[];
};

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "board", label: "Board" },
  { id: "timeline", label: "Timeline" },
  { id: "files", label: "Files" },
  { id: "settings", label: "Settings" },
];

const mockTasks: Task[] = [
  {
    id: "mock-1",
    seq: 1,
    phase_name: "立項",
    code: "1.1",
    name: "需求評估與分析",
    progress: 20,
    duration_days: 6,
    start_offset_days: 0,
    owner_unit_id: null,
    status: "ready",
  },
  {
    id: "mock-2",
    seq: 2,
    phase_name: "設計",
    code: "2.1",
    name: "設計圖紙製作",
    progress: 45,
    duration_days: 10,
    start_offset_days: 6,
    owner_unit_id: null,
    status: "in_progress",
  },
  {
    id: "mock-3",
    seq: 3,
    phase_name: "施工",
    code: "3.1",
    name: "備料與進場",
    progress: 0,
    duration_days: 4,
    start_offset_days: 16,
    owner_unit_id: null,
    status: "ready",
  },
];

function groupDriveItems(items: DriveItem[]) {
  const grouped: Record<string, FileItem[]> = {};
  items.forEach((item) => {
    if (!item.project_task_id) return;
    const entry: FileItem = {
      id: item.id,
      name: item.name,
      url: item.web_view_link,
      thumbnailLink: item.thumbnail_link,
      mimeType: item.mime_type,
    };
    if (!grouped[item.project_task_id]) {
      grouped[item.project_task_id] = [];
    }
    grouped[item.project_task_id].push(entry);
  });
  return grouped;
}

function getThumbnailSrc(file: FileItem) {
  if (!file.thumbnailLink) return null;
  return `/api/drive/thumbnail?item_id=${encodeURIComponent(file.id)}`;
}

export default function ProjectWorkspace({ project, tasks, role, driveItems }: Props) {
  const isViewer = role === "viewer";
  const [activeTab, setActiveTab] = useState("dashboard");
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createPhase, setCreatePhase] = useState("新任務");
  const [createName, setCreateName] = useState("");
  const [createStartIndex, setCreateStartIndex] = useState(0);
  const [createDuration, setCreateDuration] = useState(3);
  const [createMsg, setCreateMsg] = useState("");
  const [subtaskName, setSubtaskName] = useState("");
  const [subtaskStartIndex, setSubtaskStartIndex] = useState(0);
  const [subtaskDuration, setSubtaskDuration] = useState(2);
  const [subtaskMsg, setSubtaskMsg] = useState("");
  const [flagsByTask, setFlagsByTask] = useState<Record<string, TaskFlag[]>>({});
  const [flagManager, setFlagManager] = useState<{ open: boolean; taskId: string | null }>({
    open: false,
    taskId: null,
  });
  const [notesByTask, setNotesByTask] = useState<Record<string, string>>({});
  const [flagMenu, setFlagMenu] = useState<{
    taskId: string;
    x: number;
    y: number;
    offset_days: number;
    offset_hours: number;
    text: string;
    level: FlagLevel;
  } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const [isCreating, startCreate] = useTransition();

  function resolveStatus(task: Task): TaskStatus {
    if (task.status) return task.status;
    if (task.progress >= 100) return "completed";
    if (task.progress > 0) return "in_progress";
    return "ready";
  }

  function normalizeTask(task: Task): Task {
    return {
      ...task,
      start_offset_days: task.start_offset_days ?? 0,
      duration_days: task.duration_days ?? 1,
      progress: task.progress ?? 0,
      status: resolveStatus(task),
      parent_id: task.parent_id ?? null,
      level: task.level ?? 0,
    };
  }

  const initialTasks =
    tasks.length > 0
      ? tasks.map((task) => normalizeTask(task))
      : mockTasks;
  const [localTasks, setLocalTasks] = useState<Task[]>(initialTasks);
  const [filesByTask, setFilesByTask] = useState<Record<string, FileItem[]>>(
    () => groupDriveItems(driveItems)
  );
  const [logsByTask, setLogsByTask] = useState<
    Record<string, Array<{ time: string; note: string; progress: number }>>
  >({});
  const tasksRef = useRef<Task[]>(localTasks);

  useEffect(() => {
    tasksRef.current = localTasks;
  }, [localTasks]);

  useEffect(() => {
    if (!tasks.length) return;
    setLocalTasks(tasks.map((task) => normalizeTask(task)));
  }, [tasks]);

  const selectedTask = localTasks.find((task) => task.id === selectedId) ?? null;

  function getTaskStatus(task: Task | null): TaskStatus {
    if (!task) return "ready";
    if (task.status) return task.status;
    if (task.progress >= 100) return "completed";
    if (task.progress > 0) return "in_progress";
    return "ready";
  }

  useEffect(() => {
    if (!selectedTask) return;
    setProgress(selectedTask.progress);
    setSubtaskName("");
    setSubtaskStartIndex(selectedTask.start_offset_days);
    setSubtaskDuration(Math.max(1, selectedTask.duration_days));
    setSubtaskMsg("");
    setNote("");
    setMessage("");
  }, [selectedTask]);

  const { phaseEntries, childCount } = useMemo(() => {
    const rootsByPhase = new Map<string, Task[]>();
    const byParent = new Map<string, Task[]>();
    const childCounter = new Map<string, number>();

    localTasks.forEach((task) => {
      if (task.parent_id) {
        const list = byParent.get(task.parent_id) ?? [];
        list.push(task);
        byParent.set(task.parent_id, list);
        childCounter.set(task.parent_id, (childCounter.get(task.parent_id) ?? 0) + 1);
        return;
      }
      const list = rootsByPhase.get(task.phase_name) ?? [];
      list.push(task);
      rootsByPhase.set(task.phase_name, list);
    });

    const result: Array<[string, Task[]]> = [];
    rootsByPhase.forEach((items, phase) => {
      const ordered: Task[] = [];
      const appendTask = (task: Task, level: number) => {
        const nextLevel = Math.min(level, 2);
        ordered.push({ ...task, level: nextLevel });
        if (collapsedIds.has(task.id)) return;
        if (nextLevel >= 2) return;
        const children = (byParent.get(task.id) ?? []).slice().sort((a, b) => a.seq - b.seq);
        children.forEach((child) => appendTask(child, nextLevel + 1));
      };

      items
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .forEach((root) => appendTask(root, root.level ?? 0));
      result.push([phase, ordered]);
    });

    return { phaseEntries: result, childCount: childCounter };
  }, [localTasks, collapsedIds]);

  const totalTasks = localTasks.length;
  const completed = localTasks.filter((t) => t.progress >= 100).length;
  const average = totalTasks === 0 ? 0 : Math.round(localTasks.reduce((a, t) => a + t.progress, 0) / totalTasks);

  const startDate = project.start_date ? new Date(project.start_date) : new Date();
  const today = new Date();
  const overdue = localTasks.filter((t) => {
    const due = new Date(startDate);
    due.setDate(due.getDate() + t.start_offset_days + t.duration_days);
    return t.progress < 100 && due < today;
  }).length;

  const timelineDays = Math.max(
    30,
    ...localTasks.map((t) => t.start_offset_days + t.duration_days)
  );
  const dayWidth = 18;
  const dayList = useMemo(() => {
    return Array.from({ length: timelineDays }, (_, index) => {
      const day = new Date(startDate);
      day.setDate(day.getDate() + index);
      return day;
    });
  }, [startDate, timelineDays]);

  const monthBlocks = useMemo(() => {
    const blocks: Array<{ label: string; days: number }> = [];
    let current = "";
    let count = 0;
    dayList.forEach((day) => {
      const label = `${day.getFullYear()} 年 ${day.getMonth() + 1} 月`;
      if (!current) {
        current = label;
        count = 1;
        return;
      }
      if (label === current) {
        count += 1;
      } else {
        blocks.push({ label: current, days: count });
        current = label;
        count = 1;
      }
    });
    if (current) blocks.push({ label: current, days: count });
    return blocks;
  }, [dayList]);

  const weekBlocks = useMemo(() => {
    const blocks: Array<{ label: string; days: number }> = [];
    for (let i = 0; i < dayList.length; i += 7) {
      const start = dayList[i];
      const end = dayList[Math.min(i + 6, dayList.length - 1)];
      const label = `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;
      blocks.push({ label, days: Math.min(7, dayList.length - i) });
    }
    return blocks;
  }, [dayList]);

  const todayOffset = useMemo(() => {
    const diff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= timelineDays ? diff : null;
  }, [startDate, timelineDays, today]);

  function formatDate(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function getTaskStartDate(task: Task) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + task.start_offset_days);
    return date;
  }

  function getTaskEndDate(task: Task) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + task.start_offset_days + Math.max(1, task.duration_days));
    return date;
  }

  const [dragState, setDragState] = useState<{
    taskId: string;
    type: "move" | "resize-left" | "resize-right";
    startX: number;
    startOffset: number;
    startDuration: number;
    active: boolean;
    pointerId: number | null;
  } | null>(null);
  const dragMetaRef = useRef<{ moved: boolean; type: "move" | "resize-left" | "resize-right" } | null>(null);

  function beginDrag(
    task: Task,
    type: "move" | "resize-left" | "resize-right",
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (isViewer) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDragState({
      taskId: task.id,
      type,
      startX: event.clientX,
      startOffset: task.start_offset_days,
      startDuration: task.duration_days,
      active: false,
      pointerId: event.pointerId ?? null,
    });
    dragMetaRef.current = { moved: false, type };
  }

  useEffect(() => {
    if (!dragState) return;
    const dragThreshold = 10;

    function onMove(event: PointerEvent) {
      if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) {
        return;
      }
      const deltaPx = event.clientX - dragState.startX;
      if (!dragState.active && Math.abs(deltaPx) < dragThreshold) {
        return;
      }
      if (!dragState.active) {
        setDragState((prev) => (prev ? { ...prev, active: true } : prev));
      }
      const delta = Math.round(deltaPx / dayWidth);
      if (delta !== 0) {
        dragMetaRef.current = dragMetaRef.current
          ? { ...dragMetaRef.current, moved: true }
          : { moved: true, type: dragState.type };
      }
      setLocalTasks((prev) =>
        prev.map((task) => {
          if (task.id !== dragState.taskId) return task;
          if (dragState.type === "move") {
            const nextStart = Math.max(0, dragState.startOffset + delta);
            return { ...task, start_offset_days: nextStart };
          }
          if (dragState.type === "resize-left") {
            const nextStart = Math.max(0, dragState.startOffset + delta);
            const nextDuration = Math.max(1, dragState.startDuration - delta);
            return { ...task, start_offset_days: nextStart, duration_days: nextDuration };
          }
          const nextDuration = Math.max(1, dragState.startDuration + delta);
          return { ...task, duration_days: nextDuration };
        })
      );
    }

    function onUp(event: PointerEvent) {
      if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) {
        return;
      }
      const dragMeta = dragMetaRef.current;
      const task = tasksRef.current.find((t) => t.id === dragState.taskId);
      dragMetaRef.current = null;
      setDragState(null);
      if (task && dragMeta?.moved && !task.id.startsWith("mock") && !task.id.startsWith("local-")) {
        void updateTaskSchedule({
          task_id: task.id,
          start_offset_days: task.start_offset_days,
          duration_days: task.duration_days,
        });
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragState, dayWidth]);

  function openTask(task: Task) {
    setSelectedId(task.id);
    setPanelOpen(true);
  }

  function addUploadedFile(taskId: string, item: FileItem) {
    setFilesByTask((prev) => ({
      ...prev,
      [taskId]: [item, ...(prev[taskId] ?? [])],
    }));
  }

  function addLog(taskId: string, noteText: string, value: number) {
    const time = new Date().toLocaleString();
    setLogsByTask((prev) => ({
      ...prev,
      [taskId]: [{ time, note: noteText || "進度更新", progress: value }, ...(prev[taskId] ?? [])],
    }));
  }

  function onCreateTask() {
    setCreateMsg("");
    if (!createName.trim()) {
      setCreateMsg("請輸入任務名稱");
      return;
    }

    startCreate(async () => {
      const res: any = await createProjectTask({
        project_id: project.id,
        org_id: project.org_id,
        unit_id: project.unit_id,
        phase_name: createPhase.trim() || "新任務",
        name: createName.trim(),
        start_offset_days: createStartIndex,
        duration_days: createDuration,
      });

      if (!res?.ok) {
        const fallback: Task = {
          id: `local-${Date.now()}`,
          seq: localTasks.length + 1,
          phase_name: createPhase.trim() || "新任務",
          code: null,
          name: createName.trim(),
          progress: 0,
          duration_days: Math.max(1, createDuration),
          start_offset_days: Math.max(0, createStartIndex),
          owner_unit_id: null,
          status: "ready",
          parent_id: null,
          level: 0,
        };
        setLocalTasks((prev) => [...prev, fallback]);
        setCreateMsg(`新增失敗，先以本地任務顯示：${res?.error ?? "unknown"}`);
        setCreateName("");
        setCreateOpen(false);
        return;
      }

      setLocalTasks((prev) => [...prev, res.task as Task]);
      setCreateName("");
      setCreateStartIndex(0);
      setCreateDuration(3);
      setCreateMsg("已新增");
      setCreateOpen(false);
    });
  }

  function onCreateSubtask() {
    if (!selectedTask) return;
    setSubtaskMsg("");
    if (!subtaskName.trim()) {
      setSubtaskMsg("請輸入子任務名稱");
      return;
    }
    const level = selectedTask.level ?? 0;
    if (level >= 2) {
      setSubtaskMsg("子任務最多兩層");
      return;
    }

    const fallback: Task = {
      id: `local-${Date.now()}`,
      seq: localTasks.length + 1,
      phase_name: selectedTask.phase_name,
      code: null,
      name: subtaskName.trim(),
      progress: 0,
      duration_days: Math.max(1, subtaskDuration),
      start_offset_days: Math.max(0, subtaskStartIndex),
      owner_unit_id: null,
      status: "ready",
      parent_id: selectedTask.id,
      level: level + 1,
    };

    setLocalTasks((prev) => [...prev, fallback]);
    setSubtaskName("");
    setSubtaskDuration(Math.max(1, selectedTask.duration_days));
    setSubtaskOffset(selectedTask.start_offset_days);
    setSubtaskMsg("已新增");
  }

  function closeFlagMenu() {
    setFlagMenu(null);
  }

  function openFlagManager(taskId: string | null) {
    setFlagManager({ open: true, taskId });
  }

  function closeFlagManager() {
    setFlagManager({ open: false, taskId: null });
  }

  function openFlagMenu(task: Task, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetPx = event.clientX - rect.left;
    const dayFloat = Math.max(0, offsetPx / dayWidth);
    const offset_days = Math.floor(dayFloat);
    const offset_hours = Math.min(23, Math.max(0, Math.round((dayFloat - offset_days) * 24)));
    setFlagMenu({
      taskId: task.id,
      x: event.clientX,
      y: event.clientY,
      offset_days,
      offset_hours,
      text: "",
      level: "warning",
    });
  }

  function addFlagFromMenu() {
    if (!flagMenu) return;
    if (!flagMenu.text.trim()) return;
    const nextFlag: TaskFlag = {
      id: `flag-${Date.now()}`,
      text: flagMenu.text.trim(),
      level: flagMenu.level,
      offset_days: Math.max(0, Math.floor(flagMenu.offset_days)),
      offset_hours: Math.min(23, Math.max(0, Math.floor(flagMenu.offset_hours))),
    };
    setFlagsByTask((prev) => ({
      ...prev,
      [flagMenu.taskId]: [...(prev[flagMenu.taskId] ?? []), nextFlag],
    }));
    setFlagMenu(null);
  }

  function deleteFlag(taskId: string, flagId: string) {
    setFlagsByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).filter((flag) => flag.id !== flagId),
    }));
  }

  function saveProgress() {
    if (!selectedTask) return;
    setMessage("");
    startTransition(async () => {
      const value = Math.max(0, Math.min(100, Number(progress)));
      const res: any = await updateTaskProgress({
        task_id: selectedTask.id,
        progress: value,
        note,
      });

      if (!res?.ok) {
        const msg = `保存失敗：${res?.error ?? "unknown"}`;
        setMessage(msg);
        return;
      }

      if (res?.warn) {
        const msg = res.warn;
        setMessage(msg);
      } else {
        setMessage("已更新");
      }

      setLocalTasks((prev) =>
        prev.map((task) =>
          task.id === selectedTask.id
            ? { ...task, progress: value, status: value >= 100 ? "completed" : getTaskStatus(task) }
            : task
        )
      );
      setNotesByTask((prev) => ({
        ...prev,
        [selectedTask.id]: note.trim() ? note.trim() : "進度更新",
      }));
      addLog(selectedTask.id, note, value);
    });
  }

  function onStatusChange(next: TaskStatus) {
    if (!selectedTask) return;
    setLocalTasks((prev) =>
      prev.map((task) => (task.id === selectedTask.id ? { ...task, status: next } : task))
    );
  }

  function getBarStyle(task: Task): React.CSSProperties {
    const progressValue = Math.max(0, Math.min(100, task.progress ?? 0));
    const status = getTaskStatus(task);
    if (status === "error") {
      return { background: "#f44336" };
    }
    if (status === "completed" || progressValue >= 100) {
      return { background: "#4caf50" };
    }
    if (progressValue > 0) {
      return {
        background: `linear-gradient(90deg, #4caf50 0%, #4caf50 ${progressValue}%, #ffc107 ${progressValue}%, #ffc107 100%)`,
      };
    }
    if (status === "ready") {
      return { background: "#9e9e9e" };
    }
    return { background: "#ffc107" };
  }

  function toggleCollapsed(taskId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{project.name}</div>
          <div className="page-subtitle">
            狀態 {project.status ?? "active"} ・開始 {project.start_date || "-"}
          </div>
        </div>
        <div className="topbar-right">
          <span className="badge">{role ?? "member"}</span>
          <button className="btn btn-ghost" type="button">
            匯出報表
          </button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${activeTab === tab.id ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <div className="card-grid">
          <div className="card">
            <div className="card-title">總任務數</div>
            <div className="page-title">{totalTasks}</div>
            <div className="page-subtitle">跨階段的任務總量</div>
          </div>
          <div className="card">
            <div className="card-title">平均進度</div>
            <div className="page-title">{average}%</div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${average}%` }} />
            </div>
          </div>
          <div className="card">
            <div className="card-title">逾期任務</div>
            <div className="page-title">{overdue}</div>
            <div className="page-subtitle">依開始日推估</div>
          </div>
          <div className="card">
            <div className="card-title">已完成</div>
            <div className="page-title">{completed}</div>
            <div className="page-subtitle">達成 100% 進度</div>
          </div>
        </div>
      )}

      {activeTab === "board" && (
        <div className="board">
          {phaseEntries.map(([phase, items]) => (
            <div className="board-column" key={phase}>
              <div className="card-header">
                <div className="card-title">{phase}</div>
                <span className="badge">{items.length}</span>
              </div>
              {items.map((task) => (
                <div
                  className={`task-card task-card-level-${task.level ?? 0}`}
                  key={task.id}
                  onClick={() => openTask(task)}
                >
                  <div className="task-card-title">
                    {(childCount.get(task.id) ?? 0) > 0 && (
                      <button
                        className="collapse-toggle"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCollapsed(task.id);
                        }}
                      >
                        {collapsedIds.has(task.id) ? "+" : "−"}
                      </button>
                    )}
                    <strong>
                      {task.code ? `[${task.code}] ` : ""}
                      {task.name}
                    </strong>
                  </div>
                  <div className="page-subtitle">時程 {task.duration_days} 天</div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {activeTab === "timeline" && (
        <>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Timeline</div>
              <div className="topbar-right">
                <button className="btn btn-primary" type="button" onClick={() => setCreateOpen((v) => !v)}>
                  新增任務
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => openFlagManager(selectedId)}>
                  旗標管理
                </button>
                <span className="badge">可拖曳與縮放</span>
              </div>
            </div>

            {createOpen && (
              <div className="admin-form-grid" style={{ padding: 0, border: "none" }}>
                <input
                  placeholder="任務名稱"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
                <input
                  placeholder="階段名稱 (Phase)"
                  value={createPhase}
                  onChange={(e) => setCreatePhase(e.target.value)}
                />
                <select
                  className="select"
                  value={createStartIndex}
                  onChange={(e) => setCreateStartIndex(Number(e.target.value))}
                >
                  {dayList.map((day, index) => (
                    <option key={`create-day-${index}`} value={index}>
                      開始日期 {formatDate(day)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="工期 (天)"
                  value={createDuration}
                  onChange={(e) => setCreateDuration(Number(e.target.value))}
                />
                <button type="button" onClick={onCreateTask} disabled={isCreating || isViewer}>
                  {isCreating ? "新增中..." : "確認新增"}
                </button>
                {createMsg && <div className="page-subtitle">{createMsg}</div>}
              </div>
            )}
          </div>

          <div className="timeline">
            <div className="timeline-header timeline-months">
              <div className="timeline-left">任務</div>
              <div className="timeline-grid" style={{ minWidth: timelineDays * dayWidth }}>
                <div className="timeline-row">
                  {monthBlocks.map((block, index) => (
                    <div
                      key={`m-${index}`}
                      className="timeline-month"
                      style={{ width: block.days * dayWidth }}
                    >
                      {block.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="timeline-header timeline-weeks">
              <div className="timeline-left" />
              <div className="timeline-grid" style={{ minWidth: timelineDays * dayWidth }}>
                <div className="timeline-row">
                  {weekBlocks.map((block, index) => (
                    <div
                      key={`w-${index}`}
                      className="timeline-week"
                      style={{ width: block.days * dayWidth }}
                    >
                      {block.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {phaseEntries.map(([phase, items]) => (
              <div key={`phase-${phase}`}>
                <div className="timeline-phase">
                  <div className="timeline-left">{phase}</div>
                  <div className="timeline-grid" style={{ minWidth: timelineDays * dayWidth }} />
                </div>
                {items.map((task) => (
                  <div className="timeline-row" key={task.id}>
                    <div className="timeline-left timeline-cell">
                      <div className={`timeline-task-label level-${task.level ?? 0}`}>
                        {(childCount.get(task.id) ?? 0) > 0 && (
                          <button
                            className="collapse-toggle"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleCollapsed(task.id);
                            }}
                          >
                            {collapsedIds.has(task.id) ? "+" : "−"}
                          </button>
                        )}
                        {task.code ? `[${task.code}] ` : ""}
                        {task.name}
                      </div>
                      <div className="page-subtitle">{task.duration_days} 天</div>
                    </div>
                    <div
                      className="timeline-track timeline-grid"
                      style={{
                        minWidth: timelineDays * dayWidth,
                        backgroundSize: `${dayWidth}px 1px`,
                      }}
                      onClick={() => openTask(task)}
                    >
                      {todayOffset !== null && (
                        <div
                          className="timeline-today"
                          style={{ left: todayOffset * dayWidth }}
                        />
                      )}
                      <div
                        className={`timeline-bar status-${getTaskStatus(task)}`}
                        style={{
                          left: task.start_offset_days * dayWidth,
                          width: task.duration_days * dayWidth,
                          ...getBarStyle(task),
                        }}
                        onDoubleClick={() => openTask(task)}
                        onPointerDown={(event) => beginDrag(task, "move", event)}
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => openFlagMenu(task, event)}
                      >
                        <span
                          className="timeline-resize left"
                          onPointerDown={(event) => beginDrag(task, "resize-left", event)}
                        />
                        <span
                          className="timeline-resize right"
                          onPointerDown={(event) => beginDrag(task, "resize-right", event)}
                        />
                      </div>
                      {(flagsByTask[task.id] ?? []).map((flag) => {
                        const offset =
                          Math.max(0, Math.min(task.duration_days, flag.offset_days)) + flag.offset_hours / 24;
                        const left = (task.start_offset_days + offset) * dayWidth;
                        return (
                          <div
                            key={flag.id}
                            className={`timeline-flag ${flag.level === "danger" ? "danger" : "warning"}`}
                            style={{ left }}
                          >
                            <span className="timeline-flag-pin" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {flagMenu && (
            <div className="flag-menu-backdrop" onClick={closeFlagMenu}>
              <div
                className="flag-menu"
                style={{ left: flagMenu.x, top: flagMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flag-menu-title">新增旗標</div>
                <label className="page-subtitle" htmlFor="flag-menu-text">
                  內容
                </label>
                <input
                  id="flag-menu-text"
                  placeholder="輸入提醒內容"
                  value={flagMenu.text}
                  onChange={(e) =>
                    setFlagMenu((prev) => (prev ? { ...prev, text: e.target.value } : prev))
                  }
                />
                <label className="page-subtitle" htmlFor="flag-menu-level">
                  類型
                </label>
                <select
                  id="flag-menu-level"
                  className="select"
                  value={flagMenu.level}
                  onChange={(e) =>
                    setFlagMenu((prev) =>
                      prev ? { ...prev, level: e.target.value as FlagLevel } : prev
                    )
                  }
                >
                  <option value="warning">注意 (黃色)</option>
                  <option value="danger">危險 (紅色)</option>
                </select>
                <label className="page-subtitle" htmlFor="flag-menu-day">
                  Day
                </label>
                <input
                  id="flag-menu-day"
                  type="number"
                  value={flagMenu.offset_days}
                  onChange={(e) =>
                    setFlagMenu((prev) =>
                      prev ? { ...prev, offset_days: Number(e.target.value) } : prev
                    )
                  }
                />
                <label className="page-subtitle" htmlFor="flag-menu-hour">
                  Hour (0-23)
                </label>
                <input
                  id="flag-menu-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={flagMenu.offset_hours}
                  onChange={(e) =>
                    setFlagMenu((prev) =>
                      prev ? { ...prev, offset_hours: Number(e.target.value) } : prev
                    )
                  }
                />
                <div className="flag-menu-actions">
                  <button type="button" className="btn btn-primary" onClick={addFlagFromMenu}>
                    新增
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={closeFlagMenu}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
          {flagManager.open && (
            <div className="flag-manager-backdrop" onClick={closeFlagManager}>
              <div className="flag-manager" onClick={(event) => event.stopPropagation()}>
                <div className="flag-menu-title">旗標管理</div>
                {!flagManager.taskId && <div className="page-subtitle">請先選擇任務。</div>}
                {flagManager.taskId && (
                  <>
                    <div className="page-subtitle">
                      任務：{localTasks.find((task) => task.id === flagManager.taskId)?.name ?? "未知"}
                    </div>
                    {(flagsByTask[flagManager.taskId] ?? []).length === 0 && (
                      <div className="page-subtitle">尚無旗標。</div>
                    )}
                    {(flagsByTask[flagManager.taskId] ?? []).map((flag) => {
                      const task = localTasks.find((item) => item.id === flagManager.taskId);
                      if (!task) return null;
                      const flagDate = new Date(startDate);
                      flagDate.setDate(
                        flagDate.getDate() + task.start_offset_days + Math.max(0, flag.offset_days)
                      );
                      flagDate.setHours(Math.min(23, Math.max(0, flag.offset_hours)), 0, 0, 0);
                      return (
                        <div className="flag-manager-item" key={`manager-${flag.id}`}>
                          <div>
                            <div>{flag.text}</div>
                            <div className="page-subtitle">
                              {flag.level === "danger" ? "危險" : "注意"} ・{formatDate(flagDate)} ・
                              {String(flag.offset_hours).padStart(2, "0")}:00
                            </div>
                          </div>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => deleteFlag(flagManager.taskId, flag.id)}
                          >
                            刪除
                          </button>
                        </div>
                      );
                    })}
                    <div className="page-subtitle">右鍵點任務條可新增旗標。</div>
                  </>
                )}
                <div className="flag-menu-actions">
                  <button type="button" className="btn btn-ghost" onClick={closeFlagManager}>
                    關閉
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "files" && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">專案檔案</div>
            <span className="badge">依任務分組</span>
          </div>
          <div className="page-subtitle">點任務可快速新增連結。</div>
          <div className="board" style={{ marginTop: 16 }}>
            {localTasks.map((task) => (
              <div className="board-column" key={`files-${task.id}`}>
                <div className="card-header">
                  <div className="card-title">{task.name}</div>
                  <button className="btn btn-ghost" type="button" onClick={() => openTask(task)}>
                    新增
                  </button>
                </div>
                {(filesByTask[task.id] ?? []).length === 0 && (
                  <div className="page-subtitle">尚無檔案</div>
                )}
                {(filesByTask[task.id] ?? []).map((file) => {
                  const thumbSrc = getThumbnailSrc(file);
                  return (
                    <div className="file-item" key={file.id}>
                      {thumbSrc ? (
                        <img className="file-thumb" src={thumbSrc} alt={file.name} loading="lazy" />
                      ) : (
                        <div className="file-thumb file-thumb-fallback">FILE</div>
                      )}
                      <div className="file-meta">
                        <div className="file-title">{file.name}</div>
                        <a className="page-subtitle" href={file.url} target="_blank" rel="noreferrer">
                          {file.url}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">專案設定</div>
          </div>
          <div className="page-subtitle">
            目前以最小設定顯示，後續可加入模板、權限與通知設定。
          </div>
        </div>
      )}

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="task-panel">
          <SheetHeader>
            <SheetTitle>Task Detail</SheetTitle>
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
                  開始 {formatDate(getTaskStartDate(selectedTask))} ・結束{" "}
                  {formatDate(getTaskEndDate(selectedTask))} ・工期 {selectedTask.duration_days} 天
                </div>
              </div>

              <div className="card" style={{ padding: 14 }}>
                <div className="card-header">
                  <div className="card-title">進度回報</div>
                  <span className="badge">{progress}%</span>
                </div>
                <label className="page-subtitle" htmlFor="task-status">
                  任務狀態
                </label>
                <select
                  id="task-status"
                  className="select"
                  value={getTaskStatus(selectedTask)}
                  onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
                  disabled={isViewer}
                >
                  <option value="ready">Ready / To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="error">Error</option>
                </select>
                <label className="page-subtitle" htmlFor="task-progress">
                  完成百分比 (0-100)
                </label>
                <input
                  id="task-progress"
                  className="range"
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  disabled={isViewer}
                />
                <label className="page-subtitle" htmlFor="task-note">
                  回報說明
                </label>
                <textarea
                  id="task-note"
                  className="textarea"
                  placeholder="進度備註"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  disabled={isViewer}
                />
                <div className="topbar-right">
                  <button className="btn btn-primary" type="button" onClick={saveProgress} disabled={isPending || isViewer}>
                    {isPending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setPanelOpen(false)}>
                    Close
                  </button>
                </div>
                {message && <div className="page-subtitle">{message}</div>}
              </div>

              <div className="card" style={{ padding: 14 }}>
                <div className="card-header">
                  <div className="card-title">子任務</div>
                  <span className="badge">最多兩層</span>
                </div>
                <div className="page-subtitle">點子任務可再次編輯。</div>
                {(localTasks.filter((task) => task.parent_id === selectedTask.id) ?? []).length === 0 && (
                  <div className="page-subtitle">尚無子任務</div>
                )}
                {(localTasks.filter((task) => task.parent_id === selectedTask.id) ?? []).map((task) => (
                  <div className="task-card task-card-level-1" key={`sub-${task.id}`} onClick={() => openTask(task)}>
                    <div>{task.name}</div>
                    <div className="page-subtitle">工期 {task.duration_days} 天</div>
                  </div>
                ))}
                <div className="admin-form-grid" style={{ padding: 0, border: "none" }}>
                  <label className="page-subtitle" htmlFor="subtask-name">
                    子任務名稱
                  </label>
                  <input
                    id="subtask-name"
                    placeholder="子任務名稱"
                    value={subtaskName}
                    onChange={(e) => setSubtaskName(e.target.value)}
                    disabled={isViewer}
                  />
                  <label className="page-subtitle" htmlFor="subtask-start-date">
                    開始日期
                  </label>
                  <select
                    id="subtask-start-date"
                    className="select"
                    value={subtaskStartIndex}
                    onChange={(e) => setSubtaskStartIndex(Number(e.target.value))}
                    disabled={isViewer}
                  >
                    {dayList.map((day, index) => (
                      <option key={`subtask-day-${index}`} value={index}>
                        開始日期 {formatDate(day)}
                      </option>
                    ))}
                  </select>
                  <label className="page-subtitle" htmlFor="subtask-duration">
                    工期 (天)
                  </label>
                  <input
                    id="subtask-duration"
                    type="number"
                    placeholder="工期 (天)"
                    value={subtaskDuration}
                    onChange={(e) => setSubtaskDuration(Number(e.target.value))}
                    disabled={isViewer}
                  />
                  <button type="button" onClick={onCreateSubtask} disabled={isViewer}>
                    新增子任務
                  </button>
                  {subtaskMsg && <div className="page-subtitle">{subtaskMsg}</div>}
                </div>
              </div>

              <div className="card" style={{ padding: 14 }}>
                <div className="card-header">
                  <div className="card-title">文件連結</div>
                </div>
                <FileUploadForm
                  taskId={selectedTask.id}
                  onUploaded={(item) => addUploadedFile(selectedTask.id, item)}
                  disabled={isViewer}
                />
                <div className="page-subtitle">目前連結數量 {filesByTask[selectedTask.id]?.length ?? 0}</div>
                <div>
                  {(filesByTask[selectedTask.id] ?? []).map((file) => {
                    const thumbSrc = getThumbnailSrc(file);
                    return (
                      <div className="file-item" key={file.id}>
                        {thumbSrc ? (
                          <img className="file-thumb" src={thumbSrc} alt={file.name} loading="lazy" />
                        ) : (
                          <div className="file-thumb file-thumb-fallback">FILE</div>
                        )}
                        <div className="file-meta">
                          <div className="file-title">{file.name}</div>
                          <a className="page-subtitle" href={file.url} target="_blank" rel="noreferrer">
                            {file.url}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card" style={{ padding: 14 }}>
                <div className="card-header">
                  <div className="card-title">活動紀錄</div>
                </div>
                {(logsByTask[selectedTask.id] ?? []).length === 0 && (
                  <div className="page-subtitle">尚無更新紀錄</div>
                )}
                {(logsByTask[selectedTask.id] ?? []).map((log, index) => (
                  <div className="task-card" key={`${log.time}-${index}`}>
                    <div>{log.note}</div>
                    <div className="page-subtitle">
                      {log.time} ・{log.progress}%
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

function FileUploadForm({
  taskId,
  onUploaded,
  disabled,
}: {
  taskId: string;
  onUploaded: (item: FileItem) => void;
  disabled?: boolean;
}) {
  const driveFolderUrl = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_URL;
  const driveFolderName = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_NAME ?? "Google Drive";
  const [displayName, setDisplayName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload() {
    setMessage("");
    if (!file) {
      setMessage("請先選擇檔案");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("task_id", taskId);
      formData.append("display_name", displayName);
      formData.append("file", file);
      const res = await fetch("/api/drive/upload", {
        method: "POST",
        body: formData,
      });

      const rawText = await res.text();
      let payload: any = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = null;
      }
      if (!res.ok) {
        const errorKey = payload?.error ?? "upload_failed";
        const friendlyMessages: Record<string, string> = {
          missing_google_oauth:
            "尚未設定 Google Drive OAuth，請先設定 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN。",
          not_authenticated: "尚未登入，請先登入後再上傳。",
          file_too_large: "檔案超過 10MB 限制，請縮小後再試。",
          image_too_large: "圖片壓縮後仍超過 10MB，請縮小後再試。",
          unauthorized_client:
            "Google OAuth 未被授權（unauthorized_client）。請確認 OAuth 憑證類型與已授權的重新導向 URI。",
        };
        if (!payload && rawText) {
          setMessage(`upload_failed: ${rawText}`);
        } else {
          setMessage(friendlyMessages[errorKey] ?? errorKey);
        }
        return;
      }

      if (payload?.item) {
        onUploaded({
          id: payload.item.id,
          name: payload.item.name,
          url: payload.item.web_view_link,
          thumbnailLink: payload.item.thumbnail_link,
          mimeType: payload.item.mime_type,
        });
      }

      setDisplayName("");
      setFile(null);
      setMessage("上傳成功");
    } catch (err: any) {
      setMessage(err?.message ?? "upload_failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="admin-form-grid" style={{ padding: 0, border: "none" }}>
      <input
        placeholder="檔案名稱（選填）"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={disabled || isUploading}
      />
      <input
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        disabled={disabled || isUploading}
      />
      <button type="button" onClick={handleUpload} disabled={disabled || isUploading}>
        {isUploading ? "上傳中..." : "上傳到 Google Drive"}
      </button>
      <div className="page-subtitle">圖片超過 2MB 會壓縮，其他檔案上限 10MB。</div>
      {driveFolderUrl && (
        <div className="page-subtitle">
          上傳到：
          <a href={driveFolderUrl} target="_blank" rel="noreferrer">
            {driveFolderName}
          </a>
        </div>
      )}
      {message && <div className="page-subtitle">{message}</div>}
    </div>
  );
}
