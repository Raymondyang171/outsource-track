import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createServerSupabase();

  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes.user?.email ?? null;

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id,name,start_date,status,created_at")
    .order("created_at", { ascending: false });

  return (
    <div style={{ padding: 24 }}>
      <h1>/projects</h1>
      <p style={{ opacity: 0.7 }}>登入者：{email ?? "null"}</p>

      {error && (
        <pre style={{ padding: 12, border: "1px solid #ccc" }}>
          {JSON.stringify(
            { message: error.message, hint: (error as any).hint ?? null },
            null,
            2
          )}
        </pre>
      )}

      {!error && (!projects || projects.length === 0) && (
        <p>目前沒有專案（或你還沒被加入 org/membership）。</p>
      )}

      <ul style={{ marginTop: 16 }}>
        {projects?.map((p) => (
          <li key={p.id} style={{ marginBottom: 10 }}>
            <Link href={`/projects/${p.id}`}>
              {p.name}（{p.status}）
            </Link>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              start_date: {p.start_date ?? "-"} / created_at: {p.created_at}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
