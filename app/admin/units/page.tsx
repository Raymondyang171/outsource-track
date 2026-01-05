import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminUnitsPage() {
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

  const { data: units, error } = orgId
    ? await admin.from("units").select("id, name, created_at, org_id").eq("org_id", orgId).order("name", { ascending: true })
    : await admin.from("units").select("id, name, created_at, org_id").order("name", { ascending: true });

  const orgNameById = Object.fromEntries((orgs ?? []).map((org) => [org.id, org.name]));

  return (
    <div className="admin-page">
      <h1>單位設定</h1>
      {!orgId && <p>尚未綁定組織，暫時顯示全部資料。</p>}
      {orgErr && <p className="admin-error">{orgErr.message}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!units || units.length === 0) && <p>目前沒有單位。</p>}
      {!error && (
        <form className="admin-form" action={async (formData) => {
          "use server";
          const name = String(formData.get("name") ?? "").trim();
          const formOrgId = String(formData.get("org_id") ?? "").trim();
          if (!name || !formOrgId) return;
          const adminClient = createAdminSupabase();
          await adminClient.from("units").insert({ name, org_id: formOrgId });
        }}>
          <select name="org_id" defaultValue={orgId ?? ""}>
            <option value="">選擇組織</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="單位名稱" />
          <button type="submit">新增單位</button>
        </form>
      )}
      {!error && units && units.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>單位</th>
              <th>組織</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.id}>
                <td>{unit.name}</td>
                <td>{orgNameById[unit.org_id] ?? "-"}</td>
                <td>{new Date(unit.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
