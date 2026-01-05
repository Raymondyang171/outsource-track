import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function encodeMsg(msg: string) {
  return encodeURIComponent(msg);
}

function emailToDisplayName(email: string | null | undefined) {
  if (!email) return "user";
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
}

async function createUserAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const orgId = String(formData.get("org_id") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!email || !password || !displayName) {
    redirect(`/admin/users?error=${encodeMsg("email, password, and display name are required")}`);
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    redirect(`/admin/users?error=${encodeMsg(e.message ?? "missing service role key")}`);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    redirect(`/admin/users?error=${encodeMsg(createErr?.message ?? "create user failed")}`);
  }

  const userId = created.user.id;

  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" });

  if (profileErr) {
    redirect(`/admin/users?error=${encodeMsg(`profile insert failed: ${profileErr.message}`)}`); 
  }

  if (orgId || unitId || role) {
    if (!orgId || !unitId) {
      redirect(`/admin/users?error=${encodeMsg("org_id and unit_id are required for membership")}`);
    }

    const { error: memErr } = await admin.from("memberships").insert({
      org_id: orgId,
      unit_id: unitId,
      user_id: userId,
      role: role || "member",
    });

    if (memErr) {
      redirect(`/admin/users?error=${encodeMsg(`membership insert failed: ${memErr.message}`)}`);
    }
  }

  redirect(`/admin/users?ok=1`);
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const error = getParam(sp?.error);

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const missingKey = !process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!user) {
    redirect("/login");
  }

  let listClient = supabase;
  if (!missingKey) {
    try {
      listClient = createAdminSupabase();
    } catch (e: any) {
      // fall back to user client
    }
  }

  let orgId: string | null = null;
  let memberships: Array<{
    user_id: string;
    org_id: string;
    unit_id: string;
    role: string;
    created_at: string;
  }> = [];
  let membershipsError: string | null = null;
  let orgOptions: Array<{ id: string; name: string }> = [];
  let unitOptions: Array<{ id: string; name: string }> = [];
  let taskOptions: Array<{ id: string; label: string }> = [];
  let orgNameById: Record<string, string> = {};

  if (user) {
    if (!missingKey) {
      try {
        const admin = createAdminSupabase();
        const { data: listRes } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const users = listRes?.users ?? [];
        const userIds = users.map((u) => u.id);
        if (userIds.length > 0) {
          const { data: profileList } = await admin
            .from("profiles")
            .select("user_id, display_name")
            .in("user_id", userIds);

          const displayById = new Map((profileList ?? []).map((p) => [p.user_id, p.display_name]));
          const missing = users
            .filter((u) => {
              const d = displayById.get(u.id);
              return !d || !String(d).trim();
            })
            .map((u) => ({
              user_id: u.id,
              display_name: emailToDisplayName(u.email),
            }));

          if (missing.length > 0) {
            await admin.from("profiles").upsert(missing, { onConflict: "user_id" });
          }
        }
      } catch {
        // ignore backfill errors
      }
    }

    const { data: myMems, error: myErr } = await listClient
      .from("memberships")
      .select("org_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (myErr) {
      membershipsError = `membership lookup failed: ${myErr.message}`;
    } else if (!myMems || myMems.length === 0) {
      membershipsError = "no_org_membership";
    } else {
      orgId = myMems[0].org_id;
    }

    if (!membershipsError) {
      const { data: orgList, error: orgErr } = await listClient
        .from("orgs")
        .select("id, name");

      if (orgErr) {
        membershipsError = orgErr.message;
      } else {
        orgOptions = orgId ? (orgList ?? []).filter((o) => o.id === orgId) : orgList ?? [];
        orgNameById = Object.fromEntries((orgList ?? []).map((o) => [o.id, o.name]));
      }

      const unitsQuery = listClient.from("units").select("id, name, org_id").order("name", { ascending: true });
      const { data: unitList, error: unitErr } = orgId ? await unitsQuery.eq("org_id", orgId) : await unitsQuery;

      if (unitErr) {
        membershipsError = unitErr.message;
      } else {
        unitOptions =
          unitList?.map((u) => ({
            id: u.id,
            name: orgId ? u.name : `${orgNameById[u.org_id] ?? u.org_id} / ${u.name}`,
          })) ?? [];
      }

      if (orgId) {
        const { data: taskList, error: taskErr } = await listClient
          .from("project_tasks")
          .select("id, seq, phase_name, code, name")
          .eq("org_id", orgId)
          .order("seq", { ascending: true });

        if (taskErr) {
          membershipsError = taskErr.message;
        } else {
          taskOptions =
            taskList?.map((t) => ({
              id: t.id,
              label: `${t.phase_name} ${t.code ? `[${t.code}] ` : ""}${t.name}`.trim(),
            })) ?? [];
        }
      }

      if (orgId) {
        const { data: memList, error: listErr } = await listClient
          .from("memberships")
          .select("user_id, org_id, unit_id, role, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false });

        if (listErr) {
          membershipsError = listErr.message;
        } else {
          memberships = memList ?? [];
        }
      }
    }
  }

  return (
    <div className="admin-page">
      <h1>/admin/users</h1>

      {user && missingKey && (
        <p>
          Missing <code>SUPABASE_SERVICE_ROLE_KEY</code> in
          <code>.env.local</code>.
        </p>
      )}

      {ok && <p className="admin-success">User created.</p>}
      {error && <p className="admin-error">{decodeURIComponent(error)}</p>}

      {user && !missingKey && (
        <form action={createUserAction} className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="admin-field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>
          <div className="admin-field">
            <label htmlFor="display_name">Display name</label>
            <input id="display_name" name="display_name" required />
          </div>
          <div className="admin-field">
            <label htmlFor="org_id">Org ID (optional)</label>
            <select id="org_id" name="org_id" defaultValue={orgId ?? ""}>
              <option value="">(skip)</option>
              {orgOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.id})
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="unit_id">Unit ID (optional)</label>
            <select id="unit_id" name="unit_id" defaultValue="">
              <option value="">(skip)</option>
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.id})
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="task_id">Task ID (optional)</label>
            <select id="task_id" name="task_id" defaultValue="">
              <option value="">(skip)</option>
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.label} ({task.id})
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="role">Role (optional)</label>
            <select id="role" name="role" defaultValue="">
              <option value="">(skip)</option>
              <option value="manager">manager</option>
              <option value="member">member</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <button type="submit">Create user</button>
        </form>
      )}

      {user && (
        <div className="admin-section">
          <h2>User permissions</h2>

          {!orgId && !membershipsError && (
            <p>Missing org membership for current user. Assign a membership first.</p>
          )}
          {membershipsError && <p className="admin-error">{membershipsError}</p>}
          {!membershipsError && memberships.length === 0 && <p>No memberships found.</p>}

          {!membershipsError && memberships.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Unit</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={`${m.user_id}:${m.unit_id}`}>
                    <td>
                      <code>{m.user_id}</code>
                    </td>
                    <td>
                      <code>{m.unit_id}</code>
                    </td>
                    <td>{m.role}</td>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
