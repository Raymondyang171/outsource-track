import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { checkPermission, isOrgAdminOrUnitMember } from "@/lib/permissions";
import ProjectWorkspace from "./ProjectWorkspace";

type MembershipProfileRow = {
  user_id: string;
  unit_id: string;
  role: string | null;
  profiles:
    | { display_name: string | null; job_title_id: string | null }
    | { display_name: string | null; job_title_id: string | null }[]
    | null;
};


export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const { id: projectId } = await params;
  const sp = await searchParams;
  const tabRaw = Array.isArray(sp?.tab) ? sp?.tab?.[0] : sp?.tab;
  const allowedTabs = new Set(["dashboard", "board", "timeline", "files", "settings"]);
  const initialTab = tabRaw && allowedTabs.has(tabRaw) ? tabRaw : undefined;

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let dataClient: SupabaseClient = supabase;
  let adminClient: SupabaseClient | null = null;
  if (isPlatformAdmin) {
    try {
      dataClient = createAdminSupabase();
      adminClient = dataClient;
    } catch {
      return <div className="page">缺少服務金鑰，無法載入平台資料。</div>;
    }
  } else {
    try {
      adminClient = createAdminSupabase();
    } catch {
      adminClient = null;
    }
  }

  const { data: project, error: pErr } = await dataClient
    .from("projects")
    .select("id,name,start_date,status,created_at,org_id,unit_id")
    .eq("id", projectId)
    .maybeSingle();
  let role: string | null = null;
  let hasUnitAccess = false;

  if (isPlatformAdmin) {
    role = "admin";
    hasUnitAccess = true;
  } else if (project?.org_id && user?.id) {
    const { data: mems } = await supabase
      .from("memberships")
      .select("role, created_at")
      .eq("org_id", project.org_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (mems && mems.length > 0) {
      const roleRank: Record<string, number> = { viewer: 0, member: 1, manager: 2, admin: 3 };
      let best = mems[0]?.role ?? null;
      for (const m of mems) {
        if (roleRank[m.role] > roleRank[best ?? "viewer"]) {
          best = m.role;
        }
      }
      role = best;
    }
  }

  if (!hasUnitAccess && project?.org_id && project?.unit_id && user?.id) {
    const membershipClient = adminClient ?? dataClient;
    hasUnitAccess = await isOrgAdminOrUnitMember(membershipClient, user.id, project.org_id, project.unit_id);
  }

  let tasksClient: SupabaseClient = dataClient;
  if (adminClient && project?.org_id && user?.id) {
    const allowed = isPlatformAdmin
      ? true
      : await checkPermission(adminClient, user.id, project.org_id, "tasks", "read");
    if (allowed && hasUnitAccess) {
      tasksClient = adminClient;
    }
  }

  let tasksQuery = tasksClient
    .from("project_tasks")
    .select(
      "id,seq,phase_name,code,name,progress,start_offset_days,duration_days,owner_unit_id,owner_user_id,updated_at"
    )
    .eq("project_id", projectId)
    .order("seq", { ascending: true });

  if (project?.unit_id) {
    tasksQuery = tasksQuery.eq("unit_id", project.unit_id);
  }

  const { data: tasks, error: tErr } = await tasksQuery;

  let units: Array<{ id: string; name: string }> = [];
  let members: Array<{
    user_id: string;
    unit_id: string;
    role: string | null;
    display_name: string | null;
    job_title_id: string | null;
    job_title: string | null;
  }> = [];
  let jobTitleById: Record<string, string> = {};

  if (project?.org_id) {
    const { data: unitRows } = await dataClient
      .from("units")
      .select("id, name")
      .eq("org_id", project.org_id)
      .order("name", { ascending: true });
    units = unitRows ?? [];

    const { data: jobTitleRows } = await dataClient
      .from("job_titles")
      .select("id, name")
      .eq("org_id", project.org_id)
      .order("name", { ascending: true });
    jobTitleById = Object.fromEntries((jobTitleRows ?? []).map((row) => [row.id, row.name]));

    const { data: memberRows } = await dataClient
      .from("memberships")
      .select("user_id, unit_id, role")
      .eq("org_id", project.org_id);
    const memberSource = (memberRows ?? []) as Array<{
      user_id: string;
      unit_id: string;
      role: string | null;
    }>;
    const userIds = Array.from(new Set(memberSource.map((row) => row.user_id).filter(Boolean)));
    let profileById: Record<string, { display_name: string | null; job_title_id: string | null }> = {};
    if (userIds.length > 0) {
      let profileClient: SupabaseClient = dataClient;
      if (!isPlatformAdmin) {
        try {
          profileClient = createAdminSupabase();
        } catch {
          profileClient = dataClient;
        }
      }
      const { data: profileRows } = await profileClient
        .from("profiles")
        .select("user_id, display_name, job_title_id")
        .in("user_id", userIds);
      profileById = Object.fromEntries(
        (profileRows ?? []).map((row) => [row.user_id, { display_name: row.display_name ?? null, job_title_id: row.job_title_id ?? null }])
      );
    }
    members = memberSource.map((row) => {
      const profile = profileById[row.user_id];
      const jobTitleId = profile?.job_title_id ?? null;
      const jobTitleName = jobTitleId ? jobTitleById[jobTitleId] ?? null : null;
      return {
        user_id: row.user_id,
        unit_id: row.unit_id,
        role: row.role ?? null,
        display_name: profile?.display_name ?? null,
        job_title_id: jobTitleId,
        job_title: jobTitleName,
      };
    });
  }

  const taskIds = (tasks ?? []).map((task: { id: string }) => task.id);
  let driveItems: Array<{
    id: string;
    project_task_id: string;
    name: string;
    web_view_link: string;
    thumbnail_link: string | null;
    mime_type: string | null;
  }> = [];
  let dErr: { message?: string } | null = null;

  if (taskIds.length && hasUnitAccess) {
    let driveClient: SupabaseClient = dataClient;
    if (adminClient && project?.org_id && user?.id) {
      const allowed = isPlatformAdmin
        ? true
        : await checkPermission(adminClient, user.id, project.org_id, "files", "read");
      if (allowed && hasUnitAccess) {
        driveClient = adminClient;
      }
    }
    let driveQuery = driveClient
      .from("drive_items")
      .select("id, project_task_id, name, web_view_link, thumbnail_link, mime_type")
      .in("project_task_id", taskIds)
      .order("modified_time", { ascending: false });

    if (project?.org_id) {
      driveQuery = driveQuery.eq("org_id", project.org_id);
    }
    if (project?.unit_id) {
      driveQuery = driveQuery.eq("unit_id", project.unit_id);
    }

    const { data, error } = await driveQuery;
    driveItems = data ?? [];
    dErr = error ?? null;
  } else if (taskIds.length && !hasUnitAccess) {
    dErr = { message: "permission_denied" };
  }

  let assigneesByTaskId: Record<string, string[]> = {};
  if (taskIds.length && hasUnitAccess) {
    const { data: assigneeRows } = await dataClient
      .from("project_task_assignees")
      .select("task_id, user_id")
      .in("task_id", taskIds);
    assigneesByTaskId = (assigneeRows ?? []).reduce((acc, row) => {
      if (!acc[row.task_id]) {
        acc[row.task_id] = [];
      }
      acc[row.task_id].push(row.user_id);
      return acc;
    }, {} as Record<string, string[]>);
  }

  return (
    <div className="page">
      {pErr && <div className="admin-error">{pErr.message}</div>}
      {tErr && <div className="admin-error">{tErr.message}</div>}
      {dErr && <div className="admin-error">{dErr.message}</div>}
      {project && (
        <ProjectWorkspace
          project={project}
          tasks={tasks ?? []}
          role={role}
          currentUserId={user?.id ?? null}
          driveItems={driveItems ?? []}
          units={units}
          members={members}
          assigneesByTaskId={assigneesByTaskId}
          initialTab={initialTab}
        />
      )}
      {!project && !pErr && <div className="card">找不到專案資料。</div>}
    </div>
  );
}
