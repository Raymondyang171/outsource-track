
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // 此路由已停用 - 功能重複且有權限問題
  return NextResponse.json({ error: "Route disabled" }, { status: 410 });

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  const { org_id, unit_id, name, start_date, status } = await req.json();

  if (!org_id || !unit_id || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const adminClient = createAdminSupabase();
  const userOrgId = isPlatformAdmin ? null : await getLatestUserOrgId(adminClient, user.id);
  if (!isPlatformAdmin && (!userOrgId || org_id !== userOrgId)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const allowed = isPlatformAdmin || await checkPermission(adminClient, user.id, org_id, "projects", "create");
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const { error } = await adminClient.from("projects").insert({
    org_id: org_id,
    unit_id: unit_id,
    name,
    start_date: start_date || undefined,
    status: status || undefined,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: "created" });
}
