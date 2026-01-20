"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { createProjectTask, getTaskLogs, updateTaskAssignees, updateTaskProgress, updateTaskSchedule } from "./actions";
import { useUploadOutbox } from "@/lib/client/outbox/uploads";
import { getDeviceId } from "@/lib/device";
import { safeFetch } from "@/lib/api-client";

const DEXIE_RETRY_COUNT = 5;

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
  owner_user_id: string | null;
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
  units: Array<{ id: string; name: string }>;
  members: Array<{
    user_id: string;
    unit_id: string;
    role: string | null;
    display_name: string | null;
    job_title_id: string | null;
    job_title: string | null;
  }>;
  assigneesByTaskId: Record<string, string[]>;
  initialTab?: string;
};

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

export default function ProjectWorkspace({
  project,
  tasks,
  role,
  driveItems,
  units,
  members,
  assigneesByTaskId,
  initialTab,
}: Props) {
  const isViewer = role === "viewer";
  const tabs = [
    { id: "dashboard", label: "儀表板" },
    { id: "board", label: "看板" },
    { id: "timeline", label: "時間軸" },
    { id: "files", label: "檔案" },
    { id: "settings", label: "設定" },
    { id: "costs", label: "費用", href: `/projects/${project.id}/costs` },
  ];
  const [activeTab, setActiveTab] = useState(initialTab ?? "dashboard");
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
  const [assigneeUnitId, setAssigneeUnitId] = useState("");
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeMsg, setAssigneeMsg] = useState("");
  const [assigneesByTaskIdState, setAssigneesByTaskIdState] = useState<Record<string, string[]>>(
    assigneesByTaskId
  );
  const [flagsByTask, setFlagsByTask] = useState<Record<string, TaskFlag[]>>({});
  const [flagManager, setFlagManager] = useState<{ open: boolean; taskId: string | null }>({
    open: false,
    taskId: null,
  });
  const [thumbReady, setThumbReady] = useState<Record<string, boolean>>({});
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
  const { retryPendingUploads, resetReauthRequired } = useUploadOutbox();
  const reauthUrl = process.env.NEXT_PUBLIC_GOOGLE_REAUTH_URL ?? "/login";
  const reauthRetryKey = "drive_reauth_retry";

  useEffect(() => {
    setAssigneesByTaskIdState(assigneesByTaskId);
  }, [assigneesByTaskId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(reauthRetryKey);
    if (!raw) return;
    window.sessionStorage.removeItem(reauthRetryKey);
    try {
      const payload = JSON.parse(raw);
      if (payload?.type === "delete" && payload.taskId && payload.fileId) {
        void deleteFile(payload.taskId, payload.fileId, { skipConfirm: true, autoRetry: true });
      }
      if (payload?.type === "uploads") {
        void (async () => {
          await resetReauthRequired();
          await retryPendingUploads();
        })();
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail ?? {};
      const go = window.confirm("需要重新授權，是否前往重新授權？");
      if (!go) return;
      window.sessionStorage.setItem(reauthRetryKey, JSON.stringify({ type: "uploads", detail }));
      window.location.href = reauthUrl;
    };
    window.addEventListener("drive-reauth-required", handler);
    return () => window.removeEventListener("drive-reauth-required", handler);
  }, [reauthUrl]);

  const sendLog = (payload: Record<string, any>) => {
    try {
      const body = JSON.stringify(payload);
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/logs", blob);
        return;
      }
      void safeFetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch {
      // ignore logging failures
    }
  };

  const unitNameById = useMemo(() => {
    if (!units) return {};
    return Object.fromEntries(units.map((unit) => [unit.id, unit.name]));
  }, [units]);

  const memberOptions = useMemo(() => {
    return members
      .map((member) => {
        const unitName = unitNameById[member.unit_id] ?? "未指派部門";
        const jobTitle = member.job_title?.trim() ? member.job_title : "未設定職稱";
        const roleLabel = member.role?.trim() ? member.role : "未設定權限";
        const label = member.display_name
          ? `${unitName}-${member.display_name}-${jobTitle}-${roleLabel}`
          : `${unitName}-${member.user_id.slice(0, 8)}-${jobTitle}-${roleLabel}`;
        return {
          ...member,
          label,
          searchKey: `${unitName} ${member.display_name ?? ""} ${jobTitle} ${roleLabel}`.toLowerCase(),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
  }, [members, unitNameById]);

  const filteredMemberOptions = useMemo(() => {
    const query = assigneeSearch.trim().toLowerCase();
    if (!query) return memberOptions;
    return memberOptions.filter((member) => member.searchKey.includes(query));
  }, [assigneeSearch, memberOptions]);

  const handleExportReport = () => {
    sendLog({
      level: "info",
      message: "export_project_report",
      action: "export",
      resource: "project_report",
      record_id: project.id,
      source: "client",
      meta: { project_name: project.name },
    });
  };

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
      owner_unit_id: task.owner_unit_id ?? null,
      owner_user_id: task.owner_user_id ?? null,
    };
  }

  const [isLogPending, startLogTransition] = useTransition();

  const initialTasks = tasks.length > 0 ? tasks.map((task) => normalizeTask(task)) : [];
  const [localTasks, setLocalTasks] = useState<Task[]>(initialTasks);
  const [filesByTask, setFilesByTask] = useState<Record<string, FileItem[]>>(
    () => groupDriveItems(driveItems)
  );

  type ActivityLog = {
    id: string;
    time: string;
    note: string | null;
    progress: number;
    user_name: string;
  };

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const tasksRef = useRef<Task[]>(localTasks);

  useEffect(() => {
    tasksRef.current = localTasks;
  }, [localTasks]);

  useEffect(() => {
    if (!tasks.length) return;
    setLocalTasks(tasks.map((task) => normalizeTask(task)));
  }, [tasks]);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab]);

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
    setActivityLogs([]);

    startLogTransition(async () => {
      // Defer fetching logs
      const res = await getTaskLogs(selectedTask.id);
      if (res.ok) {
        setActivityLogs(res.logs ?? []);
      }
    });
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

  const boardEntries = useMemo(() => {
    const columns: Array<{ id: TaskStatus; label: string }> = [
      { id: "ready", label: "待辦事項" },
      { id: "in_progress", label: "進行中" },
      { id: "completed", label: "完成" },
      { id: "error", label: "異常" },
    ];
    const buckets: Record<TaskStatus, Task[]> = {
      ready: [],
      in_progress: [],
      completed: [],
      error: [],
    };
    localTasks
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .forEach((task) => {
        const status = getTaskStatus(task);
        buckets[status].push(task);
      });

    return columns
      .filter((column) => column.id !== "error" || buckets.error.length > 0)
      .map((column) => [column, buckets[column.id]] as const);
  }, [localTasks]);

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
    return local.toISOString().slice(0, 10).replaceAll("-", "/");
  }

  function formatDateString(value: string | null | undefined) {
    if (!value) return "-";
    const dateOnly = value.includes("T") ? value.split("T")[0] : value;
    return dateOnly.replaceAll("-", "/");
  }

  function formatStatus(value: string | null | undefined) {
    if (!value) return "進行中";
    const map: Record<string, string> = {
      active: "進行中",
      planning: "規劃中",
      paused: "暫停",
      done: "已完成",
      archived: "已封存",
    };
    return map[value] ?? value;
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
    event: ReactPointerEvent<HTMLElement>
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
      if (!dragState) return;
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
      if (!dragState) return;
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
    setAssigneeUnitId(task.owner_unit_id ?? "");
    const initialAssignees = assigneesByTaskIdState[task.id] ?? [];
    setAssigneeUserIds(
      initialAssignees.length > 0 && initialAssignees.every(Boolean)
        ? initialAssignees
        : task.owner_user_id
          ? [task.owner_user_id]
          : []
    );
    setAssigneeSearch("");
    setAssigneeMsg("");
  }

  function addUploadedFile(taskId: string, item: FileItem) {
    setFilesByTask((prev) => ({
      ...prev,
      [taskId]: [item, ...(prev[taskId] ?? [])],
    }));
    if (item.thumbnailLink) {
      setThumbReady((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  async function saveAssignees() {
    if (!selectedTask) return;
    setAssigneeMsg("");
    const primaryAssigneeId = assigneeUserIds[0] ?? null;
    const res = await updateTaskAssignees({
      task_id: selectedTask.id,
      owner_unit_id: assigneeUnitId || null,
      owner_user_id: primaryAssigneeId,
      assignee_user_ids: assigneeUserIds,
    });

    if (!res?.ok) {
      setAssigneeMsg(`指派更新失敗：${res?.error ?? "unknown"}`);
      return;
    }

    setLocalTasks((prev) =>
      prev.map((task) =>
        task.id === selectedTask.id
          ? {
              ...task,
              owner_unit_id: assigneeUnitId || null,
              owner_user_id: primaryAssigneeId,
            }
          : task
      )
    );
    setAssigneesByTaskIdState((prev) => ({
      ...prev,
      [selectedTask.id]: [...assigneeUserIds],
    }));
    setAssigneeMsg("已更新指派");
  }

  async function deleteFile(
    taskId: string,
    fileId: string,
    options?: { skipConfirm?: boolean; autoRetry?: boolean }
  ) {
    if (isViewer) return;
    if (!options?.skipConfirm) {
      const confirmed = window.confirm("確定要刪除此檔案嗎？");
      if (!confirmed) return;
    }
    try {
      const res = await safeFetch("/api/drive/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: fileId }),
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        const rawText = await res.text();
        let payload: { code?: string; message?: string } | null = null;
        if (rawText) {
          if (contentType.includes("application/json")) {
            try {
              payload = JSON.parse(rawText) as { code?: string; message?: string };
            } catch {
              payload = { message: rawText };
            }
          } else {
            payload = { message: rawText };
          }
        }
        const shouldReauth =
          res.status === 401 || res.status === 403 || payload?.code === "NEED_REAUTH";
        if (shouldReauth) {
          if (options?.autoRetry) {
            alert("需要重新授權");
            return;
          }
          const go = window.confirm("需要重新授權，是否前往重新授權？");
          if (go) {
            window.sessionStorage.setItem(
              reauthRetryKey,
              JSON.stringify({ type: "delete", taskId, fileId })
            );
            window.location.href = reauthUrl;
          }
          return;
        }
        const msg = payload?.message ?? payload?.code ?? `request_failed_status_${res.status}`;
        alert(`刪除失敗：${msg}`);
        return;
      }
      setFilesByTask((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] ?? []).filter((item) => item.id !== fileId),
      }));
      setThumbReady((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    } catch (err: any) {
      alert(`刪除失敗：${err?.message ?? "delete_failed"}`);
    }
  }

  function onCreateTask() {
    setCreateMsg("");
    if (!createName.trim()) {
      setCreateMsg("請輸入任務名稱");
      return;
    }

    startCreate(async () => {
      const res = await createProjectTask({
        project_id: project.id,
        org_id: project.org_id,
        unit_id: project.unit_id,
        phase_name: createPhase.trim() || "新任務",
        name: createName.trim(),
        start_offset_days: createStartIndex,
        duration_days: createDuration,
      });

      if (!res?.ok) {
        setCreateMsg(`新增失敗：${res?.error ?? "unknown"}`);
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
      owner_user_id: null,
      status: "ready",
      parent_id: selectedTask.id,
      level: level + 1,
    };

    setLocalTasks((prev) => [...prev, fallback]);
    setSubtaskName("");
    setSubtaskDuration(Math.max(1, selectedTask.duration_days));
    setSubtaskStartIndex(selectedTask.start_offset_days);
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

  function openFlagMenu(task: Task, event: React.MouseEvent<HTMLDivElement>) {
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
    if (!window.confirm("確定要刪除？")) return;
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
      const res = await updateTaskProgress({
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

      const newLog: ActivityLog = {
        id: `local-log-${Date.now()}`,
        time: new Date().toISOString(),
        note: note.trim() || "進度更新",
        progress: value,
        user_name: "我", // Optimistic update uses a generic name
      };
      setActivityLogs(prev => [newLog, ...prev]);
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
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground">
            狀態 {formatStatus(project.status)} ・開始 {formatDateString(project.start_date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge">{role ?? "member"}</span>
          <Button variant="ghost" type="button" onClick={handleExportReport}>
            匯出報表
          </Button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tab) =>
          tab.href ? (
            <Link key={tab.id} className="tab" href={tab.href}>
              {tab.label}
            </Link>
          ) : (
            <button
              key={tab.id}
              type="button"
              className={`tab ${activeTab === tab.id ? "tab-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          )
        )}
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
          {boardEntries.map(([column, items]) => (
            <div className="board-column" key={column.id}>
              <div className="card-header">
                <div className="card-title">{column.label}</div>
                <span className="badge">{items.length}</span>
              </div>
              {items.map((task) => (
                <div
                  className={`task-card task-card-level-${task.level ?? 0}`}
                  key={task.id}
                  onClick={() => openTask(task)}
                >
                  <div className="task-card-title">
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
              <div className="card-title">時間軸</div>
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => setCreateOpen((v) => !v)}>
                  新增任務
                </Button>
                <Button variant="ghost" type="button" onClick={() => openFlagManager(selectedId)}>
                  旗標管理
                </Button>
                <span className="badge">可拖曳與縮放</span>
              </div>
            </div>

            {createOpen && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 border-t">
                <Input
                  placeholder="任務名稱"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
                <Input
                  placeholder="階段名稱 (Phase)"
                  value={createPhase}
                  onChange={(e) => setCreatePhase(e.target.value)}
                />
                <Select
                  value={String(createStartIndex)}
                  onValueChange={(val) => setCreateStartIndex(Number(val))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="開始日期" />
                  </SelectTrigger>
                  <SelectContent>
                    {dayList.map((day, index) => (
                      <SelectItem key={`create-day-${index}`} value={String(index)}>
                        開始日期 {formatDate(day)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="工期 (天)"
                  value={createDuration}
                  onChange={(e) => setCreateDuration(Number(e.target.value))}
                />
                <Button type="button" onClick={onCreateTask} disabled={isCreating || isViewer}>
                  {isCreating ? "新增中..." : "確認新增"}
                </Button>
                {createMsg && <div className="page-subtitle md:col-span-5">{createMsg}</div>}
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
            <Dialog open={flagMenu !== null} onOpenChange={(open) => !open && closeFlagMenu()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>新增旗標</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="flag-menu-text" className="text-right">
                            內容
                            </label>
                            <Input
                            id="flag-menu-text"
                            placeholder="輸入提醒內容"
                            value={flagMenu.text}
                            onChange={(e) =>
                                setFlagMenu((prev) => (prev ? { ...prev, text: e.target.value } : prev))
                            }
                            className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="flag-menu-level" className="text-right">
                            類型
                            </label>
                            <Select
                                value={flagMenu.level}
                                onValueChange={(value) =>
                                    setFlagMenu((prev) =>
                                    prev ? { ...prev, level: value as FlagLevel } : prev
                                    )
                                }
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="warning">注意 (黃色)</SelectItem>
                                    <SelectItem value="danger">危險 (紅色)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="flag-menu-day" className="text-right">
                            Day
                            </label>
                            <Input
                            id="flag-menu-day"
                            type="number"
                            value={flagMenu.offset_days}
                            onChange={(e) =>
                                setFlagMenu((prev) =>
                                prev ? { ...prev, offset_days: Number(e.target.value) } : prev
                                )
                            }
                            className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="flag-menu-hour" className="text-right">
                            Hour (0-23)
                            </label>
                            <Input
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
                            className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={closeFlagMenu}>
                            取消
                        </Button>
                        <Button type="button" onClick={addFlagFromMenu}>
                            新增
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
          )}
          <Dialog open={flagManager.open} onOpenChange={(open) => !open && closeFlagManager()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>旗標管理</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {!flagManager.taskId && <p className="text-muted-foreground">請先選擇任務。</p>}
                  {flagManager.taskId && (
                    <div className="space-y-4">
                      <p>
                        任務：{localTasks.find((task) => task.id === flagManager.taskId)?.name ?? "未知"}
                      </p>
                      {(flagsByTask[flagManager.taskId] ?? []).length === 0 && (
                        <p className="text-muted-foreground text-sm">尚無旗標。</p>
                      )}
                      <div className="space-y-2">
                        {(flagsByTask[flagManager.taskId] ?? []).map((flag) => {
                          const task = localTasks.find((item) => item.id === flagManager.taskId);
                          if (!task) return null;
                          const flagDate = new Date(startDate);
                          flagDate.setDate(
                            flagDate.getDate() + task.start_offset_days + Math.max(0, flag.offset_days)
                          );
                          flagDate.setHours(Math.min(23, Math.max(0, flag.offset_hours)), 0, 0, 0);
                          return (
                            <div className="flex items-center justify-between rounded-md border p-3" key={`manager-${flag.id}`}>
                              <div>
                                <p className="font-medium">{flag.text}</p>
                                <p className="text-muted-foreground text-sm">
                                  {flag.level === "danger" ? "危險" : "注意"} ・{formatDate(flagDate)} ・
                                  {String(flag.offset_hours).padStart(2, "0")}:00
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => deleteFlag(flagManager.taskId!, flag.id)}
                              >
                                刪除
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-muted-foreground text-sm pt-2 border-t">右鍵點擊任務條可新增旗標。</p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={closeFlagManager}>
                        關閉
                    </Button>
                </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === "files" && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">專案檔案</div>
            <span className="badge">依任務分組</span>
          </div>
          <p className="text-muted-foreground">點任務可快速新增連結。</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {localTasks.map((task) => (
              <div className="rounded-lg border p-4 space-y-3" key={`files-${task.id}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{task.name}</h3>
                  <Button variant="ghost" size="sm" type="button" onClick={() => openTask(task)}>
                    新增
                  </Button>
                </div>
                {(filesByTask[task.id] ?? []).length === 0 && (
                  <p className="text-muted-foreground text-sm">尚無檔案</p>
                )}
                <div className="space-y-2">
                {(filesByTask[task.id] ?? []).map((file) => {
                  const thumbSrc = getThumbnailSrc(file);
                  return (
                    <div className="flex items-center gap-3 rounded-md border p-2" key={file.id}>
                      {thumbSrc ? (
                        <>
                          <img
                            className="w-10 h-10 rounded object-cover"
                            src={thumbSrc}
                            alt={file.name}
                            loading="lazy"
                            style={{ display: thumbReady[file.id] ? "block" : "none" }}
                            onLoad={() => setThumbReady((prev) => ({ ...prev, [file.id]: true }))}
                            onError={() => setThumbReady((prev) => ({ ...prev, [file.id]: false }))}
                          />
                          {!thumbReady[file.id] && (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">檔案</div>
                          )}
                        </>
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">檔案</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <div className="flex items-center gap-2">
                          <Button asChild variant="link" size="sm" className="p-0 h-auto">
                            <a href={file.url} target="_blank" rel="noreferrer">
                              開啟檔案
                            </a>
                          </Button>
                          {!isViewer && (
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto text-destructive"
                              type="button"
                              onClick={() => deleteFile(task.id, file.id)}
                            >
                              刪除
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
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

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-w-[min(960px,95vw)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>任務詳情</DialogTitle>
          </DialogHeader>
          {!selectedTask && <div className="p-6 text-muted-foreground">尚未選擇任務</div>}
          {selectedTask && (
            <div className="space-y-6">
              <div className="px-6 space-y-1.5">
                <h2 className="text-xl font-semibold">
                  {selectedTask.code ? `[${selectedTask.code}] ` : ""}
                  {selectedTask.name}
                </h2>
                <p className="text-muted-foreground">階段 {selectedTask.phase_name}</p>
                <p className="text-muted-foreground">
                  開始 {formatDate(getTaskStartDate(selectedTask))} ・結束{" "}
                  {formatDate(getTaskEndDate(selectedTask))} ・工期 {selectedTask.duration_days} 天
                </p>
              </div>

              <div className="px-6 space-y-4">
                <h3 className="font-semibold">指派負責人</h3>
                <p className="text-muted-foreground text-sm">
                  選擇部門代表該部門所有人皆為負責人，也可額外指定個人。
                </p>
                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="task-owner-unit">
                      負責單位
                    </label>
                    <Select
                      value={assigneeUnitId || "all"}
                      onValueChange={(value) => setAssigneeUnitId(value === "all" ? "" : value)}
                      disabled={isViewer}
                    >
                      <SelectTrigger id="task-owner-unit">
                        <SelectValue placeholder="未指定" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">未指定</SelectItem>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="task-owner-user-search">
                      負責個人（可複選）
                    </label>
                    <Input
                      id="task-owner-user-search"
                      placeholder="搜尋部門 / 名字 / 職稱 / 權限"
                      value={assigneeSearch}
                      onChange={(e) => setAssigneeSearch(e.target.value)}
                      disabled={isViewer}
                    />
                </div>
                <p className="text-sm text-muted-foreground">已選擇 {assigneeUserIds.length} 位</p>
                <div
                  className="border rounded-md p-2"
                  style={{ maxHeight: 220, overflowY: "auto" }}
                >
                  {filteredMemberOptions.length === 0 && (
                    <p className="text-muted-foreground text-center text-sm p-4">找不到符合條件的成員</p>
                  )}
                  {filteredMemberOptions.map((member) => {
                    const checked = assigneeUserIds.includes(member.user_id);
                    return (
                      <label
                        key={`${member.user_id}-${member.unit_id}`}
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAssigneeUserIds((prev) => {
                              if (prev.includes(member.user_id)) {
                                return prev.filter((id) => id !== member.user_id);
                              }
                              return [...prev, member.user_id];
                            });
                          }}
                          disabled={isViewer}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm">{member.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={saveAssignees}
                    disabled={isViewer}
                  >
                    儲存指派
                  </Button>
                </div>
                {assigneeMsg && <p className="text-sm text-muted-foreground">{assigneeMsg}</p>}
              </div>

              <div className="px-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">進度回報</h3>
                  <span className="badge">{progress}%</span>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="task-status">
                      任務狀態
                    </label>
                    <Select
                      value={getTaskStatus(selectedTask)}
                      onValueChange={(val) => onStatusChange(val as TaskStatus)}
                      disabled={isViewer}
                    >
                      <SelectTrigger id="task-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ready">待處理</SelectItem>
                        <SelectItem value="in_progress">進行中</SelectItem>
                        <SelectItem value="completed">已完成</SelectItem>
                        <SelectItem value="error">異常</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="task-progress">
                      完成百分比 (0-100)
                    </label>
                    <Slider
                      id="task-progress"
                      min={0}
                      max={100}
                      value={[progress]}
                      onValueChange={(value) => setProgress(value[0])}
                      disabled={isViewer}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="task-note">
                      回報說明
                    </label>
                    <Textarea
                      id="task-note"
                      placeholder="進度備註"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      disabled={isViewer}
                    />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setPanelOpen(false)}>
                    關閉
                  </Button>
                  <Button type="button" onClick={saveProgress} disabled={isPending || isViewer}>
                    {isPending ? "儲存中..." : "儲存"}
                  </Button>
                </div>
                {message && <p className="text-sm text-muted-foreground">{message}</p>}
              </div>

              <div className="px-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">子任務</h3>
                  <span className="badge">最多兩層</span>
                </div>
                <p className="text-muted-foreground text-sm">點子任務可再次編輯。</p>
                {(localTasks.filter((task) => task.parent_id === selectedTask.id) ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">尚無子任務</p>
                )}
                {(localTasks.filter((task) => task.parent_id === selectedTask.id) ?? []).map((task) => (
                  <div className="border rounded-lg p-3 flex justify-between items-center" key={`sub-${task.id}`} onClick={() => openTask(task)}>
                    <div>
                      <p className="font-medium">{task.name}</p>
                      <p className="text-sm text-muted-foreground">工期 {task.duration_days} 天</p>
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="subtask-name">
                      子任務名稱
                    </label>
                    <Input
                      id="subtask-name"
                      placeholder="子任務名稱"
                      value={subtaskName}
                      onChange={(e) => setSubtaskName(e.target.value)}
                      disabled={isViewer}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="subtask-duration">
                      工期 (天)
                    </label>
                    <Input
                      id="subtask-duration"
                      type="number"
                      placeholder="工期 (天)"
                      value={subtaskDuration}
                      onChange={(e) => setSubtaskDuration(Number(e.target.value))}
                      disabled={isViewer}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="subtask-start-date">
                      開始日期
                    </label>
                    <Select
                      value={String(subtaskStartIndex)}
                      onValueChange={(val) => setSubtaskStartIndex(Number(val))}
                      disabled={isViewer}
                    >
                      <SelectTrigger id="subtask-start-date">
                        <SelectValue placeholder="開始日期" />
                      </SelectTrigger>
                      <SelectContent>
                        {dayList.map((day, index) => (
                          <SelectItem key={`subtask-day-${index}`} value={String(index)}>
                            開始日期 {formatDate(day)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Button type="button" onClick={onCreateSubtask} disabled={isViewer} className="w-full">
                      新增子任務
                    </Button>
                  </div>
                  {subtaskMsg && <p className="text-sm text-muted-foreground md:col-span-2">{subtaskMsg}</p>}
                </div>
              </div>

              <div className="px-6 space-y-4">
                <h3 className="font-semibold">文件連結</h3>
                <FileUploadForm
                  taskId={selectedTask.id}
                  onUploaded={(item) => addUploadedFile(selectedTask.id, item)}
                  disabled={isViewer}
                />
                <p className="text-sm text-muted-foreground">目前連結數量 {filesByTask[selectedTask.id]?.length ?? 0}</p>
                <div className="space-y-2">
                  {(filesByTask[selectedTask.id] ?? []).map((file) => {
                    const thumbSrc = getThumbnailSrc(file);
                    return (
                      <div className="flex items-center gap-3 rounded-md border p-2" key={file.id}>
                        {thumbSrc ? (
                          <>
                            <img
                              className="w-10 h-10 rounded object-cover"
                              src={thumbSrc}
                              alt={file.name}
                              loading="lazy"
                              style={{ display: thumbReady[file.id] ? "block" : "none" }}
                              onLoad={() => setThumbReady((prev) => ({ ...prev, [file.id]: true }))}
                              onError={() => setThumbReady((prev) => ({ ...prev, [file.id]: false }))}
                            />
                            {!thumbReady[file.id] && (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">檔案</div>
                            )}
                          </>
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">檔案</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <div className="flex items-center gap-2">
                            <Button asChild variant="link" size="sm" className="p-0 h-auto">
                              <a href={file.url} target="_blank" rel="noreferrer">
                                開啟檔案
                              </a>
                            </Button>
                            {!isViewer && (
                              <Button
                                variant="link"
                                size="sm"
                                className="p-0 h-auto text-destructive"
                                type="button"
                                onClick={() => deleteFile(selectedTask.id, file.id)}
                              >
                                刪除
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-6 space-y-4">
                <h3 className="font-semibold">活動紀錄</h3>
                {isLogPending && <p className="text-sm text-muted-foreground">讀取紀錄中...</p>}
                {!isLogPending && activityLogs.length === 0 && (
                  <p className="text-sm text-muted-foreground">尚無更新紀錄</p>
                )}
                <div className="space-y-3">
                {activityLogs.map((log) => (
                  <div className="text-sm" key={log.id}>
                    <p>{log.note || "進度更新"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateString(log.time)} ・ {log.user_name} ・ {log.progress}%
                    </p>
                  </div>
                ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* This is the FileUploadForm component which also needs refactoring */}
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
  const driveFolderName = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_NAME ?? "Google 雲端硬碟";
  const { addToOutbox } = useUploadOutbox();
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
      const device_id = getDeviceId();
      const idempotency_key = window.crypto.randomUUID();
      await addToOutbox({
        taskId,
        displayName,
        file,
        device_id,
        idempotency_key,
      });

      setDisplayName("");
      setFile(null);
      setMessage("已加入上傳佇列");
    } catch (err: any) {
      setMessage(err?.message ?? "upload_failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="file-display-name" className="text-sm font-medium">檔案名稱（選填）</label>
        <Input
          id="file-display-name"
          placeholder="檔案名稱（選填）"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={disabled || isUploading}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="file-upload" className="text-sm font-medium">選擇檔案</label>
        <Input
          id="file-upload"
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={disabled || isUploading}
        />
      </div>
      <Button type="button" onClick={handleUpload} disabled={disabled || isUploading} className="w-full">
        {isUploading ? "上傳中..." : "上傳到 Google 雲端硬碟"}
      </Button>
      <p className="text-xs text-muted-foreground">圖片超過 2MB 會壓縮，其他檔案上限 10MB。</p>
      {driveFolderUrl && (
        <p className="text-sm text-muted-foreground">
          上傳到：
          <a href={driveFolderUrl} target="_blank" rel="noreferrer" className="underline">
            {driveFolderName}
          </a>
        </p>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
