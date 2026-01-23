"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

type UpdatePayload = {
  project_id: string;
  name: string;
  start_date: string | null;
  status: string | null;
  unit_id: string | null;
  visible_unit_ids?: string[] | null;
  visible_user_ids?: string[] | null;
  replace_visibility?: boolean;
  content?: string | null;
};

function normalizeIdList(values: string[] | null | undefined) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function isRlsDenied(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("row-level security") ||
    lowered.includes("permission denied") ||
    lowered.includes("violates row level security")
  );
}

export async function updateProjectAndVisibility(opts: UpdatePayload) {
  const supabase = await createServerSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return { ok: false as const, error: "not_authenticated" };
  }

  const projectId = String(opts.project_id ?? "").trim();
  if (!projectId) {
    return { ok: false as const, error: "missing_project_id" };
  }

  const name = String(opts.name ?? "").trim();
  if (!name) {
    return { ok: false as const, error: "missing_name" };
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let adminClient: ReturnType<typeof createAdminSupabase> | null = null;
  if (isPlatformAdmin) {
    try {
      adminClient = createAdminSupabase();
    } catch {
      return { ok: false as const, error: "missing_service_role_key" };
    }
  }

  const dataClient = adminClient ?? supabase;

  const { data: project, error: projectErr } = await dataClient
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr || !project) {
    return { ok: false as const, error: projectErr?.message ?? "project_not_found" };
  }

  if (!isPlatformAdmin) {
    const { data: hasPerm, error: permErr } = await supabase.rpc<boolean>("has_project_perm", {
      p_project_id: projectId,
      p_perm: "project.update",
    });
    if (permErr) {
      return { ok: false as const, error: "project_perm_check_failed" };
    }
    if (!hasPerm) {
      return { ok: false as const, error: "permission_denied" };
    }
  }

  const start_date = opts.start_date ? String(opts.start_date) : null;
  const status = opts.status ? String(opts.status) : null;
  const unit_id = opts.unit_id ? String(opts.unit_id) : null;

  const { data: updatedRows, error: updateErr } = await dataClient
    .from("projects")
    .update({
      name,
      start_date,
      status,
      unit_id,
    })
    .eq("id", projectId)
    .select("id");

  if (updateErr) {
    return { ok: false as const, error: updateErr.message };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { ok: false as const, error: "project_update_blocked" };
  }

  if (opts.replace_visibility) {
    const { error: clearErr } = await dataClient
      .from("project_grants")
      .delete()
      .eq("project_id", projectId)
      .eq("permission_key", "project.view");

    if (clearErr) {
      return {
        ok: false as const,
        error: isRlsDenied(clearErr.message) ? "grants_permission_denied" : clearErr.message,
      };
    }

    const unitIds = normalizeIdList(opts.visible_unit_ids);
    const userIds = normalizeIdList(opts.visible_user_ids);

    const rows = [
      ...unitIds.map((unitId) => ({
        org_id: project.org_id,
        project_id: projectId,
        unit_id: unitId,
        user_id: null,
        permission_key: "project.view",
        created_by: user.id,
      })),
      ...userIds.map((userId) => ({
        org_id: project.org_id,
        project_id: projectId,
        unit_id: null,
        user_id: userId,
        permission_key: "project.view",
        created_by: user.id,
      })),
    ];

    if (rows.length > 0) {
      const { error: insertErr } = await dataClient.from("project_grants").insert(rows);
      if (insertErr) {
        return {
          ok: false as const,
          error: isRlsDenied(insertErr.message) ? "grants_permission_denied" : insertErr.message,
        };
      }
    }
  }

  const content = String(opts.content ?? "").trim();
  if (content) {
    const { error: logErr } = await dataClient.from("project_updates").insert({
      org_id: project.org_id,
      project_id: projectId,
      content,
      created_by: user.id,
    });
    if (logErr) {
      return { ok: false as const, error: logErr.message };
    }
  }

  revalidatePath("/projects");
  return { ok: true as const };
}
