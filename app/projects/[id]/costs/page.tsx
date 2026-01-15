import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import CostRequestsClient from "./CostRequestsClient";
import type { CostAttachment, CostItem, CostRequest, CostType, ProfileMap } from "./types";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string;
  org_id: string;
  unit_id: string;
};

type MembershipRow = {
  role: string;
  unit_id: string;
  created_at: string;
};

function resolveRole(mems: MembershipRow[] | null) {
  if (!mems || mems.length === 0) return null;
  const roleRank: Record<string, number> = { viewer: 0, member: 1, manager: 2, admin: 3 };
  let best = mems[0]?.role ?? null;
  for (const row of mems) {
    if (!row.role) continue;
    if (roleRank[row.role] > roleRank[best ?? "viewer"]) {
      best = row.role;
    }
  }
  return best;
}

export default async function ProjectCostsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let dataClient = supabase;
  if (isPlatformAdmin) {
    try {
      dataClient = createAdminSupabase();
    } catch {
      return <div className="page">缺少服務金鑰，無法載入平台資料。</div>;
    }
  }

  const { data: project, error: projectErr } = await dataClient
    .from("projects")
    .select("id,name,org_id,unit_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return (
      <div className="page">
        {projectErr && <div className="admin-error">{projectErr.message}</div>}
        <div className="card">找不到專案資料。</div>
      </div>
    );
  }

  const { data: memberships } = isPlatformAdmin
    ? { data: [] as MembershipRow[] }
    : await supabase
        .from("memberships")
        .select("role, unit_id, created_at")
        .eq("org_id", project.org_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

  const role = isPlatformAdmin ? "admin" : resolveRole(memberships ?? []);
  const primaryUnitId = memberships?.[0]?.unit_id ?? project.unit_id;

  const { data: costTypes } = await dataClient
    .from("cost_types")
    .select("id, org_id, name, active, created_at")
    .eq("org_id", project.org_id)
    .order("created_at", { ascending: true });

  const { data: requests, error: requestErr } = await dataClient
    .from("cost_requests")
    .select(
      "id, org_id, unit_id, project_id, doc_no, request_date, requested_by, payee_type, payee_name, currency, total_amount, status, submitted_at, approved_at, approved_by, rejected_at, rejected_reason, payment_date, payment_method, note, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .order("request_date", { ascending: false });

  const requestIds = (requests ?? []).map((row) => row.id);
  const { data: items, error: itemsErr } = requestIds.length
    ? await dataClient
        .from("cost_items")
        .select(
          "id, cost_request_id, org_id, unit_id, project_id, project_task_id, expense_type_id, description, qty, uom, unit_price, amount, tax_rate, tax_amount, is_tax_included, incurred_on, used_by, created_at"
        )
        .in("cost_request_id", requestIds)
    : { data: [] as CostItem[], error: null };

  const itemIds = (items ?? []).map((row) => row.id);
  let attachments: CostAttachment[] = [];
  let attachmentsErr: Error | null = null;
  if (requestIds.length || itemIds.length) {
    let query = dataClient
      .from("cost_attachments")
      .select(
        "id, cost_request_id, cost_item_id, org_id, unit_id, uploaded_by, kind, file_name, mime_type, storage_provider, external_file_id, web_view_link, invoice_no, issued_on, created_at"
      );
    if (requestIds.length && itemIds.length) {
      query = query.or(
        `cost_request_id.in.(${requestIds.join(",")}),cost_item_id.in.(${itemIds.join(",")})`
      );
    } else if (requestIds.length) {
      query = query.in("cost_request_id", requestIds);
    } else {
      query = query.in("cost_item_id", itemIds);
    }
    const { data, error } = await query;
    attachments = data ?? [];
    attachmentsErr = error ? new Error(error.message) : null;
  }

  const userIds = new Set<string>();
  (requests ?? []).forEach((row) => {
    if (row.requested_by) userIds.add(row.requested_by);
    if (row.approved_by) userIds.add(row.approved_by);
  });
  (items ?? []).forEach((row) => {
    if (row.used_by) userIds.add(row.used_by);
  });
  attachments.forEach((row) => {
    if (row.uploaded_by) userIds.add(row.uploaded_by);
  });

  const { data: profiles } =
    userIds.size > 0
      ? await dataClient.from("profiles").select("user_id, display_name").in("user_id", [...userIds])
      : { data: [] as Array<{ user_id: string; display_name: string | null }> };

  const profileMap: ProfileMap = {};
  (profiles ?? []).forEach((row) => {
    profileMap[row.user_id] = row.display_name ?? row.user_id;
  });

  const errorMessages = [
    requestErr?.message,
    itemsErr?.message,
    attachmentsErr?.message,
  ].filter(Boolean) as string[];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">專案 {project.name}</div>
          <div className="page-subtitle">切換不同視圖查看專案資訊。</div>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <a className="tab" href={`/projects/${project.id}?tab=dashboard`}>
          儀表板
        </a>
        <a className="tab" href={`/projects/${project.id}?tab=board`}>
          看板
        </a>
        <a className="tab" href={`/projects/${project.id}?tab=timeline`}>
          時間軸
        </a>
        <a className="tab" href={`/projects/${project.id}?tab=files`}>
          檔案
        </a>
        <a className="tab" href={`/projects/${project.id}?tab=settings`}>
          設定
        </a>
        <a className="tab tab-active" href={`/projects/${project.id}/costs`}>
          費用
        </a>
      </div>
      <CostRequestsClient
        project={project as ProjectRow}
        currentUser={{
          id: user.id,
          display_name: profileMap[user.id] ?? user.email ?? user.id,
        }}
        role={role}
        primaryUnitId={primaryUnitId ?? project.unit_id}
        costTypes={(costTypes ?? []) as CostType[]}
        requests={(requests ?? []) as CostRequest[]}
        items={(items ?? []) as CostItem[]}
        attachments={attachments ?? []}
        profiles={profileMap}
        errors={errorMessages}
      />
    </div>
  );
}
