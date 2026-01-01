"use server";

import { createServerSupabase } from "@/lib/supabase/server";

export async function updateTaskProgress(opts: {
  task_id: string; // project_tasks.id
  progress: number;
  note?: string;
}) {
  const supabase = await createServerSupabase();

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
    .select("id, project_id, progress")
    .eq("id", opts.task_id)
    .maybeSingle();

  if (terr || !task) {
    return {
      ok: false as const,
      error: terr?.message ?? "task_not_found",
      debug: { authDbg, user_id, task_id: opts.task_id },
    };
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
    return { ok: false as const, error: uperr.message, debug: { authDbg, user_id, task_id: task.id } };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      ok: false as const,
      error: "RLS blocked: 0 rows updated (no permission/policy or missing SELECT policy)",
      debug: { authDbg, user_id, task_id: task.id },
    };
  }

  // 5) 查 project -> org_id
  const { data: proj, error: perr } = await supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", task.project_id)
    .maybeSingle();

  if (perr || !proj) {
    return {
      ok: true as const,
      warn: `progress updated, but cannot load project/org: ${perr?.message ?? "project_not_found"}`,
      debug: { authDbg, user_id, task_id: task.id, project_id: task.project_id },
    };
  }

  // 6) 查 membership（拿 unit_id）
  const { data: mems, error: merr } = await supabase
    .from("memberships")
    .select("org_id, unit_id, role, created_at")
    .eq("org_id", proj.org_id)
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (merr) {
    return {
      ok: true as const,
      warn: `progress updated, but cannot load membership: ${merr.message}`,
      debug: { authDbg, user_id, org_id: proj.org_id },
    };
  }

  const mem = mems?.[0];
  if (!mem) {
    return {
      ok: true as const,
      warn: "progress updated, but membership missing (log denied)",
      debug: { authDbg, user_id, org_id: proj.org_id },
    };
  }

  // 7) 寫 progress_logs（✅ 不回傳，避免觸發 SELECT policy）
  const payload = {
    project_task_id: task.id,
    org_id: mem.org_id,
    unit_id: mem.unit_id,
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
