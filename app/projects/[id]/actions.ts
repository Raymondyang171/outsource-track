"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";

export async function updateTaskProgress(opts: {
  task_id: string; // project_tasks.id
  progress: number;
  note?: string;
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
  const { data: task, error: terr } = await dataClient
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
  const { data: updatedRows, error: uperr } = await dataClient
    .from("project_tasks")
    .update({ progress: p })
    .eq("id", task.id)
    .select("id, progress");

  if (uperr) {
    return { ok: false as const, error: uperr.message, debug: { authDbg, user_id, task_id: task.id } };
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

  const { error: lerr } = await dataClient.from("progress_logs").insert(payload);

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

  if (!isPlatformAdmin) {
    if (adminClient) {
      const allowed = await checkPermission(adminClient, user_id, task.org_id, "tasks", "update");
      if (!allowed) {
        return { ok: false as const, error: "permission_denied" };
      }
    } else {
      const { data: mems, error: merr } = await supabase
        .from("memberships")
        .select("role, created_at")
        .eq("org_id", task.org_id)
        .eq("unit_id", task.unit_id)
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

  if (!isPlatformAdmin) {
    if (adminClient) {
      const allowed = await checkPermission(adminClient, user_id, task.org_id, "tasks", "update");
      if (!allowed) {
        return { ok: false as const, error: "permission_denied" };
      }
    } else {
      const { data: mems, error: merr } = await supabase
        .from("memberships")
        .select("role, created_at")
        .eq("org_id", task.org_id)
        .eq("unit_id", task.unit_id)
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

  const owner_unit_id = opts.owner_unit_id ?? null;
  const owner_user_id = opts.owner_user_id ?? null;

  const { error: uperr } = await dataClient
    .from("project_tasks")
    .update({ owner_unit_id, owner_user_id })
    .eq("id", task.id);

  if (uperr) {
    return { ok: false as const, error: uperr.message };
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
