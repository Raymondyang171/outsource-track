import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getLatestUserOrgId } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_TITLE_SELECT =
  "id, org_id, name, is_active, created_by, created_at";

type AuthContext = {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  admin: ReturnType<typeof createAdminSupabase>;
  userId: string;
  orgId: string;
};

type AuthResult =
  | ({ ok: true } & AuthContext)
  | ({ ok: false; status: number; error: string });

async function resolveAuthContext(): Promise<AuthResult> {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();

  if (authErr || !authData.user) {
    return { ok: false, status: 401, error: "not_authenticated" };
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return { ok: false, status: 500, error: "missing_service_role_key" };
  }

  const orgId = await getLatestUserOrgId(admin, authData.user.id);
  if (!orgId) {
    return { ok: false, status: 403, error: "org_not_found" };
  }

  return {
    ok: true,
    supabase,
    admin,
    userId: authData.user.id,
    orgId,
  };
}

function parseIncludeInactive(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("include_inactive");
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function fetchJobTitles(
  admin: AuthContext["admin"],
  orgId: string,
  includeInactive: boolean
) {
  const query = admin
    .from("job_titles")
    .select(JOB_TITLE_SELECT)
    .eq("org_id", orgId)
    .order("name", { ascending: true });

  if (!includeInactive) {
    query.eq("is_active", true);
  }

  return query;
}

export async function GET(request: Request) {
  const auth = await resolveAuthContext();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const includeInactive = parseIncludeInactive(request);
  const { data, error } = await fetchJobTitles(auth.admin, auth.orgId, includeInactive);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "fetch_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, jobTitles: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await resolveAuthContext();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const payload = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = String(payload.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }

  const { data: created, error } = await auth.admin
    .from("job_titles")
    .insert({ name, org_id: auth.orgId, created_by: auth.userId })
    .select(JOB_TITLE_SELECT)
    .maybeSingle();

  if (error) {
    const isDuplicate =
      error.code === "23505" ||
      error.message?.includes("job_titles_org_name_key") ||
      error.details?.includes("job_titles_org_name_key");

    if (isDuplicate) {
      return NextResponse.json({ ok: false, error: "job_title_exists" }, { status: 409 });
    }

    return NextResponse.json(
      { ok: false, error: error.message ?? "insert_failed" },
      { status: 500 }
    );
  }

  if (!created) {
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jobTitle: created });
}
