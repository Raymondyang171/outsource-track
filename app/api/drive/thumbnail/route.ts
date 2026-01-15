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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("item_id");

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
    .select("thumbnail_link, drive_file_id, org_id, unit_id, project_task_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) {
    return NextResponse.json({ ok: false, error: "thumbnail_not_found" }, { status: 404 });
  }

  if (!item) {
    return NextResponse.json({ ok: false, error: "thumbnail_not_found" }, { status: 404 });
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
    const allowed = await checkPermission(admin, authData.user.id, taskAccess.task.org_id, "files", "read");
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 });
    }
  }

  const oauth = getOAuthClient();
  if (!oauth) {
    return NextResponse.json({ ok: false, error: "missing_google_oauth" }, { status: 500 });
  }

  const drive = google.drive({ version: "v3", auth: oauth });

  let thumbnailLink = item?.thumbnail_link ?? null;
  if (!thumbnailLink && item?.drive_file_id) {
    try {
      const fileRes = await drive.files.get({
        fileId: item.drive_file_id,
        fields: "thumbnailLink",
      });
      thumbnailLink = fileRes.data.thumbnailLink ?? null;
      if (thumbnailLink) {
        await admin
          .from("drive_items")
          .update({ thumbnail_link: thumbnailLink })
          .eq("id", itemId);
      }
    } catch {
      // ignore thumbnail refresh errors
    }
  }

  if (!thumbnailLink) {
    return NextResponse.json({ ok: false, error: "thumbnail_not_found" }, { status: 404 });
  }

  const token = await oauth.getAccessToken();
  const accessToken = token?.token;
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "access_token_failed" }, { status: 502 });
  }

  const thumbRes = await fetch(thumbnailLink, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!thumbRes.ok) {
    return NextResponse.json({ ok: false, error: "thumbnail_fetch_failed" }, { status: 502 });
  }

  const contentType = thumbRes.headers.get("content-type") || "image/jpeg";
  const buffer = await thumbRes.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
