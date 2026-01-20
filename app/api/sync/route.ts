import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncPayload = {
  idempotency_key?: string;
  device_id?: string;
  payload?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SyncPayload & Record<string, unknown>;
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";

  if (!idempotencyKey) {
    return NextResponse.json({ ok: false, error: "missing_idempotency_key" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const cookieDeviceId = cookieStore.get("device_id")?.value ?? "";
  const deviceIdFromBody = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const deviceId = (deviceIdFromBody || cookieDeviceId).trim();

  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "missing_device_id" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData.user;
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const { data: device, error: deviceErr } = await supabase
    .from("devices")
    .select("org_id, unit_id, approved")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (deviceErr || !device) {
    return NextResponse.json({ ok: false, error: "device_not_registered" }, { status: 403 });
  }

  if (!device.approved) {
    return NextResponse.json({ ok: false, error: "device_not_approved" }, { status: 403 });
  }

  if (!device.org_id || !device.unit_id) {
    return NextResponse.json({ ok: false, error: "org_not_resolved" }, { status: 403 });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("ingestion_logs")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ ok: true, deduped: true, log_id: existing.id, created_at: existing.created_at });
  }

  const payload = Object.prototype.hasOwnProperty.call(body, "payload") ? body.payload : body;
  const insertPayload = {
    org_id: device.org_id,
    unit_id: device.unit_id,
    user_id: user.id,
    device_id: deviceId,
    idempotency_key: idempotencyKey,
    payload: payload ?? {},
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("ingestion_logs")
    .insert(insertPayload)
    .select("id, created_at")
    .maybeSingle();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: retry } = await supabase
        .from("ingestion_logs")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (retry) {
        return NextResponse.json({ ok: true, deduped: true, log_id: retry.id, created_at: retry.created_at });
      }
    }

    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deduped: false, log_id: inserted?.id, created_at: inserted?.created_at });
}
