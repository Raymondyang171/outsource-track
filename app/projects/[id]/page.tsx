import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import ProjectWorkspace from "./ProjectWorkspace";


export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id,name,start_date,status,created_at,org_id,unit_id")
    .eq("id", projectId)
    .maybeSingle();
  let role: string | null = null;

  if (project?.org_id && user?.id) {
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

  const { data: tasks, error: tErr } = await supabase
    .from("project_tasks")
    .select("id,seq,phase_name,code,name,progress,start_offset_days,duration_days,owner_unit_id,updated_at")
    .eq("project_id", projectId)
    .order("seq", { ascending: true });

  const taskIds = (tasks ?? []).map((task) => task.id);
  const { data: driveItems, error: dErr } = taskIds.length
    ? await supabase
        .from("drive_items")
        .select("id, project_task_id, name, web_view_link, thumbnail_link, mime_type")
        .in("project_task_id", taskIds)
        .order("modified_time", { ascending: false })
    : { data: [], error: null };

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
          driveItems={driveItems ?? []}
        />
      )}
      {!project && !pErr && <div className="card">找不到專案資料。</div>}
    </div>
  );
}
