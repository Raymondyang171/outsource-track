"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateProjectAndVisibility } from "./actions";

type ProjectRow = {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  created_at: string | null;
  org_id: string;
  unit_id: string | null;
};

type UnitRow = {
  id: string;
  name: string;
  org_id: string;
};

type MemberRow = {
  user_id: string;
  org_id: string;
  unit_id: string | null;
  role: string | null;
  display_name: string | null;
};

type GrantRow = {
  project_id: string;
  unit_id: string | null;
  user_id: string | null;
};

type Props = {
  projects: ProjectRow[];
  units: UnitRow[];
  members: MemberRow[];
  grants: GrantRow[];
  canManageVisibilityByOrg: Record<string, boolean>;
};

function formatDateSlash(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnly = value.includes("T") ? value.split("T")[0] : value;
  return dateOnly.replaceAll("-", "/");
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value;
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

function buildErrorMessage(code: string) {
  const map: Record<string, string> = {
    not_authenticated: "請先登入再操作。",
    missing_project_id: "缺少專案 ID。",
    missing_name: "專案名稱必填。",
    permission_denied: "權限不足，無法修改專案。",
    project_update_blocked: "更新失敗（可能權限不足或資料被鎖定）。",
    grants_permission_denied: "無權調整可見性。",
    missing_service_role_key: "缺少服務金鑰，無法進行平台管理操作。",
  };
  return map[code] ?? code;
}

export default function ProjectListClient(props: Props) {
  const router = useRouter();
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    start_date: "",
    status: "active",
    unit_id: "",
    visible_unit_ids: [] as string[],
    visible_user_ids: [] as string[],
    content: "",
  });
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const unitsByOrg = useMemo(() => {
    const map: Record<string, UnitRow[]> = {};
    for (const unit of props.units) {
      if (!map[unit.org_id]) map[unit.org_id] = [];
      map[unit.org_id].push(unit);
    }
    for (const orgId of Object.keys(map)) {
      map[orgId].sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [props.units]);

  const membersByOrg = useMemo(() => {
    const map: Record<string, MemberRow[]> = {};
    for (const member of props.members) {
      if (!map[member.org_id]) map[member.org_id] = [];
      map[member.org_id].push(member);
    }
    for (const orgId of Object.keys(map)) {
      map[orgId].sort((a, b) => {
        const aName = (a.display_name ?? "").trim();
        const bName = (b.display_name ?? "").trim();
        return aName.localeCompare(bName);
      });
    }
    return map;
  }, [props.members]);

  const grantsByProject = useMemo(() => {
    const map: Record<string, { unitIds: string[]; userIds: string[] }> = {};
    for (const grant of props.grants) {
      if (!map[grant.project_id]) {
        map[grant.project_id] = { unitIds: [], userIds: [] };
      }
      if (grant.unit_id) map[grant.project_id].unitIds.push(grant.unit_id);
      if (grant.user_id) map[grant.project_id].userIds.push(grant.user_id);
    }
    for (const projectId of Object.keys(map)) {
      map[projectId].unitIds = Array.from(new Set(map[projectId].unitIds));
      map[projectId].userIds = Array.from(new Set(map[projectId].userIds));
    }
    return map;
  }, [props.grants]);

  const activeProject = openProjectId
    ? props.projects.find((project) => project.id === openProjectId) ?? null
    : null;

  useEffect(() => {
    if (!activeProject) return;
    const grants = grantsByProject[activeProject.id] ?? { unitIds: [], userIds: [] };
    setForm({
      name: activeProject.name ?? "",
      start_date: formatDateInput(activeProject.start_date),
      status: activeProject.status ?? "active",
      unit_id: activeProject.unit_id ?? "",
      visible_unit_ids: grants.unitIds,
      visible_user_ids: grants.userIds,
      content: "",
    });
    setError("");
  }, [activeProject, grantsByProject]);

  const canManageVisibility = activeProject
    ? !!props.canManageVisibilityByOrg[activeProject.org_id]
    : false;

  const unitOptions = activeProject ? unitsByOrg[activeProject.org_id] ?? [] : [];
  const memberOptions = activeProject ? membersByOrg[activeProject.org_id] ?? [] : [];

  function toggleSelection(
    key: "visible_unit_ids" | "visible_user_ids",
    id: string,
    checked: boolean
  ) {
    setForm((prev) => {
      const set = new Set(prev[key]);
      if (checked) {
        set.add(id);
      } else {
        set.delete(id);
      }
      return { ...prev, [key]: Array.from(set) };
    });
  }

  function handleSubmit() {
    if (!activeProject) return;
    setError("");
    startTransition(async () => {
      const result = await updateProjectAndVisibility({
        project_id: activeProject.id,
        name: form.name,
        start_date: form.start_date || null,
        status: form.status || null,
        unit_id: form.unit_id || null,
        visible_unit_ids: form.visible_unit_ids,
        visible_user_ids: form.visible_user_ids,
        replace_visibility: canManageVisibility,
        content: form.content,
      });

      if (!result.ok) {
        setError(buildErrorMessage(result.error));
        return;
      }

      setOpenProjectId(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="project-grid">
        {props.projects.map((project) => (
          <div className="project-card" key={project.id}>
            <div>
              <h3>{project.name}</h3>
              <div className="page-subtitle">
                開始日 {formatDateSlash(project.start_date)} ・狀態 {formatStatus(project.status)}
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: "30%" }} />
            </div>
            <div className="topbar-right">
              <button className="btn btn-soft" type="button" onClick={() => setOpenProjectId(project.id)}>
                專案修改
              </button>
              <a className="btn btn-soft" href={`/projects/${project.id}`}>
                進入工作台
              </a>
              <span className="badge">{project.id.slice(0, 6)}</span>
            </div>
          </div>
        ))}
      </div>

      {activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-3xl space-y-4">
            <div className="card-header">
              <div className="card-title">專案修改</div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setOpenProjectId(null)}
                disabled={isPending}
              >
                關閉
              </button>
            </div>

            {error && <div className="admin-error">{error}</div>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">專案名稱 *</div>
                <input
                  className="input"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">開始日</div>
                <input
                  type="date"
                  className="input"
                  lang="zh-TW"
                  value={form.start_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">狀態</div>
                <select
                  className="input"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="active">進行中</option>
                  <option value="paused">暫停</option>
                  <option value="archived">停止</option>
                  <option value="done">完成</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Owner Unit</div>
                <select
                  className="input"
                  value={form.unit_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, unit_id: event.target.value }))}
                >
                  <option value="">未指定</option>
                  {unitOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">修改內容</div>
              <textarea
                className="textarea"
                rows={3}
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              />
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold">可見性設定</div>
              {!canManageVisibility && (
                <div className="text-sm text-muted-foreground">無權調整可見性。</div>
              )}

              {canManageVisibility && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">授權可見部門</div>
                    {unitOptions.length === 0 && (
                      <div className="text-xs text-muted-foreground">沒有可選的部門。</div>
                    )}
                    {unitOptions.map((unit) => (
                      <label key={unit.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.visible_unit_ids.includes(unit.id)}
                          onChange={(event) =>
                            toggleSelection("visible_unit_ids", unit.id, event.target.checked)
                          }
                        />
                        <span>{unit.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">授權可見人員</div>
                    {memberOptions.length === 0 && (
                      <div className="text-xs text-muted-foreground">沒有可選的人員。</div>
                    )}
                    {memberOptions.map((member) => (
                      <label key={member.user_id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.visible_user_ids.includes(member.user_id)}
                          onChange={(event) =>
                            toggleSelection("visible_user_ids", member.user_id, event.target.checked)
                          }
                        />
                        <span>{(member.display_name ?? "").trim() || "未命名使用者"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setOpenProjectId(null)}
                disabled={isPending}
              >
                取消
              </button>
              <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={isPending}>
                {isPending ? "儲存中..." : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
