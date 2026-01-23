"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";

async function getOrgRole(supabase: any, orgId: string | null, userId: string) {
  if (!orgId) return null;
  const { data: mems, error } = await supabase
    .from("memberships")
    .select("role, created_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !mems || mems.length === 0) return null;
  const roleRank: Record<string, number> = { viewer: 0, member: 1, manager: 2, admin: 3 };
  let best = mems[0]?.role ?? null;
  for (const m of mems) {
    if (roleRank[m.role] > roleRank[best ?? "viewer"]) {
      best = m.role;
    }
  }
  return best;
}

async function assertCanEditTask(
  supabase: any,
  task_id: string,
  me_user_id: string,
  org_role: string | null
) {
  if (org_role === "manager" || org_role === "admin") {
    return { ok: true as const };
  }

  const { data: taskRow } = await supabase
    .from("project_tasks")
    .select("id, owner_user_id")
    .eq("id", task_id)
    .maybeSingle();
  if (taskRow?.owner_user_id === me_user_id) {
    return { ok: true as const };
  }

  const { data: a } = await supabase
    .from("project_task_assignees")
    .select("task_id")
    .eq("task_id", task_id)
    .eq("user_id", me_user_id)
    .limit(1);
  if (a && a.length > 0) {
    return { ok: true as const };
  }

  return { ok: false as const, code: "not_task_editor" };
}

export async function updateTaskProgress(opts: {
  task_id: string; // project_tasks.id
  progress: number;
  note?: string;
}) {
  const supabase = await createServerSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { ok: false as const, error: "no_session" };
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(accessToken);
  let adminClient: any = null;
  try {
    adminClient = createAdminSupabase();
  } catch {
    adminClient = null;
  }
  if (isPlatformAdmin && !adminClient) {
    return { ok: false as const, error: "missing_service_role_key" };
  }
  // 0) DB 端看到的身份（auth.uid/auth.role）
  const { data: authDbg } = await supabase.rpc("debug_auth");

  // 1) App 端看到的登入者（supabase-js auth）
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures.user) {
    return {
      ok: false as const,
      error: "not_authenticated",
      debug: { authDbg },
    };
  }
  const user_id = ures.user.id;

  // 2) 查 task（拿 project_id）
  const { data: task, error: terr } = await supabase
    .from("project_tasks")
    .select("id, project_id, progress, org_id, unit_id")
    .eq("id", opts.task_id)
    .maybeSingle();

  if (terr || !task) {
    return {
      ok: false as const,
      error: terr?.message ?? "task_not_found",
      debug: { authDbg, user_id, task_id: opts.task_id },
    };
  }

  if (!task.org_id || !task.unit_id) {
    return {
      ok: false as const,
      error: "task_missing_org_unit",
      debug: { authDbg, user_id, task_id: opts.task_id },
    };
  }

  const orgRole = isPlatformAdmin ? "admin" : await getOrgRole(supabase, task.org_id, user_id);
  const editCheck = await assertCanEditTask(supabase, task.id, user_id, orgRole);
  if (!editCheck.ok) {
    return {
      ok: false as const,
      error: "permission_denied",
      code: "not_task_editor",
      debug: { authDbg, user_id, org_id: task.org_id, unit_id: task.unit_id },
    };
  }

  if (!isPlatformAdmin) {
    if (adminClient) {
      const allowed = await checkPermission(adminClient, user_id, task.org_id, "tasks", "update");
      if (!allowed) {
        return {
          ok: false as const,
          error: "permission_denied",
          debug: { authDbg, user_id, org_id: task.org_id, unit_id: task.unit_id },
        };
      }
    } else {
      const { data: mems, error: merr } = await supabase
        .from("memberships")
        .select("org_id, unit_id, role, created_at")
        .eq("org_id", task.org_id)
        .eq("unit_id", task.unit_id)
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (merr) {
        return {
          ok: false as const,
          error: `membership_lookup_failed: ${merr.message}`,
          debug: { authDbg, user_id, org_id: task.org_id, unit_id: task.unit_id },
        };
      }

      const mem = mems?.[0];
      if (!mem) {
        return {
          ok: false as const,
          error: "not_authorized",
          debug: { authDbg, user_id, org_id: task.org_id, unit_id: task.unit_id },
        };
      }

      if (mem.role === "viewer") {
        return {
          ok: false as const,
          error: "viewer_readonly",
          debug: { authDbg, user_id, org_id: task.org_id, unit_id: task.unit_id },
        };
      }
    }
  }

  // 3) progress 正規化
  const p = Math.max(0, Math.min(100, Number(opts.progress)));

  // 4) 更新 progress（用 select 確認真的更新到）
  const { data: updatedRows, error: uperr } = await supabase
    .from("project_tasks")
    .update({ progress: p })
    .eq("id", task.id)
    .select("id, progress");

  if (uperr) {
    return {
      ok: false as const,
      error: "update_failed",
      message: uperr.message,
      code: (uperr as any).code ?? null,
      debug: { authDbg, user_id, task_id: task.id },
    };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      ok: false as const,
      error: "RLS blocked: 0 rows updated (no permission/policy or missing SELECT policy)",
      debug: { authDbg, user_id, task_id: task.id },
    };
  }

  // 5) 寫 progress_logs（✅ 不回傳，避免觸發 SELECT policy）
  const payload = {
    project_task_id: task.id,
    org_id: task.org_id,
    unit_id: task.unit_id,
    user_id,
    progress: p,
    note: opts.note?.trim() ? opts.note.trim() : null,
  };

  const { error: lerr } = await supabase.from("progress_logs").insert(payload);

  if (lerr) {
    return {
      ok: true as const,
      warn: `progress updated, but log failed: ${lerr.message}`,
      debug: { authDbg, payload },
    };
  }

  return { ok: true as const, debug: { authDbg, payload } };
}

