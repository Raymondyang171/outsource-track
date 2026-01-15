"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeSwitcher from "@/components/theme-switcher";
import LogoutButton from "@/components/logout-button";
import SidebarToggle from "@/components/sidebar-toggle";
import { createBrowserClientClient } from "@/lib/supabase/browser";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

type AppShellProps = {
  children: React.ReactNode;
  userEmail: string | null;
  userInitial: string;
  isPlatformAdmin: boolean;
  navPermissions: Record<string, boolean> | null;
};

export default function AppShell({
  children,
  userEmail,
  userInitial,
  isPlatformAdmin,
  navPermissions,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === "/login" || pathname.startsWith("/login/");
  const [authState, setAuthState] = useState<"unknown" | "authed" | "guest">("unknown");
  const [clientUserEmail, setClientUserEmail] = useState<string | null>(userEmail);
  const [clientUserInitial, setClientUserInitial] = useState(userInitial);
  const [clientIsPlatformAdmin, setClientIsPlatformAdmin] = useState(isPlatformAdmin);
  const [clientNavPerms, setClientNavPerms] = useState(navPermissions);
  const [clientRole, setClientRole] = useState<string | null>(null);
  const userLabel = clientUserEmail ?? "未登入";
  const logoutTimerRef = useRef<number | null>(null);
  const canRead = (resource: string) =>
    clientIsPlatformAdmin || (clientNavPerms ? clientNavPerms[resource] === true : false);

  useEffect(() => {
    setClientNavPerms(navPermissions);
  }, [navPermissions]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (typeof window === "undefined") return;
    if (authState !== "authed") return;

    const supabase = createBrowserClientClient();
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
    const supabase = createBrowserClientClient();
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
        setClientUserEmail(sessionData.session.user.email ?? null);
        setClientUserInitial(sessionData.session.user.email?.[0]?.toUpperCase() ?? "G");
        setClientIsPlatformAdmin(
          isPlatformAdminFromAccessToken(sessionData.session.access_token)
        );
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
        setClientUserEmail(data.user.email ?? null);
        setClientUserInitial(data.user.email?.[0]?.toUpperCase() ?? "G");
        setClientIsPlatformAdmin(false);
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
          setClientIsPlatformAdmin(false);
          setClientRole(null);
          setClientNavPerms(null);
          return;
        }
        setAuthState("authed");
        setClientUserEmail(session.user.email ?? null);
        setClientUserInitial(session.user.email?.[0]?.toUpperCase() ?? "G");
        setClientIsPlatformAdmin(isPlatformAdminFromAccessToken(session.access_token));
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
    if (authState !== "authed") return;

    let cancelled = false;
    const syncPermissions = async () => {
      try {
        const response = await fetch("/api/permissions");
        const data = await response.json();
        if (!cancelled && response.ok && data?.permissions) {
          setClientNavPerms(data.permissions);
        }
      } catch {
        // ignore permissions fetch failures
      }
    };
    void syncPermissions();
    return () => {
      cancelled = true;
    };
  }, [authState, isLoginRoute]);

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
        void fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
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
      <a className="nav-item" href="/">
        首頁
      </a>
      {canRead("projects") && (
        <a className="nav-item" href="/projects">
          專案
        </a>
      )}
      <a className="nav-item" href="/dashboard">
        儀表板
      </a>
      {authState !== "authed" && (
        <a className="nav-item" href="/login">
          登入
        </a>
      )}

      {authState === "authed" && (
        <>
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
              {canRead("companies") && (
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
  );
  const sidebarContent = (
    <div className="sidebar-content">
      <div className="sidebar-brand">
        <div className="brand-mark">OT</div>
        <div>
          <div>Outsource Track</div>
          <div className="sidebar-meta">Asana-style workspace</div>
        </div>
      </div>

      <div className="sidebar-meta">
        <div>{userLabel}</div>
        <div>{authState === "authed" ? "已登入" : "請先登入"}</div>
      </div>

      <nav className="sidebar-nav">{navContent}</nav>
    </div>
  );

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (authState === "unknown") {
    return null;
  }

  if (authState === "guest") {
    return null;
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-mini">OT</div>
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
