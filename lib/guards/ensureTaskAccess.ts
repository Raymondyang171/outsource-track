import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrgAdminOrUnitMember, isServerSuperAdmin } from "@/lib/permissions";

type TaskAccessResult =
  | {
      ok: true;
      task: { id: string; org_id: string; unit_id: string };
      isSuperAdmin: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function ensureTaskAccess({
  client,
  userId,
  taskId,
  driveItemOrgId,
  driveItemUnitId,
}: {
  client: SupabaseClient;
  userId: string;
  taskId: string | null | undefined;
  driveItemOrgId?: string | null;
  driveItemUnitId?: string | null;
}): Promise<TaskAccessResult> {
  const trimmedTaskId = String(taskId ?? "").trim();
  if (!trimmedTaskId) {
    return { ok: false, status: 400, error: "missing_task_id" };
  }

  const { data: task, error: taskErr } = await client
    .from("project_tasks")
    .select("id, org_id, unit_id")
    .eq("id", trimmedTaskId)
    .maybeSingle();

  if (taskErr || !task) {
    return { ok: false, status: 404, error: "task_not_found" };
  }

  if (!task.org_id || !task.unit_id) {
    return { ok: false, status: 400, error: "task_missing_org_unit" };
  }

  if (driveItemOrgId && driveItemOrgId !== task.org_id) {
    return { ok: false, status: 403, error: "permission_denied" };
  }

  if (driveItemUnitId && driveItemUnitId !== task.unit_id) {
    return { ok: false, status: 403, error: "permission_denied" };
  }

  const isSuperAdmin = await isServerSuperAdmin(client, userId);
  if (isSuperAdmin) {
    return {
      ok: true,
      task: { id: task.id, org_id: task.org_id, unit_id: task.unit_id },
      isSuperAdmin: true,
    };
  }

  const allowed = await isOrgAdminOrUnitMember(client, userId, task.org_id, task.unit_id);
  if (!allowed) {
    return { ok: false, status: 403, error: "permission_denied" };
  }

  return {
    ok: true,
    task: { id: task.id, org_id: task.org_id, unit_id: task.unit_id },
    isSuperAdmin: false,
  };
}