export async function updateTaskSchedule(opts: {
  task_id: string;
  start_offset_days: number;
  duration_days: number;
}) {
  const supabase = await createServerSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let adminClient: any = null;
  try {
    adminClient = createAdminSupabase();
  } catch {
    adminClient = null;
  }
  if (isPlatformAdmin && !adminClient) {
    return { ok: false as const, error: "missing_service_role_key" };
  }
  const dataClient = adminClient ?? supabase;

  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures.user) {
    return { ok: false as const, error: "not_authenticated" };
  }
  const user_id = ures.user.id;

  const { data: task, error: terr } = await dataClient
    .from("project_tasks")
    .select("id, org_id, unit_id")
    .eq("id", opts.task_id)
    .maybeSingle();

  if (terr || !task) {
    return { ok: false as const, error: terr?.message ?? "task_not_found" };
  }

  const orgRole = isPlatformAdmin ? "admin" : await getOrgRole(supabase, task.org_id ?? null, user_id);
  const editCheck = await assertCanEditTask(supabase, opts.task_id, user_id, orgRole);
  if (!editCheck.ok) {
    return { ok: false as const, error: "permission_denied", code: "not_task_editor" };
  }

  if (!isPlatformAdmin) {
    const { data: hasPerm, error: permErr } = await supabase.rpc<boolean>("has_project_perm", {
      p_project_id: task.project_id,
      p_perm: "project.update",
    });
    if (permErr) {
      return { ok: false as const, error: "project_perm_check_failed" };
    }
    if (!hasPerm) {
      return { ok: false as const, error: "permission_denied" };
    }
  }

  const start_offset_days = Math.max(0, Math.floor(opts.start_offset_days));
  const duration_days = Math.max(1, Math.floor(opts.duration_days));

  const { error: uperr } = await dataClient
    .from("project_tasks")
    .update({ start_offset_days, duration_days })
    .eq("id", task.id);

  if (uperr) {
    return { ok: false as const, error: uperr.message };
  }

  return { ok: true as const };
}

