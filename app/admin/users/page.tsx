import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import ConfirmForm from "@/components/confirm-form";
import { checkPermission, getPermissionsForResource } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const baseRoleOptions = ["viewer", "member", "manager", "admin"];
const roleRank: Record<string, number> = {
  viewer: 0,
  member: 1,
  manager: 2,
  admin: 3,
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

async function resolveBestRole(admin: any, userId: string, orgId?: string | null) {
  let query = admin
    .from("memberships")
    .select("role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  const { data } = await query;
  let best: string | null = null;
  let bestRank = -1;
  (data ?? []).forEach((row) => {
    const role = String(row.role ?? "").trim();
    if (!role) return;
    const rank = roleRank[role] ?? 0;
    if (rank > bestRank) {
      best = role;
      bestRank = rank;
    }
  });
  return best;
}

async function createUserAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const authedUser = data.user;
  if (!authedUser) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const orgId = String(formData.get("org_id") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!email || !password || !displayName || !orgId || !unitId) {
    redirect(`/admin/users?error=${encodeMsg("email, password, display name, org, and unit are required")}`);
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    redirect(`/admin/users?error=${encodeMsg(e.message ?? "missing service role key")}`);
  }

  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, authedUser.id);
  if (!isPlatformAdmin) {
    if (!userOrgId || !orgId || !unitId || orgId !== userOrgId) {
      redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
    }
  }

  const isAdminRole = isPlatformAdmin || (await resolveBestRole(admin, authedUser.id, userOrgId)) === "admin";
  const resolvedRole = isAdminRole ? role : "member";

  const allowed = isPlatformAdmin || await checkPermission(admin, authedUser.id, userOrgId, "users", "create");
  if (!allowed) {
    redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
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

  const { error: memErr } = await admin.from("memberships").insert({
    org_id: orgId,
    unit_id: unitId,
    user_id: userId,
    role: resolvedRole || "member",
  });

  if (memErr) {
    redirect(`/admin/users?error=${encodeMsg(`membership insert failed: ${memErr.message}`)}`);
  }

  redirect(`/admin/users?ok=1`);
}

async function updateMembershipRoleAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const authedUser = data.user;
  if (!authedUser) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const orgId = String(formData.get("org_id") ?? "").trim();
  const currentUnitId = String(formData.get("current_unit_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!orgId || !currentUnitId || !userId || !role) {
    redirect(`/admin/users?error=${encodeMsg("missing membership fields")}`);
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    redirect(`/admin/users?error=${encodeMsg(e.message ?? "missing service role key")}`);
  }

  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, authedUser.id);
  if (!isPlatformAdmin && (!userOrgId || orgId !== userOrgId)) {
    redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
  }

  const isAdminRole = isPlatformAdmin || (await resolveBestRole(admin, authedUser.id, userOrgId)) === "admin";
  if (!isAdminRole) {
    redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
  }

  const { error } = await admin
    .from("memberships")
    .update({ role })
    .eq("org_id", orgId)
    .eq("unit_id", currentUnitId)
    .eq("user_id", userId);

  if (error) {
    redirect(`/admin/users?error=${encodeMsg(`role update failed: ${error.message}`)}`);
  }

  redirect(`/admin/users?ok=membership_updated`);
}

async function deleteMembershipAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const authedUser = data.user;
  if (!authedUser) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const orgId = String(formData.get("org_id") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();

  if (!orgId || !unitId || !userId) {
    redirect(`/admin/users?error=${encodeMsg("missing membership fields")}`);
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    redirect(`/admin/users?error=${encodeMsg(e.message ?? "missing service role key")}`);
  }

  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, authedUser.id);
  if (!isPlatformAdmin && (!userOrgId || orgId !== userOrgId)) {
    redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
  }

  const allowed = isPlatformAdmin || await checkPermission(admin, authedUser.id, orgId, "memberships", "delete");
  if (!allowed) {
    redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
  }

  const { error } = await admin
    .from("memberships")
    .delete()
    .eq("org_id", orgId)
    .eq("unit_id", unitId)
    .eq("user_id", userId);

  if (error) {
    redirect(`/admin/users?error=${encodeMsg(`delete membership failed: ${error.message}`)}`);
  }

  redirect(`/admin/users?ok=membership_deleted`);
}

