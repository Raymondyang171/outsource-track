import type { SupabaseClient } from "@supabase/supabase-js";

type GuardError = { ok: false; status: number; error: string };
type GuardSuccess = { ok: true; projectId: string; orgId: string };

export type EnsureProjectAccessResult = GuardSuccess | GuardError;

async function fetchProjectInfo(client: SupabaseClient, projectId: string) {
  return client
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .maybeSingle();
}

async function checkProjectViewPerm(client: SupabaseClient, projectId: string) {
  return client.rpc<boolean>("has_project_perm", {
    p_project_id: projectId,
    p_perm: "project.view",
  });
}

export async function ensureProjectAccess({
  client,
  projectId,
}: {
  client: SupabaseClient;
  projectId: string | null | undefined;
}): Promise<EnsureProjectAccessResult> {
  const trimmedProjectId = String(projectId ?? "").trim();
  if (!trimmedProjectId) {
    return { ok: false, status: 400, error: "missing_project_id" };
  }

  const { data: hasPerm, error: permErr } = await checkProjectViewPerm(
    client,
    trimmedProjectId
  );
  if (permErr) {
    return { ok: false, status: 500, error: "project_perm_check_failed" };
  }

  if (!hasPerm) {
    return { ok: false, status: 404, error: "project_not_found" };
  }

  const { data: project, error } = await fetchProjectInfo(client, trimmedProjectId);
  if (error) {
    return { ok: false, status: 500, error: "project_query_failed" };
  }

  if (!project) {
    return { ok: false, status: 404, error: "project_not_found" };
  }

  if (!project.org_id) {
    return { ok: false, status: 400, error: "project_missing_org" };
  }

  return {
    ok: true,
    projectId: project.id,
    orgId: project.org_id,
  };
}
