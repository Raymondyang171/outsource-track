import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const missingKey = !process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!user) {
    redirect("/login");
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    admin = null;
  }

  if (missingKey || !admin) {
    return (
      <div className="admin-page">
        Missing <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>.
      </div>
    );
  }

  const { data: myMems, error: myErr } = await admin
    .from("memberships")
    .select("org_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (myErr) {
    return <div className="admin-page">membership lookup failed: {myErr.message}</div>;
  }

  const orgId = myMems?.[0]?.org_id ?? null;

  const { data: orgs, error: orgErr } = orgId
    ? await admin.from("orgs").select("id, name").eq("id", orgId)
    : await admin.from("orgs").select("id, name");

  const { data: units, error: unitErr } = orgId
    ? await admin.from("units").select("id, name, org_id").eq("org_id", orgId).order("name", { ascending: true })
    : await admin.from("units").select("id, name, org_id").order("name", { ascending: true });

  const { data: projects, error } = orgId
    ? await admin
        .from("projects")
        .select("id, name, org_id, unit_id, start_date, status, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
    : await admin
        .from("projects")
        .select("id, name, org_id, unit_id, start_date, status, created_at")
        .order("created_at", { ascending: false });

  return (
    <div className="admin-page">
      <h1>/admin/projects</h1>
      {!orgId && <p>Missing org membership for current user. Showing all orgs.</p>}
      {orgErr && <p className="admin-error">{orgErr.message}</p>}
      {unitErr && <p className="admin-error">{unitErr.message}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!projects || projects.length === 0) && <p>No projects found.</p>}

      {!error && (
        <form
          className="admin-form"
          action={async (formData) => {
            "use server";
            const formOrgId = String(formData.get("org_id") ?? "").trim();
            const unitId = String(formData.get("unit_id") ?? "").trim();
            const name = String(formData.get("name") ?? "").trim();
            const startDate = String(formData.get("start_date") ?? "").trim();
            const status = String(formData.get("status") ?? "").trim();
            if (!formOrgId || !unitId || !name) return;
            const adminClient = createAdminSupabase();
            await adminClient.from("projects").insert({
              org_id: formOrgId,
              unit_id: unitId,
              name,
              start_date: startDate || undefined,
              status: status || undefined,
            });
          }}
        >
          <select name="org_id" defaultValue={orgId ?? ""}>
            <option value="">Select org</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.id})
              </option>
            ))}
          </select>
          <select name="unit_id" defaultValue="">
            <option value="">Select unit</option>
            {(units ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.id})
              </option>
            ))}
          </select>
          <input name="name" placeholder="Project name" />
          <input name="start_date" placeholder="Start date (YYYY-MM-DD)" />
          <input name="status" placeholder="Status (optional)" />
          <button type="submit">Create project</button>
        </form>
      )}

      {!error && projects && projects.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Org</th>
              <th>Unit</th>
              <th>Start</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name} (<code>{p.id}</code>)
                </td>
                <td>
                  <code>{p.org_id}</code>
                </td>
                <td>
                  <code>{p.unit_id}</code>
                </td>
                <td>{p.start_date}</td>
                <td>{p.status}</td>
                <td>{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
