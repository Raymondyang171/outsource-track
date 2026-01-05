import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminOrgsPage() {
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

  const { data: orgs, error } = orgId
    ? await admin.from("orgs").select("id, name, created_at").eq("id", orgId)
    : await admin.from("orgs").select("id, name, created_at");

  return (
    <div className="admin-page">
      <h1>組織設定</h1>
      {!orgId && <p>尚未綁定組織，暫時顯示全部資料。</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!orgs || orgs.length === 0) && <p>目前沒有組織。</p>}
      {!error && (
        <form className="admin-form" action={async (formData) => {
          "use server";
          const name = String(formData.get("name") ?? "").trim();
          if (!name) return;
          const adminClient = createAdminSupabase();
          await adminClient.from("orgs").insert({ name });
        }}>
          <input name="name" placeholder="組織名稱" />
          <button type="submit">新增組織</button>
        </form>
      )}
      {!error && orgs && orgs.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>組織</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>{new Date(org.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
