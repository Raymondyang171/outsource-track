"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { isOrgAdminOrUnitMember } from "@/lib/permissions";

type GenericStringError = {
  error: true;
} & String;


type NoteSourceTable = "progress_logs" | "assist_requests" | "cost_requests";

type SourceNote = {
  id: string;
  org_id: string;
  unit_id: string;
  to_unit_id?: string | null;
  note: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const allowedSourceTables: NoteSourceTable[] = ["progress_logs", "assist_requests", "cost_requests"];

const sourceSelectMap: Record<NoteSourceTable, string> = {
  progress_logs: "id, org_id, unit_id, note, created_at",
  assist_requests: "id, org_id, unit_id, to_unit_id, note, updated_at, created_at",
  cost_requests: "id, org_id, unit_id, note, updated_at, created_at",
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLang(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

async function fetchSourceNote(
  client: Awaited<ReturnType<typeof createServerSupabase>>,
  sourceTable: NoteSourceTable,
  sourceId: string
): Promise<SourceNote | GenericStringError | null> {
  const { data, error } = await client
    .from(sourceTable)
    .select(sourceSelectMap[sourceTable])
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !data) return null;
  return data as any;
}

async function canTranslateNote(
  client: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  orgId: string,
  unitId: string,
  toUnitId?: string | null
) {
  if (await isOrgAdminOrUnitMember(client, userId, orgId, unitId)) return true;
  if (toUnitId) {
    return await isOrgAdminOrUnitMember(client, userId, orgId, toUnitId);
  }
  return false;
}

export async function createNoteTranslation(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;
  if (authErr || !user) {
    redirect("/login");
  }

  const sourceTableRaw = asText(formData.get("source_table"));
  const sourceId = asText(formData.get("source_id"));
  const translatedNote = asText(formData.get("translated_note"));
  const sourceLang = normalizeLang(asText(formData.get("source_lang")), "zh-Hant");
  const targetLang = normalizeLang(asText(formData.get("target_lang")), "vi");

  if (!sourceTableRaw || !sourceId || !translatedNote) return;
  if (!allowedSourceTables.includes(sourceTableRaw as NoteSourceTable)) return;

  const sourceTable = sourceTableRaw as NoteSourceTable;
  const source = await fetchSourceNote(supabase, sourceTable, sourceId);
  if (!source || 'error' in source) return;
  if (!source.org_id || !source.unit_id) return;
  if (!source.note || !source.note.trim()) return;

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  const allowed = isPlatformAdmin || await canTranslateNote(
    supabase,
    user.id,
    source.org_id,
    source.unit_id,
    source.to_unit_id ?? null
  );
  if (!allowed) return;

  const sourceUpdatedAt = source.updated_at ?? source.created_at ?? null;

  const { data: pendingRow } = await supabase
    .from("note_translations")
    .select("id")
    .eq("source_table", sourceTable)
    .eq("source_id", sourceId)
    .eq("target_lang", targetLang)
    .eq("translated_by", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    org_id: source.org_id,
    unit_id: source.unit_id,
    to_unit_id: source.to_unit_id ?? null,
    source_table: sourceTable,
    source_id: sourceId,
    source_note: source.note.trim(),
    source_lang: sourceLang,
    source_updated_at: sourceUpdatedAt,
    target_lang: targetLang,
    translated_note: translatedNote,
    translated_by: user.id,
    translated_at: new Date().toISOString(),
    status: "pending",
    updated_at: new Date().toISOString(),
  };

  if (pendingRow?.id) {
    await supabase
      .from("note_translations")
      .update(payload)
      .eq("id", pendingRow.id);
  } else {
    await supabase.from("note_translations").insert(payload);
  }

  revalidatePath("/admin/translations");
}

export async function reviewNoteTranslation(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData.user;
  if (authErr || !user) {
    redirect("/login");
  }

  const translationId = asText(formData.get("translation_id"));
  const decision = asText(formData.get("decision"));
  const verificationNote = asText(formData.get("verification_note"));

  if (!translationId) return;
  if (decision !== "verified" && decision !== "rejected") return;

  const payload = {
    status: decision,
    verified_by: user.id,
    verified_at: new Date().toISOString(),
    verification_note: verificationNote || null,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("note_translations")
    .update(payload)
    .eq("id", translationId)
    .eq("status", "pending");

  revalidatePath("/admin/translations");
}
