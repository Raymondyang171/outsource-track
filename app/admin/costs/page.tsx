import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPermissionsForResource } from "@/lib/permissions";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getLatestUserOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string;
};

type CostRow = {
  project_id: string;
  request_date: string;
  total_amount: number;
  status: string;
  currency: string;
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
  }).format(value);
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function buildMonthOptions() {
  return Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    return { value: String(month).padStart(2, "0"), label: `${month} 月` };
  });
}

function buildYearOptions(currentYear: number) {
  return Array.from({ length: 5 }, (_, idx) => currentYear - idx);
}

export default async function AdminCostsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    project_id?: string;
    year?: string;
    month?: string;
    status?: string;
    currency?: string;
  }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp?.year ?? now.getFullYear());
  const month = sp?.month ? Number(sp.month) : null;
  const projectFilter = sp?.project_id ?? "";
  const statusFilter = sp?.status ?? "approved_paid";
  const currencyFilter = sp?.currency ?? "";

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);

  let dataClient = supabase;
  let adminClient: ReturnType<typeof createAdminSupabase> | null = null;
  try {
    adminClient = createAdminSupabase();
  } catch {
    adminClient = null;
  }
  if (!adminClient) {
    return <div className="page">缺少服務金鑰，無法載入平台資料。</div>;
  }
  if (isPlatformAdmin) {
    dataClient = adminClient;
  }

  let orgId: string | null = null;
  if (!isPlatformAdmin) {
    orgId = await getLatestUserOrgId(adminClient, user.id);
    if (!orgId) {
      return <div className="page">尚未綁定公司，無法載入費用分析。</div>;
    }
  }

  const perms = await getPermissionsForResource(adminClient, user.id, orgId, "costs");
  const canRead = isPlatformAdmin ? true : perms.permissions?.read ?? false;
  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>費用分析</h1>
        <p className="admin-error">目前權限不足，無法檢視。</p>
      </div>
    );
  }

  let projectQuery = dataClient
    .from("projects")
    .select("id, name")
    .order("created_at", { ascending: false });
  if (!isPlatformAdmin) {
    projectQuery = projectQuery.eq("org_id", orgId);
  }
  const { data: projects } = await projectQuery;

  const projectList = (projects ?? []) as ProjectRow[];

  const dateStart = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const dateEnd = month ? new Date(year, month, 0) : new Date(year, 11, 31);

  let query = dataClient
    .from("cost_requests")
    .select("project_id, request_date, total_amount, status, currency")
    .gte("request_date", toDateOnly(dateStart))
    .lte("request_date", toDateOnly(dateEnd))
    .order("request_date", { ascending: true });
  if (!isPlatformAdmin) {
    query = query.eq("org_id", orgId);
  }

  if (projectFilter) {
    query = query.eq("project_id", projectFilter);
  }
  if (statusFilter === "approved_paid") {
    query = query.in("status", ["approved", "paid"]);
  } else if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: costRows } = await query;
  const rows = (costRows ?? []) as CostRow[];
  const currencySet = new Set(rows.map((row) => row.currency).filter(Boolean));
  const effectiveCurrency = currencyFilter || (currencySet.size === 1 ? [...currencySet][0] : "");
  const currencyRows = effectiveCurrency
    ? rows.filter((row) => row.currency === effectiveCurrency)
    : rows;

  const totalAmount = currencyRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const totalCount = currencyRows.length;

  const totalsByProject = new Map<string, number>();
  currencyRows.forEach((row) => {
    totalsByProject.set(
      row.project_id,
      (totalsByProject.get(row.project_id) ?? 0) + Number(row.total_amount || 0)
    );
  });

  const monthlyTotals = Array.from({ length: 12 }, () => 0);
  currencyRows.forEach((row) => {
    const idx = Number(row.request_date.slice(5, 7)) - 1;
    if (idx >= 0 && idx < 12) {
      monthlyTotals[idx] += Number(row.total_amount || 0);
    }
  });

  const dailyTotals = month ? Array.from({ length: getDaysInMonth(year, month) }, () => 0) : [];
  if (month) {
    currencyRows.forEach((row) => {
      const day = Number(row.request_date.slice(8, 10));
      if (day > 0 && day <= dailyTotals.length) {
        dailyTotals[day - 1] += Number(row.total_amount || 0);
      }
    });
  }

  const projectChart = projectList
    .filter((project) => totalsByProject.has(project.id))
    .map((project) => ({ label: project.name, value: totalsByProject.get(project.id) ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const monthlyChart = monthlyTotals.map((value, idx) => ({
    label: `${idx + 1}月`,
    value,
  }));

  const dailyChart = dailyTotals.map((value, idx) => ({
    label: String(idx + 1),
    value,
  }));

  const yearOptions = buildYearOptions(now.getFullYear());
  const monthOptions = buildMonthOptions();

  return (
    <div className="page space-y-6">
      <div className="page-header">
        <div>
          <div className="page-title">費用分析</div>
          <div className="page-subtitle">以專案與時間維度統整專案費用</div>
        </div>
      </div>

      <form className="card-grid" method="get">
        <select className="input" name="project_id" defaultValue={projectFilter}>
          <option value="">全部專案</option>
          {projectList.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select className="input" name="year" defaultValue={String(year)}>
          {yearOptions.map((y) => (
            <option key={y} value={String(y)}>
              {y} 年
            </option>
          ))}
        </select>
        <select className="input" name="month" defaultValue={month ? String(month).padStart(2, "0") : ""}>
          <option value="">全年</option>
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select className="input" name="status" defaultValue={statusFilter}>
          <option value="approved_paid">已核准 + 已付款</option>
          <option value="all">全部狀態</option>
          <option value="draft">草稿</option>
          <option value="submitted">已送出</option>
          <option value="approved">已核准</option>
          <option value="rejected">已退回</option>
          <option value="paid">已付款</option>
          <option value="canceled">已取消</option>
        </select>
        <select className="input" name="currency" defaultValue={currencyFilter}>
          <option value="">全部幣別</option>
          {[...currencySet].map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">
          重新整理
        </button>
      </form>

      {!effectiveCurrency && currencySet.size > 1 && (
        <div className="card">
          <div className="card-title">多幣別提示</div>
          <div className="page-subtitle">目前為多幣別資料，請選擇幣別後再查看圖表。</div>
        </div>
      )}

      <div className="card-grid">
        <div className="card">
          <div className="card-title">總金額</div>
          <div className="page-title">{formatAmount(totalAmount)}</div>
          <div className="page-subtitle">
            本期累計{effectiveCurrency ? ` · ${effectiveCurrency}` : ""}
          </div>
        </div>
        <div className="card">
          <div className="card-title">請款筆數</div>
          <div className="page-title">{totalCount}</div>
          <div className="page-subtitle">本期筆數</div>
        </div>
        <div className="card">
          <div className="card-title">時間區間</div>
          <div className="page-title">
            {toDateOnly(dateStart)} ~ {toDateOnly(dateEnd)}
          </div>
          <div className="page-subtitle">依申請日</div>
        </div>
      </div>

      {effectiveCurrency && (
        <div className="card space-y-4">
          <div className="card-header">
            <div className="card-title">專案費用排行</div>
          </div>
          <BarChart data={projectChart} />
        </div>
      )}

      {effectiveCurrency && (
        <div className="card space-y-4">
          <div className="card-header">
            <div className="card-title">{year} 年月度趨勢</div>
          </div>
          <BarChart data={monthlyChart} />
        </div>
      )}

      {month && effectiveCurrency && (
        <div className="card space-y-4">
          <div className="card-header">
            <div className="card-title">
              {year} 年 {month} 月每日趨勢
            </div>
          </div>
          <BarChart data={dailyChart} dense />
        </div>
      )}
    </div>
  );
}

function BarChart({ data, dense }: { data: Array<{ label: string; value: number }>; dense?: boolean }) {
  const max = data.reduce((acc, item) => Math.max(acc, item.value), 1);
  if (data.length === 0) {
    return <div className="page-subtitle">沒有資料</div>;
  }
  return (
    <div className={`chart ${dense ? "dense" : ""}`}>
      {data.map((item) => (
        <div key={item.label} className={`chart-item ${dense ? "dense" : ""}`}>
          <div className="chart-bar">
            <div className="chart-bar-fill" style={{ height: `${(item.value / max) * 100}%` }} />
          </div>
          <div className="chart-value">{formatAmount(item.value)}</div>
          <div className="chart-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
