import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerSupabase } from "@/lib/supabase/server";

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
  if (authErr || !authData.user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const { data: item, error: itemErr } = await supabase
    .from("drive_items")
    .select("thumbnail_link")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item?.thumbnail_link) {
    return NextResponse.json({ ok: false, error: "thumbnail_not_found" }, { status: 404 });
  }

  const oauth = getOAuthClient();
  if (!oauth) {
    return NextResponse.json({ ok: false, error: "missing_google_oauth" }, { status: 500 });
  }

  const token = await oauth.getAccessToken();
  const accessToken = token?.token;
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "access_token_failed" }, { status: 502 });
  }

  const thumbRes = await fetch(item.thumbnail_link, {
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
