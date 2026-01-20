"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

function parseDate(value: string | null) {
  if (!value) return null;
  return value.trim() ? value.trim() : null;
}

export async function createAssistRequest(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;
  if (authErr || !user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let dataClient = supabase;
  if (isPlatformAdmin) {
    try {
      dataClient = createAdminSupabase();
    } catch {
      return;
    }
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!projectId) return;
  const taskId = String(formData.get("project_task_id") ?? "").trim();
  let toUnitId = String(formData.get("to_unit_id") ?? "").trim();
  if (toUnitId === "all") {
    toUnitId = "";
  }
  const dueDateRaw = parseDate(String(formData.get("due_date") ?? "").trim());
  const note = String(formData.get("note") ?? "").trim();

  const { data: project, error: projErr } = await dataClient
    .from("projects")
    .select("id, org_id, unit_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projErr || !project?.org_id) return;

  let unitId = project.unit_id;
  if (!isPlatformAdmin) {
    const { data: mems, error: memErr } = await supabase
      .from("memberships")
      .select("org_id, unit_id, created_at")
      .eq("org_id", project.org_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (memErr || !mems?.[0]) return;
    unitId = mems[0].unit_id;
  }

  const payload = {
    org_id: project.org_id,
    unit_id: unitId,
    project_id: projectId,
    project_task_id: taskId || null,
    to_unit_id: toUnitId || null,
    requested_by: user.id,
    status: "open",
    due_date: dueDateRaw || null,
    note: note || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await dataClient.from("assist_requests").insert(payload);
  if (error) {
    console.warn("assist_requests insert failed", error.message ?? error);
    return;
  }
  revalidatePath("/dashboard");
}

export async function updateAssistStatus(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;
  if (authErr || !user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let dataClient = supabase;
  if (isPlatformAdmin) {
    try {
      dataClient = createAdminSupabase();
    } catch {
      return;
    }
  }

  const assistId = String(formData.get("assist_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!assistId || !status) return;

  const { error } = await dataClient
    .from("assist_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", assistId);
  if (error) {
    console.warn("assist_requests update failed", error.message ?? error);
    return;
  }
  revalidatePath("/dashboard");
}
