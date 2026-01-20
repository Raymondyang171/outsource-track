import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureProjectAccess } from "@/lib/guards/ensureProjectAccess";
import { roleRank } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MembershipRow = {
  user_id: string;
  unit_id: string;
  role: string | null;
  units: Array<{ name: string | null }> | { name: string | null } | null;
  profiles: Array<{ display_name: string | null; job_title_id: string | null }> | { display_name: string | null; job_title_id: string | null } | null;
};

type JobTitleMap = Record<string, string>;

function resolveUnitName(row: MembershipRow): string | null {
  if (!row.units) return null;
  if (Array.isArray(row.units)) {
    return row.units[0]?.name ?? null;
  }
  return row.units.name ?? null;
}

function resolveProfile(row: MembershipRow): { display_name: string | null; job_title_id: string | null } | null {
  if (!row.profiles) return null;
  if (Array.isArray(row.profiles)) {
    return row.profiles[0] ?? null;
  }
  return row.profiles;
}

function matchesSearch(value: string | null | undefined, term: string): boolean {
  if (!term) return true;
  if (!value) return false;
  return value.toLowerCase().includes(term);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();

  if (authErr || !authData.user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const guard = await ensureProjectAccess({ client: supabase, projectId });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { data: memberships, error: membershipErr } = await supabase
    .from("memberships")
    .select("user_id, unit_id, role, units(name), profiles(display_name, job_title_id)")
    .eq("org_id", guard.orgId);

  if (membershipErr) {
    return NextResponse.json(
      { ok: false, error: membershipErr.message ?? "membership_list_failed" },
      { status: 500 }
    );
  }

  const rows = (memberships ?? []) as MembershipRow[];
  const jobTitleIds = Array.from(
    new Set(
      rows
        .map((row) => resolveProfile(row)?.job_title_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const jobTitleMap: JobTitleMap = {};
  if (jobTitleIds.length) {
    const { data: jobTitles, error: jobErr } = await supabase
      .from("job_titles")
      .select("id, name")
      .in("id", jobTitleIds)
      .eq("org_id", guard.orgId);
    if (!jobErr && jobTitles) {
      for (const title of jobTitles) {
        if (title.id && title.name) {
          jobTitleMap[title.id] = title.name;
        }
      }
    }
  }

  const searchTerm = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const enriched = rows
    .map((row) => {
      const profile = resolveProfile(row);
      const unitName = resolveUnitName(row);
      const jobTitleId = profile?.job_title_id ?? null;
      const jobTitleName = jobTitleId ? jobTitleMap[jobTitleId] ?? null : null;
      return {
        row,
        displayName: profile?.display_name ?? null,
        unitName,
        jobTitleName,
      };
    })
    .filter(({ displayName, unitName, jobTitleName }) =>
      Boolean(
        matchesSearch(displayName, searchTerm) ||
          matchesSearch(unitName, searchTerm) ||
          matchesSearch(jobTitleName, searchTerm)
      ) || !searchTerm
    )
    .sort((a, b) => {
      const rankA = roleRank[a.row.role ?? ""] ?? Number.MAX_SAFE_INTEGER;
      const rankB = roleRank[b.row.role ?? ""] ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      const nameA = (a.displayName ?? a.row.user_id ?? "").toLowerCase();
      const nameB = (b.displayName ?? b.row.user_id ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    })
    .map(({ row, displayName, unitName, jobTitleName }) => ({
      user_id: row.user_id,
      unit_id: row.unit_id,
      role: row.role,
      display_name: displayName,
      unit_name: unitName,
      job_title: jobTitleName,
    }));

  return NextResponse.json({ ok: true, members: enriched });
}
