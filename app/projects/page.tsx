import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import ProjectListClient from "./ProjectListClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let dataClient = supabase;
  if (isPlatformAdmin) {
    try {
      dataClient = createAdminSupabase();
    } catch {
      return <div className="page">缺少服務金鑰，無法載入平台資料。</div>;
    }
  }

  const { data: projects, error } = await dataClient
    .from("projects")
    .select("id, name, status, start_date, created_at, org_id, unit_id")
    .order("created_at", { ascending: false });

  const projectList = projects ?? [];
  const orgIds = Array.from(
    new Set(projectList.map((project) => project.org_id).filter(Boolean))
  );

  const roleRank: Record<string, number> = { viewer: 0, member: 1, manager: 2, admin: 3 };
  const roleByOrg: Record<string, string> = {};
  let membershipErr: { message?: string } | null = null;

  if (!isPlatformAdmin && orgIds.length > 0) {
    const { data: memberRows, error: memErr } = await supabase
      .from("memberships")
      .select("org_id, role, created_at")
      .eq("user_id", user.id)
      .in("org_id", orgIds)
      .order("created_at", { ascending: false });

    if (memErr) {
      membershipErr = memErr;
    } else {
      for (const row of memberRows ?? []) {
        const orgId = row.org_id;
        const role = row.role ?? "viewer";
        const rank = roleRank[role] ?? 0;
        const prev = roleByOrg[orgId];
        if (!prev || rank > (roleRank[prev] ?? 0)) {
          roleByOrg[orgId] = role;
        }
      }
    }
  }

  const canManageVisibilityByOrg = Object.fromEntries(
    orgIds.map((orgId) => [
      orgId,
      isPlatformAdmin ? true : ["admin", "manager"].includes(roleByOrg[orgId] ?? ""),
    ])
  );

  let units: Array<{ id: string; name: string; org_id: string }> = [];
  let unitErr: { message?: string } | null = null;
  if (orgIds.length > 0) {
    const { data: unitRows, error: uErr } = await dataClient
      .from("units")
      .select("id, name, org_id")
      .in("org_id", orgIds)
      .order("name", { ascending: true });
    units = unitRows ?? [];
    unitErr = uErr ?? null;
  }

  const memberOrgIds = isPlatformAdmin
    ? orgIds
    : orgIds.filter((orgId) => canManageVisibilityByOrg[orgId]);
  let members: Array<{
    user_id: string;
    org_id: string;
    unit_id: string | null;
    role: string | null;
    display_name: string | null;
  }> = [];
  let memberErr: { message?: string } | null = null;
  if (memberOrgIds.length > 0) {
    const { data: memberRows, error: memErr } = await dataClient
      .from("memberships")
      .select("user_id, org_id, unit_id, role")
      .in("org_id", memberOrgIds);
    memberErr = memErr ?? null;
    const source = (memberRows ?? []) as Array<{
      user_id: string;
      org_id: string;
      unit_id: string | null;
      role: string | null;
    }>;
    const userIds = Array.from(new Set(source.map((row) => row.user_id).filter(Boolean)));
    let displayNameById: Record<string, string> = {};
    if (userIds.length > 0) {
      let profileClient = dataClient;
      if (!isPlatformAdmin) {
        try {
          profileClient = createAdminSupabase();
        } catch {
          profileClient = dataClient;
        }
      }
      const { data: profileRows, error: profileErr } = await profileClient
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      if (profileErr) {
        memberErr = memberErr ?? profileErr;
      } else {
        displayNameById = Object.fromEntries(
          (profileRows ?? []).map((row) => [row.user_id, (row.display_name ?? "").trim()])
        );
      }
    }
    members = source.map((row) => ({
      user_id: row.user_id,
      org_id: row.org_id,
      unit_id: row.unit_id ?? null,
      role: row.role ?? null,
      display_name: displayNameById[row.user_id] ?? null,
    }));
  }

  const grantProjectIds = projectList
    .filter((project) => canManageVisibilityByOrg[project.org_id])
    .map((project) => project.id);
  let grants: Array<{ project_id: string; unit_id: string | null; user_id: string | null }> = [];
  let grantsErr: { message?: string } | null = null;
  if (grantProjectIds.length > 0) {
    const { data: grantRows, error: gErr } = await dataClient
      .from("project_grants")
      .select("project_id, unit_id, user_id")
      .in("project_id", grantProjectIds)
      .eq("permission_key", "project.view");
    grants = grantRows ?? [];
    grantsErr = gErr ?? null;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">專案</div>
          <div className="page-subtitle">集中查看所有正在進行與已建立的專案。</div>
        </div>
        <div className="topbar-right">
          <a className="btn btn-primary" href="/admin/projects">
            新建專案
          </a>
          <a className="btn btn-ghost" href="/admin/tasks">
            任務管理
          </a>
        </div>
      </div>

      {error && <div className="admin-error">{error.message}</div>}
      {membershipErr && <div className="admin-error">{membershipErr.message}</div>}
      {unitErr && <div className="admin-error">{unitErr.message}</div>}
      {memberErr && <div className="admin-error">{memberErr.message}</div>}
      {grantsErr && <div className="admin-error">{grantsErr.message}</div>}
      {!error && (!projects || projects.length === 0) && (
        <div className="card">目前沒有專案，請先建立一個專案。</div>
      )}

      {!error && projects && projects.length > 0 && (
        <ProjectListClient
          projects={projectList}
          units={units}
          members={members}
          grants={grants}
          canManageVisibilityByOrg={canManageVisibilityByOrg}
        />
      )}
    </div>
  );
}
