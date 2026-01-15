import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getLatestUserOrgId } from "@/lib/org";
import { getPermissionsMapForUser, resources as permissionResources } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (isPlatformAdmin) {
    const permissions = Object.fromEntries(permissionResources.map((r) => [r, true]));
    return NextResponse.json({ ok: true, permissions });
  }

  const orgId = await getLatestUserOrgId(admin, user.id);
  const { permissions } = await getPermissionsMapForUser(admin, user.id, orgId);
  if (!permissions) {
    return NextResponse.json({
      ok: true,
      permissions: Object.fromEntries(permissionResources.map((r) => [r, false])),
    });
  }

  const result = Object.fromEntries(
    permissionResources.map((r) => [r, permissions[r]?.read ?? false])
  );
  return NextResponse.json({ ok: true, permissions: result });
}
