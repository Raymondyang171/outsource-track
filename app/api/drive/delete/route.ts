import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { ensureTaskAccess } from "@/lib/guards/ensureTaskAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  return oauth;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const itemId = String(payload?.item_id ?? "").trim();

  if (!itemId) {
    return NextResponse.json({ ok: false, error: "missing_item_id" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  if (authErr || !authData.user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
  }

  const { data: item, error: itemErr } = await admin
    .from("drive_items")
    .select("id, drive_file_id, org_id, unit_id, project_task_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const taskAccess = await ensureTaskAccess({
    client: admin,
    userId: authData.user.id,
    taskId: item.project_task_id,
    driveItemOrgId: item.org_id,
    driveItemUnitId: item.unit_id,
  });
  if (!taskAccess.ok) {
    return NextResponse.json({ ok: false, error: taskAccess.error }, { status: taskAccess.status });
  }

  if (!isPlatformAdmin) {
    const allowed = await checkPermission(admin, authData.user.id, taskAccess.task.org_id, "files", "delete");
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 });
    }
  }

  const oauth = getOAuthClient();
  if (!oauth) {
    return NextResponse.json({ ok: false, error: "missing_google_oauth" }, { status: 500 });
  }

  const drive = google.drive({ version: "v3", auth: oauth });
  if (item.drive_file_id) {
    try {
      await drive.files.delete({ fileId: item.drive_file_id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "drive_delete_failed";
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
  }

  const { error: deleteErr } = await admin.from("drive_items").delete().eq("id", itemId);
  if (deleteErr) {
    return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
