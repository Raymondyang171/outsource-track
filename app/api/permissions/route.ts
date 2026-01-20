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

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const cookieStore = await cookies();
  const deviceId = cookieStore.get("device_id")?.value ?? null;
  let deviceApproved = true;
  if (deviceId) {
    const { data: deviceRow } = await admin
      .from("devices")
      .select("approved")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (deviceRow && deviceRow.approved === false) {
      deviceApproved = false;
    }
  }

  if (isPlatformAdmin) {
    const permissions = Object.fromEntries(permissionResources.map((r) => [r, true]));
    return NextResponse.json({
      ok: true,
      permissions,
      navPermissions: permissions,
      activeOrgId: null,
      activeOrgName: null,
      deviceApproved: true,
      needsMembership: false,
    });
  }

  const cookieOrgId = cookieStore.get("active_org_id")?.value ?? null;
  let activeOrgId = cookieOrgId;
  if (!activeOrgId) {
    const { data: profileRow } = await admin
      .from("profiles")
      .select("active_org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    activeOrgId = profileRow?.active_org_id ?? null;
  }
  if (!activeOrgId) {
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
  let activeOrgName: string | null = null;
  if (activeOrgId) {
    const { data: orgRow } = await admin
      .from("orgs")
      .select("name")
      .eq("id", activeOrgId)
      .maybeSingle();
    activeOrgName = orgRow?.name ?? null;
  }

  if (!deviceApproved) {
    const permissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
    const navPermissions = { ...permissions, dashboard: true, devices: true };
    return NextResponse.json({
      ok: true,
      permissions,
      navPermissions,
      activeOrgId,
      activeOrgName,
      deviceApproved: false,
    });
  }

  if (!activeOrgId) {
    const permissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
    return NextResponse.json({
      ok: true,
      permissions,
      navPermissions: permissions,
      activeOrgId: null,
      activeOrgName: null,
      deviceApproved: true,
      needsMembership: true,
    });
  }

  const { permissions } = await getPermissionsMapForUser(admin, user.id, activeOrgId);
  if (!permissions) {
    const navPermissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
    return NextResponse.json({
      ok: true,
      permissions: navPermissions,
      navPermissions,
      activeOrgId,
      activeOrgName,
      deviceApproved: true,
      needsMembership: false,
    });
  }

  const result = Object.fromEntries(
    permissionResources.map((r) => [r, permissions[r]?.read ?? false])
  );
  return NextResponse.json({
    ok: true,
    permissions: result,
    navPermissions: result,
    activeOrgId,
    activeOrgName,
    deviceApproved: true,
    needsMembership: false,
  });
}
