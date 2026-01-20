import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getLatestUserOrgId } from "@/lib/org";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MANAGEMENT_ROLES = new Set(["admin", "manager"]);
const ORG_LOGO_BUCKET = process.env.SUPABASE_ORG_LOGO_BUCKET || "org-logos";

function getExtension(filename: string) {
  const index = filename.lastIndexOf(".");
  if (index < 0) return "";
  return filename.slice(index).toLowerCase();
}

function normalizeRole(role: unknown) {
  return String(role ?? "").trim().toLowerCase();
}

function resolveMimeType(file: File, extension: string) {
  const inputType = String(file.type || "").toLowerCase();
  if (ALLOWED_MIME_TYPES.has(inputType)) return inputType;

  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";

  return "";
}

function resolveExtension(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

async function ensureManagementRole(
  admin: ReturnType<typeof createAdminSupabase>,
  userId: string,
  orgId: string
) {
  const { data, error } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId);

  if (error || !data || data.length === 0) return false;
  return data.some((row) => MANAGEMENT_ROLES.has(normalizeRole(row.role)));
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const isPlatformAdmin = isPlatformAdminFromAccessToken(
    sessionData.session?.access_token
  );

  if (authErr || !authData.user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }

  const size = file.size ?? 0;
  if (!size) {
    return NextResponse.json({ ok: false, error: "invalid_file" }, { status: 400 });
  }

  if (size > MAX_LOGO_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const extension = getExtension(file.name);
  const mimeType = resolveMimeType(file, extension);
  if (!mimeType || (!ALLOWED_EXTENSIONS.has(extension) && !ALLOWED_MIME_TYPES.has(mimeType))) {
    return NextResponse.json({ ok: false, error: "unsupported_file_type" }, { status: 415 });
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
  }

  const orgIdFromForm = String(form.get("org_id") ?? "").trim();
  const orgId = orgIdFromForm || (await getLatestUserOrgId(admin, authData.user.id));
  if (!orgId) {
    return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 403 });
  }

  if (!isPlatformAdmin) {
    const hasManagementRole = await ensureManagementRole(admin, authData.user.id, orgId);
    if (!hasManagementRole) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const finalExt = ALLOWED_EXTENSIONS.has(extension) ? extension : resolveExtension(mimeType);
  const filePath = `orgs/${orgId}/logo-${Date.now()}${finalExt}`;

  const { error: uploadErr } = await admin.storage.from(ORG_LOGO_BUCKET).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (uploadErr) {
    return NextResponse.json(
      { ok: false, error: uploadErr.message ?? "upload_failed" },
      { status: 500 }
    );
  }

  const { error: updateErr } = await admin
    .from("orgs")
    .update({ logo_path: filePath, logo_url: null })
    .eq("id", orgId);

  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: updateErr.message ?? "update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, logo_path: filePath });
}