async function updateMembershipAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const authedUser = data.user;
  if (!authedUser) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const orgId = String(formData.get("org_id") ?? "").trim();
  const currentUnitId = String(formData.get("current_unit_id") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!orgId || !currentUnitId || !unitId || !userId) {
    redirect(`/admin/users?error=${encodeMsg("missing membership fields")}`);
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    redirect(`/admin/users?error=${encodeMsg(e.message ?? "missing service role key")}`);
  }

  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, authedUser.id);
  if (!isPlatformAdmin && (!userOrgId || orgId !== userOrgId)) {
    redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
  }

  const canUpdateMemberships = isPlatformAdmin || await checkPermission(admin, authedUser.id, orgId, "memberships", "update");
  if (!canUpdateMemberships) {
    redirect(`/admin/users?error=${encodeMsg("permission_denied")}`);
  }

  const canUpdateUsers = isPlatformAdmin || await checkPermission(admin, authedUser.id, orgId, "users", "update");
  if (displayName && canUpdateUsers) {
    await admin
      .from("profiles")
      .upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" });
  }

  const { error } = await admin
    .from("memberships")
    .update({ unit_id: unitId })
    .eq("org_id", orgId)
    .eq("unit_id", currentUnitId)
    .eq("user_id", userId);

  if (error) {
    redirect(`/admin/users?error=${encodeMsg(`membership update failed: ${error.message}`)}`);
  }

  redirect(`/admin/users?ok=membership_updated`);
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ok = getParam(sp?.ok);
  const error = getParam(sp?.error);
  const selectedOrgId = getParam(sp?.org_id);
  const okMsg =
    ok === "1"
      ? "已建立使用者。"
      : ok === "membership_updated"
        ? "已更新成員資料。"
        : ok === "membership_deleted"
          ? "已刪除成員。"
          : null;

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;

  const missingKey = !process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!user) {
    redirect("/login");
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

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
  let orgNameById: Record<string, string> = {};
  let unitNameById: Record<string, string> = {};
  let userNameById: Record<string, string> = {};
  let userEmailById: Record<string, string> = {};
  let userRole: string | null = null;
  let canReadUsers = true;
  let canCreateUsers = false;
  let canUpdateMemberships = false;
  let canEditRoles = false;
  let canDeleteMemberships = false;
  let roleOptions = [...baseRoleOptions];

  if (user) {
    if (isPlatformAdmin) {
      orgId = selectedOrgId ?? null;
      if (!orgId) {
        membershipsError = "no_org_selected";
      }
    } else {
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
    }

    if (!missingKey) {
      try {
        const admin = createAdminSupabase();
        let userIds: string[] = [];

        if (isPlatformAdmin) {
          if (orgId) {
            const { data: memRows } = await admin
              .from("memberships")
              .select("user_id")
              .eq("org_id", orgId);
            userIds = (memRows ?? []).map((m) => m.user_id);
            const userInfos = await Promise.all(
              userIds.map(async (id) => {
                try {
                  const { data } = await admin.auth.admin.getUserById(id);
                  return { id, email: data.user?.email ?? "" };
                } catch {
                  return { id, email: "" };
                }
              })
            );
            userEmailById = Object.fromEntries(userInfos.map((u) => [u.id, u.email]));
          }
        } else {
          const { data: listRes } = await admin.auth.admin.listUsers({ perPage: 1000 });
          const users = listRes?.users ?? [];
          const allUserIds = users.map((u) => u.id);
          userIds = allUserIds;

          if (orgId) {
            const { data: memRows } = await admin
              .from("memberships")
              .select("user_id")
              .eq("org_id", orgId);
            const allowedIds = new Set((memRows ?? []).map((m) => m.user_id));
            userIds = users.filter((u) => allowedIds.has(u.id)).map((u) => u.id);
          } else {
            userIds = [];
          }

          const usersById = new Map(users.map((u) => [u.id, u]));
          userEmailById = Object.fromEntries(
            userIds.map((id) => [id, usersById.get(id)?.email ?? ""])
          );
        }

        if (userIds.length > 0) {
          const { data: profileList } = await admin
            .from("profiles")
            .select("user_id, display_name")
            .in("user_id", userIds);

          const displayById = new Map((profileList ?? []).map((p) => [p.user_id, p.display_name]));
          userNameById = Object.fromEntries(
            userIds.map((id) => [
              id,
              (displayById.get(id) ?? "").trim() || emailToDisplayName(userEmailById[id]),
            ])
          );
          const missing = userIds
            .filter((id) => {
              const d = displayById.get(id);
              return !d || !String(d).trim();
            })
            .map((id) => ({
              user_id: id,
              display_name: emailToDisplayName(userEmailById[id]),
            }));

          if (missing.length > 0) {
            await admin.from("profiles").upsert(missing, { onConflict: "user_id" });
          }
        }
      } catch {
        // ignore backfill errors
      }
    }

    if (!missingKey) {
      try {
        const permClient = createAdminSupabase();
        const userPerms = await getPermissionsForResource(permClient, user.id, orgId, "users");
        const membershipPerms = await getPermissionsForResource(permClient, user.id, orgId, "memberships");
        userRole = userPerms.role ?? null;
        canReadUsers = userPerms.permissions?.read ?? false;
        canCreateUsers = userPerms.permissions?.create ?? false;
        canUpdateMemberships = membershipPerms.permissions?.update ?? false;
        canDeleteMemberships = membershipPerms.permissions?.delete ?? false;
      } catch {
        // ignore permission lookup failures
      }
    }
    if (isPlatformAdmin) {
      canReadUsers = true;
      canCreateUsers = true;
      canUpdateMemberships = true;
      canDeleteMemberships = true;
      userRole = "admin";
    }
    canEditRoles = isPlatformAdmin || userRole === "admin";

    if (!missingKey) {
      try {
        const admin = createAdminSupabase();
        const { data: roleRows } = await admin
          .from("role_permissions")
          .select("role");
        const roleSet = new Set(baseRoleOptions);
        (roleRows ?? []).forEach((row) => row.role && roleSet.add(row.role));
        roleOptions = [...roleSet];
      } catch {
        roleOptions = [...baseRoleOptions];
      }
    }

    const { data: orgList, error: orgErr } = await listClient
      .from("orgs")
      .select("id, name");

    if (orgErr) {
      membershipsError = orgErr.message;
    } else {
      orgOptions = isPlatformAdmin ? orgList ?? [] : orgId ? (orgList ?? []).filter((o) => o.id === orgId) : [];
      orgNameById = Object.fromEntries((orgList ?? []).map((o) => [o.id, o.name]));
    }

    if (!membershipsError) {

      const unitsQuery = listClient.from("units").select("id, name, org_id").order("name", { ascending: true });
      const { data: unitList, error: unitErr } = orgId
        ? await unitsQuery.eq("org_id", orgId)
        : await unitsQuery.eq("org_id", "00000000-0000-0000-0000-000000000000");

      if (unitErr) {
        membershipsError = unitErr.message;
      } else {
        unitOptions =
          unitList?.map((u) => ({
            id: u.id,
            name: orgId ? u.name : `${orgNameById[u.org_id] ?? "未知組織"} / ${u.name}`,
          })) ?? [];
        unitNameById = Object.fromEntries((unitList ?? []).map((u) => [u.id, u.name]));
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

  if (Object.keys(userNameById).length === 0 && memberships.length > 0) {
    const userIds = Array.from(new Set(memberships.map((m) => m.user_id)));
    const { data: profileList } = await listClient
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    const displayById = new Map((profileList ?? []).map((p) => [p.user_id, p.display_name]));
    userNameById = Object.fromEntries(
      userIds.map((id) => [id, (displayById.get(id) ?? "").trim() || "未知使用者"])
    );
  }

  if (!canReadUsers) {
    return (
      <div className="admin-page">
        <h1>使用者管理</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>使用者管理</h1>

      {user && missingKey && (
        <p>
          缺少 <code>SUPABASE_SERVICE_ROLE_KEY</code>，請在 <code>.env.local</code> 設定。
        </p>
      )}

      {okMsg && <p className="admin-success">{okMsg}</p>}
      {error && <p className="admin-error">{decodeURIComponent(error)}</p>}
      {isPlatformAdmin && (
        <form method="get" className="admin-form-grid" style={{ marginTop: 12 }}>
          <div className="admin-field">
            <label htmlFor="org_id_filter">公司</label>
            <select id="org_id_filter" name="org_id" defaultValue={orgId ?? ""}>
              <option value="">請選擇公司</option>
              {orgOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field" style={{ alignSelf: "end" }}>
            <button type="submit">載入成員</button>
          </div>
        </form>
      )}
      {membershipsError === "no_org_selected" && (
        <p className="admin-error">請先選擇公司後再載入成員列表。</p>
      )}

      {user && !missingKey && canCreateUsers && (
        <form action={createUserAction} className="admin-form-grid" autoComplete="off">
          <div className="admin-field">
            <label htmlFor="email">電子郵件</label>
            <input id="email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="admin-field">
            <label htmlFor="password">密碼</label>
            <input id="password" name="password" type="password" required autoComplete="new-password" />
          </div>
          <div className="admin-field">
            <label htmlFor="display_name">顯示名稱</label>
            <input id="display_name" name="display_name" required autoComplete="off" />
          </div>
          <div className="admin-field">
            <label htmlFor="org_id">公司（選填）</label>
            <select id="org_id" name="org_id" defaultValue={orgId ?? ""}>
              <option value="">略過</option>
              {orgOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="unit_id">部門</label>
            <select id="unit_id" name="unit_id" defaultValue="">
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
          {canEditRoles && (
            <div className="admin-field">
              <label htmlFor="role">權限（選填）</label>
              <select id="role" name="role" defaultValue="">
                <option value="">略過</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit">建立使用者</button>
        </form>
      )}

      {user && (
        <div className="admin-section">
          <h2>使用者權限</h2>

          {!orgId && !membershipsError && !isPlatformAdmin && (
            <p>尚未綁定公司，請先建立成員關係。</p>
          )}
          {membershipsError && <p className="admin-error">{membershipsError}</p>}
          {!membershipsError && memberships.length === 0 && <p>目前沒有成員資料。</p>}

          {!membershipsError && memberships.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>使用者</th>
                  <th>電子郵件</th>
                  <th>部門</th>
                  <th>權限</th>
                  <th>建立時間</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={`${m.user_id}:${m.unit_id}`}>
                    <td>
                      <input
                        name="display_name"
                        defaultValue={userNameById[m.user_id] ?? "未知使用者"}
                        className="admin-inline-input"
                        form={`mem-${m.user_id}-${m.unit_id}`}
                        disabled={!canUpdateMemberships}
                      />
                    </td>
                    <td>{userEmailById[m.user_id] ?? "-"}</td>
                    <td>
                      <select
                        name="unit_id"
                        defaultValue={m.unit_id}
                        className="admin-inline-select"
                        form={`mem-${m.user_id}-${m.unit_id}`}
                        disabled={!canUpdateMemberships}
                      >
                        {unitOptions.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {canEditRoles ? (
                        <form className="admin-inline-actions" action={updateMembershipRoleAction}>
                          <input type="hidden" name="org_id" value={m.org_id} />
                          <input type="hidden" name="current_unit_id" value={m.unit_id} />
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <select name="role" defaultValue={m.role} className="admin-inline-select">
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <button type="submit">修改權限</button>
                        </form>
                      ) : (
                        <div className="admin-inline-meta">{m.role}</div>
                      )}
                    </td>
                    <td>
                      <div className="admin-inline-meta">{new Date(m.created_at).toLocaleString()}</div>
                      <ConfirmForm
                        id={`mem-${m.user_id}-${m.unit_id}`}
                        action={updateMembershipAction}
                        confirmMessage="確定要更新成員資訊？"
                        className="admin-inline-actions"
                      >
                        <input type="hidden" name="org_id" value={m.org_id} />
                        <input type="hidden" name="current_unit_id" value={m.unit_id} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <button type="submit" disabled={!canUpdateMemberships}>修改</button>
                      </ConfirmForm>
                    </td>
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
