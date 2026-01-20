"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeSwitcher from "@/components/theme-switcher";
import LogoutButton from "@/components/logout-button";
import SidebarToggle from "@/components/sidebar-toggle";
import { createBrowserClientClient, supabaseBrowserClient } from "@/lib/supabase/browser";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { safeFetch } from "@/lib/api-client";

const maskId = (value: string | null | undefined) => {
  if (!value) return null;
  if (value.length <= 12) return "***";
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
};

type AppShellProps = {
  children: React.ReactNode;
  userEmail: string | null;
  userInitial: string;
  isPlatformAdmin: boolean;
  navPermissions: Record<string, boolean> | null;
  activeOrgId?: string | null;
  activeOrgName?: string | null;
};

export default function AppShell({
  children,
  userEmail,
  userInitial,
  isPlatformAdmin,
  navPermissions,
  activeOrgId,
  activeOrgName,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === "/login" || pathname.startsWith("/login/");
  const serverNavPerms = navPermissions;
  const [authState, setAuthState] = useState<"unknown" | "authed" | "guest">("unknown");
  const [clientUserEmail, setClientUserEmail] = useState<string | null>(userEmail);
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [clientUserInitial, setClientUserInitial] = useState(userInitial);
  const [clientIsPlatformAdmin, setClientIsPlatformAdmin] = useState(isPlatformAdmin);
  const [clientNavPerms, setClientNavPerms] = useState(serverNavPerms);
  const [clientRole, setClientRole] = useState<string | null>(null);
  const [clientOrgName, setClientOrgName] = useState<string | null>(activeOrgName ?? null);
  const [clientOrgLogoUrl, setClientOrgLogoUrl] = useState<string | null>(null);
  const [clientDisplayName, setClientDisplayName] = useState<string | null>(null);
  const [clientJobTitle, setClientJobTitle] = useState<string | null>(null);
  const [clientUnitName, setClientUnitName] = useState<string | null>(null);
  const [clientDeviceApproved, setClientDeviceApproved] = useState<boolean | null>(null);
  const [hasMembership, setHasMembership] = useState<boolean | null>(null);
  const [permissionsError, setPermissionsError] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const bootstrapOnceRef = useRef(false);
  const lastBootstrapUserIdRef = useRef<string | null>(null);
  const authStateRef = useRef<"unknown" | "authed" | "guest">("unknown");
  const [authReloadToken, setAuthReloadToken] = useState(0);
  const navReady = bootstrapStatus === "ready";
  const resolvedUnitName = clientUnitName ?? "未指派部門";
  const resolvedDisplayName = clientDisplayName ?? "使用者";
  const resolvedJobTitle = clientJobTitle ?? "未設定職稱";
  const userLabel =
    authState === "authed"
      ? `${resolvedUnitName}-${resolvedDisplayName}-${resolvedJobTitle}`
      : "未登入";
  const orgLabel =
    clientOrgName ?? (hasMembership === false ? "尚未加入公司" : "未設定公司");
  const logoutTimerRef = useRef<number | null>(null);
  const canRead = (resource: string) =>
    clientIsPlatformAdmin || (clientNavPerms ? clientNavPerms[resource] === true : false);

  useEffect(() => {
    setClientNavPerms(serverNavPerms);
  }, [serverNavPerms]);

  useEffect(() => {
    const prev = authStateRef.current;
    if (prev === "unknown" && authState === "authed") {
      setAuthReloadToken((value) => value + 1);
    }
    authStateRef.current = authState;
  }, [authState]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (typeof window === "undefined") return;
    if (authState !== "authed") return;

    const supabase = supabaseBrowserClient;
    const inactivityLimitMs = 30 * 60 * 1000;
    const activityKey = "last-activity";

    const clearTimer = () => {
      if (logoutTimerRef.current) {
        window.clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };

    const signOutAndRedirect = async () => {
      clearTimer();
      window.sessionStorage.removeItem(activityKey);
      await supabase.auth.signOut();
      window.location.href = "/login";
    };

    const scheduleLogout = () => {
      clearTimer();
      const lastActivity = Number(window.sessionStorage.getItem(activityKey) ?? Date.now());
      const remaining = inactivityLimitMs - (Date.now() - lastActivity);
      if (remaining <= 0) {
        void signOutAndRedirect();
        return;
      }
      logoutTimerRef.current = window.setTimeout(() => {
        void signOutAndRedirect();
      }, remaining);
    };

    const markActivity = () => {
      window.sessionStorage.setItem(activityKey, Date.now().toString());
      scheduleLogout();
    };

    if (!window.sessionStorage.getItem(activityKey)) {
      window.sessionStorage.setItem(activityKey, Date.now().toString());
    }
    scheduleLogout();

    const events: Array<keyof WindowEventMap> = [
      "click",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((eventName) =>
      window.addEventListener(eventName, markActivity, { passive: true })
    );

    const handleVisibility = () => {
      if (!document.hidden) {
        markActivity();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimer();
      events.forEach((eventName) =>
        window.removeEventListener(eventName, markActivity)
      );
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authState, isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    const supabase = supabaseBrowserClient;
    let cancelled = false;

    const resolveRole = async (supabase: ReturnType<typeof createBrowserClientClient>, userId: string) => {
      const { data: mems } = await supabase
        .from("memberships")
        .select("role, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const rank: Record<string, number> = { viewer: 0, member: 1, manager: 2, admin: 3 };
      let best: string | null = null;
      let bestRank = -1;
      (mems ?? []).forEach((row) => {
        const role = String(row.role ?? "").trim();
        if (!role) return;
        const score = rank[role] ?? 0;
        if (score > bestRank) {
          best = role;
          bestRank = score;
        }
      });
      return best;
    };

    const syncUser = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionData.session?.user) {
        setAuthState("authed");
        setClientUserId(sessionData.session.user.id);
        setClientUserEmail(sessionData.session.user.email ?? null);
        setClientUserInitial(sessionData.session.user.email?.[0]?.toUpperCase() ?? "G");
        setClientIsPlatformAdmin(
          isPlatformAdminFromAccessToken(sessionData.session.access_token)
        );
        console.debug("[AppShell][auth-trace] session user", {
          hasUser: true,
          email: maskId(sessionData.session.user.email ?? null),
        });
        const role = await resolveRole(supabase, sessionData.session.user.id);
        if (!cancelled) {
          setClientRole(role);
        }
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!error && data.user) {
        setAuthState("authed");
        setClientUserId(data.user.id);
        setClientUserEmail(data.user.email ?? null);
        setClientUserInitial(data.user.email?.[0]?.toUpperCase() ?? "G");
        setClientIsPlatformAdmin(false);
        console.debug("[AppShell][auth-trace] getUser fallback", {
          hasUser: true,
          email: maskId(data.user.email ?? null),
        });
        const role = await resolveRole(supabase, data.user.id);
        if (!cancelled) {
          setClientRole(role);
        }
        return;
      }

      window.setTimeout(() => {
        if (!cancelled) {
          setAuthState("guest");
        }
      }, 600);
    };

    void syncUser();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          setAuthState("guest");
          setClientUserId(null);
          setClientIsPlatformAdmin(false);
          setClientRole(null);
          setClientNavPerms(null);
          setAuthReloadToken((value) => value + 1);
          return;
        }
        setAuthState("authed");
        setClientUserId(session.user.id);
        setClientUserEmail(session.user.email ?? null);
        setClientUserInitial(session.user.email?.[0]?.toUpperCase() ?? "G");
        setClientIsPlatformAdmin(isPlatformAdminFromAccessToken(session.access_token));
        console.debug("[AppShell][auth-trace] auth state change", {
          event,
          hasUser: true,
          email: maskId(session.user.email ?? null),
        });
        setAuthReloadToken((value) => value + 1);
        void resolveRole(supabase, session.user.id).then((role) => {
          setClientRole(role);
        });
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (!clientUserId) {
      lastBootstrapUserIdRef.current = null;
      bootstrapOnceRef.current = false;
      setBootstrapStatus("idle");
      setPermissionsError(false);
      return;
    }
    if (clientUserId !== lastBootstrapUserIdRef.current) {
      lastBootstrapUserIdRef.current = clientUserId;
      bootstrapOnceRef.current = false;
      setClientNavPerms(null);
      setClientOrgName(null);
      setClientOrgLogoUrl(null);
      setHasMembership(null);
      setBootstrapStatus("loading");
      setPermissionsError(false);
      setAuthReloadToken((value) => value + 1);
    }
  }, [clientUserId, isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (authState !== "authed") return;
    if (clientNavPerms !== null) return;
    bootstrapOnceRef.current = false;
    setBootstrapStatus("loading");
    setPermissionsError(false);
    setAuthReloadToken((value) => value + 1);
  }, [authState, clientNavPerms, isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (bootstrapOnceRef.current) return;
    const supabase = supabaseBrowserClient;
    let cancelled = false;

    const bootstrap = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sessionData.session) return;
      bootstrapOnceRef.current = true;
      setBootstrapStatus("loading");
      try {
        setPermissionsError(false);
        const response = await safeFetch("/api/permissions", { cache: "no-store" });
        if (cancelled) return;
        if (!response.ok) {
          setPermissionsError(true);
          setBootstrapStatus("error");
          return;
        }
        const data = await response.json();
        if (cancelled) return;
        setClientDeviceApproved(data?.deviceApproved ?? true);
        if (data?.permissions) {
          setClientNavPerms(data.permissions);
          if (data?.activeOrgName) {
            setClientOrgName(data.activeOrgName);
          }
          if (data?.needsMembership === true) {
            setHasMembership(false);
          }
          const permissionKeys = Object.keys(data.permissions ?? {});
          const enabledCount = permissionKeys.filter((key) => data.permissions?.[key]).length;
          console.debug("[AppShell][auth-trace] permissions fetched", {
            ok: response.ok,
            total: permissionKeys.length,
            enabled: enabledCount,
          });
        }
        setBootstrapStatus("ready");
        return;
      } catch {
        if (!cancelled) {
          setPermissionsError(true);
          setBootstrapStatus("error");
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authReloadToken, isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (authState === "guest") {
      setClientOrgName(null);
      setClientOrgLogoUrl(null);
      setClientDisplayName(null);
      setClientJobTitle(null);
      setClientUnitName(null);
      setHasMembership(null);
      return;
    }

    let cancelled = false;
    const supabase = supabaseBrowserClient;

    const loadProfileContext = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId || cancelled) return;

      const { data: membershipRows } = await supabase
        .from("memberships")
        .select("org_id, unit_id, role, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      const membership = membershipRows?.[0];
      if (!cancelled) {
        setHasMembership(!!membership?.org_id);
      }
      console.debug("[AppShell][auth-trace] membership resolved", {
        orgId: maskId(membership?.org_id ?? null),
        unitId: maskId(membership?.unit_id ?? null),
        role: membership?.role ?? null,
      });

      if (membership?.org_id) {
        const { data: orgRow } = await supabase
          .from("orgs")
          .select("id, name, logo_url")
          .eq("id", membership.org_id)
          .maybeSingle();
        if (!cancelled) {
          setClientOrgName(orgRow?.name ?? null);
          setClientOrgLogoUrl(orgRow?.logo_url ?? null);
        }
      } else if (!cancelled) {
        setClientOrgName(null);
        setClientOrgLogoUrl(null);
      }

      if (membership?.unit_id) {
        const { data: unitRow } = await supabase
          .from("units")
          .select("id, name")
          .eq("id", membership.unit_id)
          .maybeSingle();
        if (!cancelled) {
          setClientUnitName(unitRow?.name ?? null);
        }
      } else if (!cancelled) {
        setClientUnitName(null);
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("display_name, job_title_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) {
        setClientDisplayName(profileRow?.display_name ?? null);
      }

      if (profileRow?.job_title_id) {
        const { data: titleRow } = await supabase
          .from("job_titles")
          .select("name")
          .eq("id", profileRow.job_title_id)
          .maybeSingle();
        if (!cancelled) {
          setClientJobTitle(titleRow?.name ?? null);
        }
      } else if (!cancelled) {
        setClientJobTitle(null);
      }
    };

    void loadProfileContext();
    return () => {
      cancelled = true;
    };
  }, [authState, authReloadToken, isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (authState !== "authed") return;
    const start = Date.now();
    const timeouts = [0, 1000, 3000].map((delayMs) =>
      window.setTimeout(() => {
        console.debug("[AppShell][auth-trace] snapshot", {
          tMs: Date.now() - start,
          authState,
          isPlatformAdmin: clientIsPlatformAdmin,
          orgName: clientOrgName ?? null,
          unitName: clientUnitName ?? null,
          role: clientRole,
          navPermsReady: clientNavPerms ? true : false,
          navPermsCount: clientNavPerms ? Object.keys(clientNavPerms).length : 0,
        });
      }, delayMs)
    );
    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [
    authState,
    clientIsPlatformAdmin,
    clientNavPerms,
    clientOrgName,
    clientRole,
    clientUnitName,
    isLoginRoute,
  ]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (authState === "unknown") return;

    if (authState === "guest") {
      window.sessionStorage.removeItem("last-activity");
      const pending = Number(window.sessionStorage.getItem("auth-pending") ?? "0");
      if (pending && Date.now() - pending < 5000) {
        return;
      }
      router.replace("/login");
      return;
    }

    if (authState === "authed") {
      window.sessionStorage.removeItem("auth-pending");
    }

    if (pathname === "/") {
      router.replace("/dashboard");
    }
  }, [authState, isLoginRoute, pathname, router]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (authState !== "authed") return;

    const sendLog = (payload: Record<string, any>) => {
      try {
        const body = JSON.stringify(payload);
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon("/api/logs", blob);
          return;
        }
        void safeFetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch {
        // ignore logging failures
      }
    };

    const handleError = (event: ErrorEvent) => {
      sendLog({
        level: "error",
        message: event.message || "window_error",
        source: "client",
        path: window.location.pathname,
        meta: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack ?? null,
        },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      sendLog({
        level: "error",
        message: reason?.message ?? String(reason ?? "unhandled_rejection"),
        source: "client",
        path: window.location.pathname,
        meta: {
          stack: reason?.stack ?? null,
        },
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [authState, isLoginRoute]);
  const navContent = (
    <>
      {authState === "guest" && (
        <>
          <a className="nav-item" href="/">
            首頁
          </a>
          <a className="nav-item" href="/login">
            登入
          </a>
        </>
      )}
      {authState === "authed" && (
        <>
          <a className="nav-item" href="/dashboard">
            儀表板
          </a>
          {clientDeviceApproved === false ? (
            <>
              <a className="nav-item" href="/device/register">
                設備申請
              </a>
              <a className="nav-item" href="/settings">
                個人設定
              </a>
            </>
          ) : (
            <>
              {canRead("projects") && (
                <a className="nav-item" href="/projects">
                  專案
                </a>
              )}
              {(canRead("tasks") || canRead("projects")) && (
                <details className="nav-group">
                  <summary className="nav-summary">專案管理</summary>
                  {canRead("tasks") && (
                    <a className="nav-item" href="/admin/tasks">
                      任務
                    </a>
                  )}
                  {canRead("projects") && (
                    <a className="nav-item" href="/admin/projects">
                      專案列表
                    </a>
                  )}
                </details>
              )}

              {(canRead("users") ||
                canRead("roles") ||
                canRead("companies") ||
                canRead("departments") ||
                canRead("cost_types") ||
                canRead("devices") ||
                canRead("costs") ||
                canRead("logs")) && (
                <details className="nav-group">
                  <summary className="nav-summary">公司設定</summary>
                  {canRead("users") && (
                    <a className="nav-item" href="/admin/users">
                      使用者
                    </a>
                  )}
                  {canRead("roles") && (
                    <a className="nav-item" href="/admin/roles">
                      權限設定
                    </a>
                  )}
                  {canRead("logs") && (
                    <a className="nav-item" href="/admin/logs">
                      系統記錄
                    </a>
                  )}
                  {clientIsPlatformAdmin && canRead("companies") && (
                    <a className="nav-item" href="/admin/orgs">
                      公司
                    </a>
                  )}
                  {canRead("departments") && (
                    <a className="nav-item" href="/admin/units">
                      部門
                    </a>
                  )}
                  {canRead("cost_types") && (
                    <a className="nav-item" href="/admin/cost-types">
                      費用類型
                    </a>
                  )}
                  {canRead("devices") && (
                    <a className="nav-item" href="/admin/devices">
                      設備授權
                    </a>
                  )}
                  {canRead("costs") && (
                    <a className="nav-item" href="/admin/costs">
                      費用分析
                    </a>
                  )}
                </details>
              )}
              <a className="nav-item" href="/settings">
                個人設定
              </a>
            </>
          )}
        </>
      )}
    </>
  );
  const sidebarContent = authState === "guest" || navReady ? (
    <div className="sidebar-content">
      <div className="sidebar-brand">
        <div className="brand-mark">
          {clientOrgLogoUrl ? (
            <img
              src={clientOrgLogoUrl}
              alt={clientOrgName ? `${clientOrgName} logo` : "org logo"}
              style={{ width: 36, height: 36, objectFit: "contain" }}
            />
          ) : (
            <span>{clientOrgName?.[0]?.toUpperCase() ?? "OT"}</span>
          )}
        </div>
        <div>
          <div>{orgLabel}</div>
          <div className="sidebar-meta">公司空間</div>
        </div>
      </div>

      <div className="sidebar-meta">
        <div>{userLabel}</div>
        <div>{authState === "authed" ? "已登入" : "請先登入"}</div>
      </div>
      {authState === "authed" && clientDeviceApproved === false && (
        <div className="sidebar-meta">此設備尚未核准，部分功能暫不可用</div>
      )}

      <nav className="sidebar-nav">{navContent}</nav>
    </div>
  ) : bootstrapStatus === "error" ? (
    <div className="sidebar-content">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <span>!</span>
        </div>
        <div>
          <div>讀取權限失敗</div>
          <div className="sidebar-meta">請重新整理</div>
        </div>
      </div>
      {authState === "authed" && (
        <nav className="sidebar-nav">
          <a className="nav-item" href="/dashboard">
            儀表板
          </a>
        </nav>
      )}
    </div>
  ) : (
    <div className="sidebar-content">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <span>…</span>
        </div>
        <div>
          <div>載入中</div>
          <div className="sidebar-meta">請稍候</div>
        </div>
      </div>
      {authState === "authed" && (
        <nav className="sidebar-nav">
          <a className="nav-item" href="/dashboard">
            儀表板
          </a>
        </nav>
      )}
    </div>
  );

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (authState === "unknown") {
    return null;
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        {navReady && <div className="sidebar-mini">{clientOrgName?.[0]?.toUpperCase() ?? "OT"}</div>}
        {sidebarContent}
        <SidebarToggle />
      </aside>

      <div className="app-frame">
        <header className="app-topbar">
          <div className="topbar-left">
            <input className="search-input" placeholder="搜尋專案、任務或成員" />
            <span className="badge">Workspace</span>
          </div>
          <div className="topbar-right">
            <ThemeSwitcher />
            {authState === "authed" && <LogoutButton className="btn btn-ghost" />}
            <a className="btn btn-ghost" href="/admin/projects">
              新建專案
            </a>
            <div className="badge">{clientUserInitial}</div>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