export async function updateTaskAssignees(opts: {
  task_id: string;
  owner_unit_id?: string | null;
  owner_user_id?: string | null;
  assignee_user_ids?: string[] | null;
}) {
  const supabase = await createServerSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  if (!sessionData.session?.access_token) {
    throw new Error("service_role_forbidden_for_task_assignment");
  }

  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures.user) {
    return { ok: false as const, error: "not_authenticated", code: uerr?.code ?? null, message: uerr?.message ?? null };
  }
  const user_id = ures.user.id;

  const { data: task, error: terr } = await supabase
    .from("project_tasks")
    .select("id, project_id, org_id, unit_id")
    .eq("id", opts.task_id)
    .maybeSingle();

  if (terr || !task) {
    return { ok: false as const, error: terr?.message ?? "task_not_found", code: terr?.code ?? null, message: terr?.message ?? null };
  }

  if (!task.org_id || !task.unit_id) {
    return { ok: false as const, error: "task_missing_org_unit" };
  }

  const orgRole = isPlatformAdmin ? "admin" : await getOrgRole(supabase, task.org_id, user_id);
  const editCheck = await assertCanEditTask(supabase, task.id, user_id, orgRole);
  if (!editCheck.ok) {
    return { ok: false as const, error: "permission_denied", code: "not_task_editor" };
  }

  if (!isPlatformAdmin) {
    const requiredPerm = "timeline.edit.owner";
    const { data: hasPerm, error: permErr } = await supabase.rpc<boolean>("has_project_perm", {
      p_project_id: task.project_id,
      p_perm: requiredPerm,
    });
    if (permErr || !hasPerm) {
      return {
        ok: false as const,
        error: "project_perm_check_failed",
        userId: user_id,
        projectId: task.project_id,
        requiredPerm,
        checkResult: hasPerm ?? false,
        code: permErr?.code ?? null,
        message: permErr?.message ?? null,
      };
    }
  }

  const owner_unit_id = opts.owner_unit_id ?? null;
  const owner_user_id = opts.owner_user_id ?? null;
  const rawAssignees = Array.isArray(opts.assignee_user_ids)
    ? opts.assignee_user_ids
    : owner_user_id
      ? [owner_user_id]
      : [];
  const assigneeUserIds = Array.from(
    new Set(
      rawAssignees
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  const { error: uperr } = await supabase
    .from("project_tasks")
    .update({ owner_unit_id, owner_user_id })
    .eq("id", task.id);

  if (uperr) {
    return { ok: false as const, error: "project_tasks_update_failed", code: uperr.code ?? null, message: uperr.message ?? null };
  }

  const { error: clearErr } = await supabase
    .from("project_task_assignees")
    .delete()
    .eq("task_id", task.id);

  if (clearErr) {
    return { ok: false as const, error: "project_task_assignees_clear_failed", code: clearErr.code ?? null, message: clearErr.message ?? null };
  }

  if (assigneeUserIds.length > 0) {
    const rows = assigneeUserIds.map((assigneeId) => ({
      task_id: task.id,
      org_id: task.org_id,
      unit_id: task.unit_id,
      user_id: assigneeId,
    }));
    const { error: insertErr } = await supabase.from("project_task_assignees").insert(rows);
    if (insertErr) {
      return { ok: false as const, error: "project_task_assignees_insert_failed", code: insertErr.code ?? null, message: insertErr.message ?? null };
    }
  }

  return { ok: true as const };
}

export async function createProjectTask(opts: {
  project_id: string;
  org_id: string;
  unit_id: string;
  phase_name: string;
  name: string;
  start_offset_days?: number;
  duration_days?: number;
  owner_unit_id?: string | null;
  owner_user_id?: string | null;
}) {
  const supabase = await createServerSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let adminClient: any = null;
  try {
    adminClient = createAdminSupabase();
  } catch {
    adminClient = null;
  }
  if (isPlatformAdmin && !adminClient) {
    return { ok: false as const, error: "missing_service_role_key" };
  }
  const dataClient = adminClient ?? supabase;

  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures.user) {
    return { ok: false as const, error: "not_authenticated" };
  }
  const user_id = ures.user.id;

  if (!opts.org_id || !opts.unit_id) {
    return { ok: false as const, error: "missing_org_or_unit" };
  }

  if (!isPlatformAdmin) {
    if (adminClient) {
      const allowed = await checkPermission(adminClient, user_id, opts.org_id, "tasks", "create");
      if (!allowed) {
        return { ok: false as const, error: "permission_denied" };
      }
    } else {
      const { data: mems, error: merr } = await supabase
        .from("memberships")
        .select("role, created_at")
        .eq("org_id", opts.org_id)
        .eq("unit_id", opts.unit_id)
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (merr || !mems?.[0]) {
        return { ok: false as const, error: merr?.message ?? "not_authorized" };
      }

      if (mems[0].role === "viewer") {
        return { ok: false as const, error: "viewer_readonly" };
      }
    }
  }

  const { data: maxSeq } = await dataClient
    .from("project_tasks")
    .select("seq")
    .eq("project_id", opts.project_id)
    .order("seq", { ascending: false })
    .limit(1);

  const seq = (maxSeq?.[0]?.seq ?? 0) + 1;
  const start_offset_days = Math.max(0, Math.floor(opts.start_offset_days ?? 0));
  const duration_days = Math.max(1, Math.floor(opts.duration_days ?? 1));

  const { data: inserted, error: ierr } = await dataClient
    .from("project_tasks")
    .insert({
      project_id: opts.project_id,
      org_id: opts.org_id,
      unit_id: opts.unit_id,
      phase_name: opts.phase_name,
      name: opts.name,
      seq,
      start_offset_days,
      duration_days,
      owner_unit_id: opts.owner_unit_id ?? null,
      owner_user_id: opts.owner_user_id ?? null,
      progress: 0,
    })
    .select(
      "id, seq, phase_name, code, name, progress, start_offset_days, duration_days, owner_unit_id, owner_user_id"
    )
    .maybeSingle();

  if (ierr || !inserted) {
    return { ok: false as const, error: ierr?.message ?? "insert_failed" };
  }

  return { ok: true as const, task: inserted };
}

export async function getTaskLogs(taskId: string) {
  const supabase = await createServerSupabase();
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures.user) {
    return { ok: false, error: "not_authenticated" };
  }

  // NOTE: Use admin client to bypass RLS for reading logs across users within the project.
  // This assumes that anyone who can view the task can view its history.
  // Permissions are checked at the component level before calling this action.
  const adminClient = createAdminSupabase();

  const { data, error } = await adminClient
    .from("progress_logs")
    .select(
      `
      id,
      created_at,
      progress,
      note,
      user:profiles(display_name)
    `
    )
    .eq("project_task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, error: error.message };
  }

  const logs = data.map((log: {
    id: string;
    created_at: string;
    progress: number;
    note: string | null;
    user: { display_name: string }[] | null;
  }) => ({
    id: log.id,
    time: log.created_at,
    note: log.note,
    progress: log.progress,
    user_name: log.user?.[0]?.display_name ?? "系統",
  }));

  return { ok: true, logs };
}
