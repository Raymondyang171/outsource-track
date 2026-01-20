import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";
import { reviewNoteTranslation } from "@/app/actions/noteTranslations";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type NoteTranslationRow = {
  id: string;
  org_id: string;
  unit_id: string;
  source_table: string;
  source_id: string;
  source_note: string;
  source_lang: string;
  source_updated_at: string | null;
  target_lang: string;
  translated_note: string;
  translated_by: string;
  translated_at: string;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
};

const statusOptions = ["pending", "verified", "rejected"] as const;

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AdminTranslationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const selectedStatus = getParam(sp?.status) ?? "pending";
  const selectedOrg = getParam(sp?.org_id) ?? "";
  const selectedUnit = getParam(sp?.unit_id) ?? "";
  const selectedTargetLang = getParam(sp?.target_lang) ?? "";

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (e: any) {
    return (
      <div className="admin-page">
        Missing <code>SUPABASE_SERVICE_ROLE_KEY</code>. Configure it in <code>.env.local</code>.
      </div>
    );
  }

  const orgId = isPlatformAdmin ? null : await getLatestUserOrgId(admin, user.id);
  if (!isPlatformAdmin && !orgId) {
    return (
      <div className="admin-page">
        <h1>Note Translations</h1>
        <p className="admin-error">No organization assigned.</p>
      </div>
    );
  }

  let canReview = isPlatformAdmin;
  if (!isPlatformAdmin && orgId) {
    const { data: memberships } = await admin
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id);
    canReview = (memberships ?? []).some((row) => row.role === "admin" || row.role === "manager");
  }

  if (!canReview) {
    return (
      <div className="admin-page">
        <h1>Note Translations</h1>
        <p className="admin-error">Permission denied.</p>
      </div>
    );
  }

  const orgFilter = isPlatformAdmin ? (selectedOrg || null) : orgId;

  let query = admin
    .from("note_translations")
    .select(
      "id, org_id, unit_id, source_table, source_id, source_note, source_lang, source_updated_at, target_lang, translated_note, translated_by, translated_at, status, verified_by, verified_at, verification_note"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (orgFilter) {
    query = query.eq("org_id", orgFilter);
  }
  if (selectedUnit) {
    query = query.eq("unit_id", selectedUnit);
  }
  if (selectedStatus) {
    query = query.eq("status", selectedStatus);
  }
  if (selectedTargetLang) {
    query = query.eq("target_lang", selectedTargetLang);
  }

  const { data: rows, error: listErr } = await query;
  const translations = (rows ?? []) as NoteTranslationRow[];

  const userIds = new Set<string>();
  translations.forEach((row) => {
    if (row.translated_by) userIds.add(row.translated_by);
    if (row.verified_by) userIds.add(row.verified_by);
  });

  const profileMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", Array.from(userIds));
    (profiles ?? []).forEach((profile) => {
      profileMap.set(profile.user_id, profile.display_name ?? profile.user_id);
    });
  }

  return (
    <div className="admin-page">
      <h1>Note Translations</h1>
      {listErr && <p className="admin-error">{listErr.message}</p>}

      <form className="admin-filters" method="get">
        <label>
          Status
          <select name="status" defaultValue={selectedStatus}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target
          <input name="target_lang" defaultValue={selectedTargetLang} placeholder="vi" />
        </label>
        <label>
          Org
          <input name="org_id" defaultValue={selectedOrg} placeholder="org id" />
        </label>
        <label>
          Unit
          <input name="unit_id" defaultValue={selectedUnit} placeholder="unit id" />
        </label>
        <button type="submit" className="admin-button">Apply</button>
      </form>

      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Original Note</th>
              <th>Translated Note</th>
              <th>Status</th>
              <th>Translator</th>
              <th>Reviewed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {translations.length === 0 && (
              <tr>
                <td colSpan={7}>No translations found.</td>
              </tr>
            )}
            {translations.map((row) => (
              <tr key={row.id}>
                <td>
                  <div>{row.source_table}</div>
                  <div className="admin-muted">{row.source_id}</div>
                  <div className="admin-muted">{row.target_lang}</div>
                </td>
                <td>
                  <div className="admin-note">{row.source_note}</div>
                  <div className="admin-muted">{formatDate(row.source_updated_at)}</div>
                </td>
                <td>
                  <div className="admin-note">{row.translated_note}</div>
                </td>
                <td>
                  <div>{row.status}</div>
                  <div className="admin-muted">{formatDate(row.translated_at)}</div>
                </td>
                <td>
                  <div>{profileMap.get(row.translated_by) ?? row.translated_by}</div>
                </td>
                <td>
                  <div>{row.verified_by ? (profileMap.get(row.verified_by) ?? row.verified_by) : "-"}</div>
                  <div className="admin-muted">{formatDate(row.verified_at)}</div>
                </td>
                <td>
                  <form action={reviewNoteTranslation} className="admin-inline">
                    <input type="hidden" name="translation_id" value={row.id} />
                    <input
                      name="verification_note"
                      defaultValue={row.verification_note ?? ""}
                      placeholder="review note"
                      className="admin-input"
                    />
                    <button type="submit" name="decision" value="verified" className="admin-button">
                      Verify
                    </button>
                    <button type="submit" name="decision" value="rejected" className="admin-button admin-danger">
                      Reject
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
