import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function formatDateSlash(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnly = value.includes("T") ? value.split("T")[0] : value;
  return dateOnly.replaceAll("-", "/");
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "進行中";
  const map: Record<string, string> = {
    active: "進行中",
    planning: "規劃中",
    paused: "暫停",
    done: "已完成",
    archived: "已封存",
  };
  return map[value] ?? value;
}

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
    .select("id, name, status, start_date, created_at")
    .order("created_at", { ascending: false });

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
      {!error && (!projects || projects.length === 0) && (
        <div className="card">目前沒有專案，請先建立一個專案。</div>
      )}

      {!error && projects && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((project) => (
            <div className="project-card" key={project.id}>
              <div>
                <h3>{project.name}</h3>
                <div className="page-subtitle">
                  開始日 {formatDateSlash(project.start_date)} ・狀態 {formatStatus(project.status)}
                </div>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: "30%" }} />
              </div>
              <div className="topbar-right">
                <a className="btn btn-soft" href={`/projects/${project.id}`}>
                  進入工作台
                </a>
                <span className="badge">{project.id.slice(0, 6)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
