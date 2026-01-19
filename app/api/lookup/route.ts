import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = String(searchParams.get("key") ?? "").trim();

  if (!key) {
    return NextResponse.json({ ok: false, error: "missing_key" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData.user;
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ingestion_logs")
    .select("id, created_at, device_id, payload")
    .eq("user_id", user.id)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, found: false });
  }

  return NextResponse.json({ ok: true, found: true, log: data });
}
