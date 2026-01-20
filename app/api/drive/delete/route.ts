import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { ensureTaskAccess } from "@/lib/guards/ensureTaskAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function isInvalidGrantError(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  const anyErr = err as { response?: { status?: number; data?: any } };
  const status = anyErr?.response?.status;
  const data = anyErr?.response?.data;
  const errorValue = typeof data?.error === "string" ? data.error : "";
  return status === 400 && (errorValue === "invalid_grant" || message.includes("invalid_grant"));
}

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
    return errorResponse("missing_item_id", "missing_item_id", 400);
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  if (authErr || !authData.user) {
    return errorResponse("not_authenticated", "not_authenticated", 401);
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return errorResponse("missing_service_role_key", "missing_service_role_key", 500);
  }

  const { data: item, error: itemErr } = await admin
    .from("drive_items")
    .select("id, drive_file_id, org_id, unit_id, project_task_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return errorResponse("item_not_found", "item_not_found", 404);
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
    return errorResponse(taskAccess.error, taskAccess.error, taskAccess.status);
  }

  const oauth = getOAuthClient();
  if (!oauth) {
    return errorResponse("missing_google_oauth", "missing_google_oauth", 500);
  }

  const drive = google.drive({ version: "v3", auth: oauth });
  if (item.drive_file_id) {
    try {
      await drive.files.delete({ fileId: item.drive_file_id });
    } catch (err: unknown) {
      if (isInvalidGrantError(err)) {
        return NextResponse.json(
          { code: "NEED_REAUTH", provider: "google", traceId: randomUUID() },
          { status: 401 }
        );
      }
      const message = err instanceof Error ? err.message : "drive_delete_failed";
      return errorResponse("drive_delete_failed", message, 502);
    }
  }

  const { error: deleteErr } = await admin.from("drive_items").delete().eq("id", itemId);
  if (deleteErr) {
    return errorResponse("db_delete_failed", deleteErr.message, 500);
  }

  return NextResponse.json({ ok: true });
}
