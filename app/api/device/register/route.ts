import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegisterPayload = {
  device_id?: string;
  device_name?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as RegisterPayload;
  const deviceId = String(payload.device_id ?? "").trim();
  const deviceName = String(payload.device_name ?? "").trim();

  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "missing_device_id" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData.user;
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
  }

  const { data: memRow } = await admin
    .from("memberships")
    .select("org_id, unit_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!memRow?.org_id || !memRow?.unit_id) {
    return NextResponse.json({ ok: false, error: "org_not_resolved" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent");

  const upsertPayload = {
    user_id: user.id,
    user_email: user.email ?? null,
    org_id: memRow.org_id,
    unit_id: memRow.unit_id,
    device_id: deviceId,
    device_name: deviceName || null,
    user_agent: userAgent,
    last_seen_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertErr } = await admin
    .from("devices")
    .upsert(upsertPayload, { onConflict: "user_id,device_id" })
    .select("approved")
    .maybeSingle();

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  const approved = upserted?.approved ?? false;
  const response = NextResponse.json({ ok: true, approved });
  response.cookies.set({
    name: "device_id",
    value: deviceId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return response;
}
