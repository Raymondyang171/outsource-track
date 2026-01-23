import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPermissionsMapForUser, resources as permissionResources } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  const { searchParams } = new URL(request.url);
  const queryOrgId = searchParams.get("org_id");
  const cookieStore = await cookies();

  const countEnabled = (perms?: Record<string, boolean> | null) =>
    Object.values(perms ?? {}).filter(Boolean).length;

  if (!user || authErr) {
    console.log("[perm-api]", {
      mode: "error_auth",
      activeOrgId: null,
      queryOrgId,
      cookieOrgId: cookieStore.get("active_org_id")?.value ?? null,
      userId: user?.id ?? null,
      isPlatformAdmin: false,
      deviceApproved: null,
      permErr: authErr?.message ?? null,
      enabledCount: 0,
      role: null,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "not_authenticated",
        mode: "error_auth",
        diag: { mode: "auth_fail", err: authErr?.message },
      },
      { status: 401 },
    );
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (err: any) {
    console.log("[perm-api]", {
      mode: "error_admin_client",
      activeOrgId: null,
      queryOrgId,
      cookieOrgId: cookieStore.get("active_org_id")?.value ?? null,
      userId: user?.id ?? null,
      isPlatformAdmin: false,
      deviceApproved: null,
      permErr: err?.message ?? null,
      enabledCount: 0,
      role: "memberships.role(bestRank)",
    });
    return NextResponse.json(
      {
        ok: false,
        error: "missing_service_role_key",
        mode: "error_admin_client",
        diag: { mode: "admin_client_fail", err: err?.message },
      },
      { status: 500 },
    );
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const deviceId = cookieStore.get("device_id")?.value ?? null;
  let deviceApproved = true;
  if (deviceId) {
    const { data: deviceRow, error: deviceErr } = await admin
      .from("devices")
      .select("approved")
      .eq("user_id", user.id) // FIX: Be specific to the current user
      .eq("device_id", deviceId)
      .maybeSingle();

    if (deviceErr) {
      console.error("[permissions] failed to query device", { error: deviceErr });
    }

    // A specific record for this user/device exists and is explicitly not approved
    if (deviceRow && deviceRow.approved === false) {
      deviceApproved = false;
    }
    // If deviceRow is null, we let it pass, as the middleware should be the primary gate.
    // This API just provides a hint to the frontend.
  }
  
  const diagBase = {
    userId: user.id,
    isPlatformAdmin,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (isPlatformAdmin) {
    const permissions = Object.fromEntries(permissionResources.map((r) => [r, true]));
    console.log("[perm-api]", {
      mode: "resolved",
      activeOrgId: null,
      queryOrgId,
      cookieOrgId,
      userId: user.id,
      isPlatformAdmin,
      deviceApproved: true,
      permErr: null,
      enabledCount: countEnabled(permissions),
      role: "platform_admin",
    });
    return NextResponse.json({
      ok: true,
      mode: "resolved",
      permissions,
      navPermissions: permissions,
      activeOrgId: null,
      activeOrgName: null,
      deviceApproved: true,
      needsMembership: false,
      diag: { ...diagBase, mode: "platform_admin" },
    });
  }

  const cookieOrgId = cookieStore.get("active_org_id")?.value ?? null;
  let activeOrgId = queryOrgId || cookieOrgId;
  let orgResolutionMode = queryOrgId ? "query" : (cookieOrgId ? "cookie" : "none");
  let orgMismatchFixed = false;
  let oldOrgId: string | null = null;
  let newOrgId: string | null = null;

  if (!activeOrgId) {
    orgResolutionMode = "profile_fallback";
    const { data: profileRow } = await admin
      .from("profiles")
      .select("active_org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    activeOrgId = profileRow?.active_org_id ?? null;
  }
  if (!activeOrgId) {
    orgResolutionMode = "membership_fallback";
    const { data: membershipRows } = await admin
      .from("memberships")
      .select("org_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const fallbackOrgId = membershipRows?.[0]?.org_id ?? null;
    if (fallbackOrgId) {
      await admin.from("profiles").update({ active_org_id: fallbackOrgId }).eq("user_id", user.id);
      cookieStore.set("active_org_id", fallbackOrgId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        secure: process.env.NODE_ENV === "production",
      });
      activeOrgId = fallbackOrgId;
    }
  }
  if (activeOrgId) {
    const { data: membershipRow } = await admin
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("org_id", activeOrgId)
      .maybeSingle();

    if (!membershipRow) {
      const { data: membershipRows } = await admin
        .from("memberships")
        .select("org_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const fallbackOrgId = membershipRows?.[0]?.org_id ?? null;
      if (fallbackOrgId) {
        oldOrgId = activeOrgId;
        newOrgId = fallbackOrgId;
        activeOrgId = fallbackOrgId;
        orgMismatchFixed = true;
        cookieStore.set("active_org_id", fallbackOrgId, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30,
          secure: process.env.NODE_ENV === "production",
        });
      }
    }
  }
  let activeOrgName: string | null = null;
  if (activeOrgId) {
    const { data: orgRow } = await admin
      .from("orgs")
      .select("name")
      .eq("id", activeOrgId)
      .maybeSingle();
    activeOrgName = orgRow?.name ?? null;
  }
  
  const diag = {
    ...diagBase,
    mode: orgResolutionMode,
    activeOrgId,
    ...(orgMismatchFixed
      ? { org_mismatch_fixed: true, old_org_id: oldOrgId, new_org_id: newOrgId }
      : {}),
  };

  if (!deviceApproved) {
    const permissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
    const navPermissions = { ...permissions, dashboard: true, devices: true };
    console.log("[perm-api]", {
      mode: "fallback_device_not_approved",
      activeOrgId,
      queryOrgId,
      cookieOrgId,
      userId: user.id,
      isPlatformAdmin,
      deviceApproved,
      permErr: null,
      enabledCount: countEnabled(navPermissions),
      role: "memberships.role(bestRank)",
    });
    return NextResponse.json({
      ok: true,
      mode: "fallback_device_not_approved",
      permissions,
      navPermissions,
      activeOrgId,
      activeOrgName,
      deviceApproved: false,
      diag: { ...diag, mode: "device_not_approved" },
    });
  }

  if (!activeOrgId) {
    const permissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
    const navPermissions = { ...permissions, dashboard: true };
    console.log("[perm-api]", {
      mode: "fallback_no_org_found",
      activeOrgId: null,
      queryOrgId,
      cookieOrgId,
      userId: user.id,
      isPlatformAdmin,
      deviceApproved,
      permErr: null,
      enabledCount: countEnabled(navPermissions),
      role: "memberships.role(bestRank)",
    });
    return NextResponse.json({
      ok: true,
      mode: "fallback_no_org_found",
      permissions,
      navPermissions,
      activeOrgId: null,
      activeOrgName: null,
      deviceApproved: true,
      needsMembership: true,
      diag: { ...diag, mode: "no_org_found" },
    });
  }

  const { permissions, error: permErr, role } = await getPermissionsMapForUser(admin, user.id, activeOrgId);
  if (!permissions || permErr) {
    const navPermissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
    const fallbackNavPermissions = { ...navPermissions, dashboard: true };
    console.log("[perm-api]", {
      mode: "fallback_get_perms_fail",
      activeOrgId,
      queryOrgId,
      cookieOrgId,
      userId: user.id,
      isPlatformAdmin,
      deviceApproved,
      permErr: permErr?.message ?? null,
      enabledCount: countEnabled(fallbackNavPermissions),
      role: role ?? "memberships.role(bestRank)",
    });
    return NextResponse.json({
      ok: true,
      mode: "fallback_get_perms_fail",
      permissions: navPermissions,
      navPermissions: fallbackNavPermissions,
      activeOrgId,
      activeOrgName,
      deviceApproved: true,
      needsMembership: false,
      diag: { ...diag, mode: "get_perms_fail", err: permErr?.message },
    });
  }

  const result = Object.fromEntries(
    permissionResources.map((r) => [r, permissions[r]?.read ?? false])
  );
  console.log("[perm-api]", {
    mode: "resolved",
    activeOrgId,
    queryOrgId,
    cookieOrgId,
    userId: user.id,
    isPlatformAdmin,
    deviceApproved,
    permErr: null,
    enabledCount: countEnabled(result),
    role: role ?? "memberships.role(bestRank)",
  });
  return NextResponse.json({
    ok: true,
    mode: "resolved",
    permissions: result,
    navPermissions: result,
    activeOrgId,
    activeOrgName,
    deviceApproved: true,
    needsMembership: false,
    diag: { ...diag, mode: "success" },
  });
}
