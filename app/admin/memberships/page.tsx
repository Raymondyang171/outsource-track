import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function emailToDisplayName(email: string | null | undefined) {
  if (!email) return "user";
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
}

export default async function AdminMembershipsPage() {
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

  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = userList?.users ?? [];
  const userIds = users.map((u) => u.id);
  const { data: profileList } = userIds.length
    ? await admin.from("profiles").select("user_id, display_name").in("user_id", userIds)
    : { data: [] as Array<{ user_id: string; display_name: string | null }> };

  const displayById = new Map((profileList ?? []).map((p) => [p.user_id, p.display_name]));
  const userOptions = users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    displayName: (displayById.get(u.id) ?? "").trim() || emailToDisplayName(u.email),
  }));

  const { data: memberships, error } = orgId
    ? await admin.from("memberships").select("user_id, unit_id, role, created_at, org_id").eq("org_id", orgId).order("created_at", { ascending: false })
    : await admin.from("memberships").select("user_id, unit_id, role, created_at, org_id").order("created_at", { ascending: false });

  const orgNameById = Object.fromEntries((orgs ?? []).map((org) => [org.id, org.name]));
  const unitNameById = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit.name]));

  return (
    <div className="admin-page">
      <h1>成員權限</h1>
      {!orgId && <p>尚未綁定組織，暫時顯示全部資料。</p>}
      {orgErr && <p className="admin-error">{orgErr.message}</p>}
      {unitErr && <p className="admin-error">{unitErr.message}</p>}
      {error && <p className="admin-error">{error.message}</p>}
      {!error && (!memberships || memberships.length === 0) && <p>目前沒有成員資料。</p>}
      {!error && (
        <form className="admin-form" action={async (formData) => {
          "use server";
          const formOrgId = String(formData.get("org_id") ?? "").trim();
          const unitId = String(formData.get("unit_id") ?? "").trim();
          const userId = String(formData.get("user_id") ?? "").trim();
          const role = String(formData.get("role") ?? "").trim() || "member";
          if (!formOrgId || !unitId || !userId) return;
          const adminClient = createAdminSupabase();
          await adminClient.from("memberships").insert({
            org_id: formOrgId,
            unit_id: unitId,
            user_id: userId,
            role,
          });
        }}>
          <select name="org_id" defaultValue={orgId ?? ""}>
            <option value="">選擇組織</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select name="unit_id" defaultValue="">
            <option value="">選擇單位</option>
            {(units ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select name="user_id" defaultValue="">
            <option value="">選擇使用者</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
          <select name="role" defaultValue="member">
            <option value="manager">manager</option>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button type="submit">新增成員</button>
        </form>
      )}
      {!error && memberships && memberships.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>使用者</th>
              <th>組織</th>
              <th>單位</th>
              <th>角色</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={`${m.user_id}:${m.unit_id}`}>
                <td>{userOptions.find((u) => u.id === m.user_id)?.displayName ?? "未知使用者"}</td>
                <td>{orgNameById[m.org_id] ?? "-"}</td>
                <td>{unitNameById[m.unit_id] ?? "-"}</td>
                <td>{m.role}</td>
                <td>{new Date(m.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
