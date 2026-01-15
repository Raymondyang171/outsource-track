import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { appendSystemLog } from "@/lib/system-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogPayload = {
  level?: "info" | "warn" | "error";
  message?: string;
  action?: string;
  resource?: string;
  record_id?: string;
  source?: string;
  path?: string;
  meta?: Record<string, any>;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as LogPayload;
  const level = payload.level ?? "info";
  const message = String(payload.message ?? "").trim();

  if (!message) {
    return NextResponse.json({ ok: false, error: "missing_message" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) {
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
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const eventType = level === "error" ? "error" : level === "warn" ? "warn" : "info";

  const insertPayload = {
    event_type: eventType,
    action: payload.action ?? null,
    resource: payload.resource ?? null,
    record_id: payload.record_id ?? null,
    org_id: memRow?.org_id ?? null,
    unit_id: memRow?.unit_id ?? null,
    user_id: authData.user.id,
    user_email: authData.user.email ?? null,
    source: payload.source ?? "client",
    message,
    meta: {
      path: payload.path ?? null,
      ...payload.meta,
    },
  };

  const { error: insertErr } = await admin.from("activity_logs").insert(insertPayload);
  if (insertErr) {
    await appendSystemLog("error", "activity_logs insert failed", {
      error: insertErr.message,
      payload: insertPayload,
    });
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  await appendSystemLog(level, message, insertPayload);

  return NextResponse.json({ ok: true });
}
