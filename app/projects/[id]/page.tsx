import { createServerSupabase } from "@/lib/supabase/server";
import TaskEditorSheet from "./TaskEditorSheet";


export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  const supabase = await createServerSupabase();

  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id,name,start_date,status,created_at")
    .eq("id", projectId)
    .maybeSingle();

  const { data: tasks, error: tErr } = await supabase
    .from("project_tasks")
    .select("id,seq,phase_name,code,name,progress,duration_days,owner_unit_id,updated_at")
    .eq("project_id", projectId)
    .order("seq", { ascending: true });

  return (
    <div style={{ padding: 24 }}>
      <h1>Project</h1>

      {pErr ? (
        <pre>{JSON.stringify({ projectError: pErr.message }, null, 2)}</pre>
      ) : (
        <pre>{JSON.stringify(project, null, 2)}</pre>
      )}

      <h2 style={{ marginTop: 24 }}>Tasks</h2>
      {tErr && <pre>{JSON.stringify({ taskError: tErr.message }, null, 2)}</pre>}

    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
  <thead>
    <tr>
      <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>Seq</th>
      <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>Phase</th>
      <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>Task</th>
      <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>Progress</th>
      <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>Edit</th>
    </tr>
  </thead>

  <tbody>
    {tasks?.map((t) => (
      <tr key={t.id}>
        <td style={{ padding: "8px 0" }}>{t.seq}</td>
        <td style={{ padding: "8px 0" }}>{t.phase_name}</td>
        <td style={{ padding: "8px 0" }}>
          {t.code ? `[${t.code}] ` : ""}
          {t.name}
        </td>
        <td style={{ padding: "8px 0" }}>{t.progress}%</td>

        <td style={{ padding: "8px 0" }}>
          <TaskEditorSheet
            taskId={t.id}
            taskName={`${t.code ? `[${t.code}] ` : ""}${t.name}`}
            currentProgress={t.progress}
          />
        </td>
      </tr>
    ))}
  </tbody>
</table>

    </div>
  );
}
