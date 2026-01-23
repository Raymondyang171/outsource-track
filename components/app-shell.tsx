"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeSwitcher from "@/components/theme-switcher";
import LogoutButton from "@/components/logout-button";
import SidebarToggle from "@/components/sidebar-toggle";
import { createBrowserClientClient, supabaseBrowserClient } from "@/lib/supabase/browser";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { safeFetch } from "@/lib/api-client";

console.debug("[SHELL_MARK] loaded", { file: "components/app-shell.tsx" });

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
  console.log("[Sidebar] component function called");
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
  const [clientOrgId, setClientOrgId] = useState<string | null>(activeOrgId ?? null);
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
  const hasResolvedNavRef = useRef(false);
  const [authReloadToken, setAuthReloadToken] = useState(0);
  const navReady = bootstrapStatus === "ready";

  // Monitor bootstrapStatus changes
  useEffect(() => {
    console.debug("[BOOTSTRAP_DEBUG] bootstrapStatus changed to:", bootstrapStatus);
  }, [bootstrapStatus]);

  // If we have serverNavPerms and bootstrap hasn't completed, set status to ready as fallback
  useEffect(() => {
    if (isLoginRoute) return;
    if (authState === "unknown") return;

    // If bootstrap is stuck in loading and we have server nav perms, use them
    if (serverNavPerms && bootstrapStatus === "loading" && clientNavPerms === null) {
      // Wait a bit to see if bootstrap completes
      const timeoutId = window.setTimeout(() => {
        console.debug("[BOOTSTRAP_DEBUG] Fallback: Setting clientNavPerms from server and marking ready", {
          authState,
          bootstrapStatus,
          serverNavPermsKeys: Object.keys(serverNavPerms).length,
        });
        setClientNavPerms(serverNavPerms);
        setBootstrapStatus("ready");
      }, 2000); // Wait 2 seconds

      return () => window.clearTimeout(timeoutId);
    }
  }, [isLoginRoute, authState, serverNavPerms, clientNavPerms, bootstrapStatus]);
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
  const sidebarNavPerms =
    clientNavPerms ?? (hasResolvedNavRef.current ? {} : serverNavPerms ?? {});
  const sidebarNavSource = clientNavPerms
    ? "clientNavPerms"
    : hasResolvedNavRef.current
      ? "none"
      : serverNavPerms
        ? "serverNavPerms"
        : "none";
  const sidebarTrueKeys = Object.keys(sidebarNavPerms ?? {}).filter(
    (key) => sidebarNavPerms?.[key] === true
  );
  const sidebarTrueKeysAttr = sidebarTrueKeys.join(",");
  const navPermsReady = navReady;
  const appshellBranch = isLoginRoute
    ? "BR_LOGIN"
    : authState === "unknown"
      ? "BR_AUTH_UNKNOWN"
      : "BR_RENDER_OK";
  const sidebarBranch =
    authState === "guest" || navReady
      ? "BR_SIDEBAR_READY"
      : bootstrapStatus === "error"
        ? "BR_SIDEBAR_ERROR"
        : "BR_SIDEBAR_LOADING";
  console.log("[DEBUG] sidebarBranch decision:", {
    authState,
    navReady,
    bootstrapStatus,
    sidebarBranch,
  });
  const canRead = (resource: string) =>
    clientIsPlatformAdmin || (sidebarNavPerms ? sidebarNavPerms[resource] === true : false);
  const navDecisions = useMemo(
    () => [
      { key: "dashboard", canRead: canRead("dashboard"), href: "/dashboard" },
      { key: "projects", canRead: canRead("projects"), href: "/projects" },
      { key: "tasks", canRead: canRead("tasks"), href: "/admin/tasks" },
      { key: "projects_admin", canRead: canRead("projects"), href: "/admin/projects" },
      { key: "users", canRead: canRead("users"), href: "/admin/users" },
      { key: "roles", canRead: canRead("roles"), href: "/admin/roles" },
      { key: "companies", canRead: canRead("companies"), href: "/admin/orgs" },
      { key: "departments", canRead: canRead("departments"), href: "/admin/units" },
      { key: "cost_types", canRead: canRead("cost_types"), href: "/admin/cost-types" },
      { key: "devices", canRead: canRead("devices"), href: "/admin/devices" },
      { key: "costs", canRead: canRead("costs"), href: "/admin/costs" },
      { key: "logs", canRead: canRead("logs"), href: "/admin/logs" },
    ],
    [clientIsPlatformAdmin, sidebarNavPerms]
  );

  useEffect(() => {
    if (isLoginRoute) return;
    const trueKeys = Object.keys(clientNavPerms ?? {}).filter(
      (key) => clientNavPerms?.[key] === true
    );
    console.debug("[perm-ui] sidebar nav trueKeys =", trueKeys);
    console.debug(
      "[perm-ui] sidebar nav projects/tasks =",
      String(clientNavPerms?.projects === true),
      String(clientNavPerms?.tasks === true)
    );
    console.debug("[perm-ui] sidebar nav raw =", JSON.stringify(clientNavPerms ?? null));
  }, [clientNavPerms, isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    console.table(navDecisions);
    console.debug(
      "[nav-probe] trueKeys =",
      navDecisions.filter((entry) => entry.canRead).map((entry) => entry.key)
    );
  }, [navDecisions, isLoginRoute]);

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
      setClientOrgId(null);
      setClientOrgName(null);
      setClientOrgLogoUrl(null);
      setHasMembership(null);
      setBootstrapStatus("loading");
      setPermissionsError(false);
      setAuthReloadToken((value) => value + 1);
    }
  }, [clientUserId, isLoginRoute]);

  useEffect(() => {
    console.debug("[BOOTSTRAP_DEBUG] useEffect #2 triggered", {
      isLoginRoute,
      authState,
      clientNavPerms: !!clientNavPerms,
      clientNavPermsKeys: clientNavPerms ? Object.keys(clientNavPerms).length : 0,
    });
    if (isLoginRoute) return;
    if (authState !== "authed") return;
    if (clientNavPerms !== null) {
      console.debug("[BOOTSTRAP_DEBUG] useEffect #2 - clientNavPerms not null, checking if bootstrap needed");
      // If we have server nav perms but bootstrap hasn't run yet, we should still run it
      // to set the status to "ready"
      if (bootstrapStatus === "idle" || bootstrapStatus === "loading") {
        console.debug("[BOOTSTRAP_DEBUG] useEffect #2 - bootstrap needed even with clientNavPerms");
        bootstrapOnceRef.current = false;
        setAuthReloadToken((value) => value + 1);
      }
      return;
    }
    bootstrapOnceRef.current = false;
    setBootstrapStatus("loading");
    setPermissionsError(false);
    setAuthReloadToken((value) => value + 1);
  }, [authState, clientNavPerms, isLoginRoute, bootstrapStatus]);

  useEffect(() => {
    console.debug("[BOOTSTRAP_DEBUG] useEffect triggered", {
      isLoginRoute,
      bootstrapOnceCurrent: bootstrapOnceRef.current,
      authReloadToken,
      clientOrgId,
    });
    if (isLoginRoute) {
      console.debug("[BOOTSTRAP_DEBUG] useEffect exit - isLoginRoute");
      return;
    }
    if (bootstrapOnceRef.current) {
      console.debug("[BOOTSTRAP_DEBUG] useEffect exit - bootstrapOnceRef is true");
      return;
    }
    const supabase = supabaseBrowserClient;
    let cancelled = false;

    const bootstrap = async () => {
      try {
        console.debug("[BOOTSTRAP_DEBUG] Bootstrap function started");
        console.debug("[BOOTSTRAP_DEBUG] About to call supabase.auth.getSession()");
        const { data: sessionData } = await supabase.auth.getSession();
        console.debug("[BOOTSTRAP_DEBUG] Got session data:", !!sessionData.session);
        if (cancelled) {
          console.debug("[BOOTSTRAP_DEBUG] Bootstrap cancelled (1)");
          return;
        }
        if (!sessionData.session) {
          console.debug("[BOOTSTRAP_DEBUG] Bootstrap exit - no session, using serverNavPerms if available");
          // If we have server nav perms but no session yet, use them
          if (serverNavPerms) {
            setClientNavPerms(serverNavPerms);
            setBootstrapStatus("ready");
          }
          return;
        }
        bootstrapOnceRef.current = true;
        setBootstrapStatus("loading");
        console.debug("[BOOTSTRAP_DEBUG] Set status to 'loading'");
        try {
        setPermissionsError(false);
        const url = clientOrgId ? `/api/permissions?org_id=${clientOrgId}` : "/api/permissions";
        console.debug("[BOOTSTRAP_DEBUG] Fetching:", url);
        const response = await safeFetch(url, { cache: "no-store" });
        if (cancelled) {
          console.debug("[BOOTSTRAP_DEBUG] Bootstrap cancelled (2)");
          return;
        }
        if (!response.ok) {
          console.debug("[BOOTSTRAP_DEBUG] API response not OK, setting error");
          setPermissionsError(true);
          setBootstrapStatus("error");
          return;
        }
        const data = await response.json();
        console.debug("[BOOTSTRAP_DEBUG] API response JSON:", {
          ok: data.ok,
          mode: data.mode,
          hasNavPermissions: !!data.navPermissions,
          hasPermissions: !!data.permissions,
          diagMode: data.diag?.mode,
        });
        if (cancelled) {
          console.debug("[BOOTSTRAP_DEBUG] Bootstrap cancelled (3)");
          return;
        }
        setClientDeviceApproved(data?.deviceApproved ?? true);

        // Use navPermissions for UI, fall back to permissions
        const permsForNav = data.navPermissions || data.permissions;
        const trueKeys = Object.keys(permsForNav ?? {}).filter((key) => permsForNav?.[key] === true);
        console.debug("[perm-ui] api->nav trueKeys =", trueKeys);
        console.debug("[perm-ui] api->nav raw =", JSON.stringify(permsForNav ?? null));
        const permissionKeys = Object.keys(permsForNav ?? {});
        const enabledCount = permissionKeys.filter((key) => permsForNav?.[key]).length;
        const prevEnabledCount = Object.keys(clientNavPerms ?? {}).filter(
          (key) => clientNavPerms?.[key]
        ).length;
        const navMode = data?.mode ?? data?.diag?.mode;
        const isResolved = navMode === "resolved";

        console.debug("[BOOTSTRAP_DEBUG] Step 1 - API response parsed:", {
          hasNavPermissions: !!data.navPermissions,
          hasPermissions: !!data.permissions,
          permsForNav: !!permsForNav,
          permsForNavKeys: Object.keys(permsForNav ?? {}).length,
          navMode,
          isResolved,
          hasResolvedNavRef: hasResolvedNavRef.current,
          enabledCount,
          prevEnabledCount,
        });

        if (!isResolved && enabledCount === 0 && data.ok === true) {
          console.debug("[BOOTSTRAP_DEBUG] Early return #1 - enabled=0", { diag: data.diag });
          console.debug("[AppShell] Skipping nav update with enabled=0", { diag: data.diag });
          setBootstrapStatus("ready"); // Mark as ready but don't update nav
          return;
        }

        if (!isResolved && enabledCount < prevEnabledCount) {
          console.debug("[BOOTSTRAP_DEBUG] Early return #2 - downgrade", {
            diag: data.diag,
            mode: navMode,
            enabled: enabledCount,
            prevEnabled: prevEnabledCount,
          });
          console.debug("[AppShell] Skipping nav downgrade", {
            diag: data.diag,
            mode: navMode,
            enabled: enabledCount,
            prevEnabled: prevEnabledCount,
          });
          setBootstrapStatus("ready");
          return;
        }

        if (!isResolved && hasResolvedNavRef.current) {
          console.debug("[BOOTSTRAP_DEBUG] Early return #3 - hasResolvedNavRef", {
            diag: data.diag,
            mode: navMode,
            hasResolvedNavRefCurrent: hasResolvedNavRef.current,
          });
          console.debug("[AppShell] Skipping fallback nav update after resolved", {
            diag: data.diag,
            mode: navMode,
          });
          setBootstrapStatus("ready");
          return;
        }

        console.debug("[BOOTSTRAP_DEBUG] Step 2 - Checking condition:", {
          permsForNav: !!permsForNav,
          isResolved,
          hasResolvedNavRefCurrent: hasResolvedNavRef.current,
          conditionA: !!permsForNav,
          conditionB: isResolved || !hasResolvedNavRef.current,
          willEnterIf: !!(permsForNav && (isResolved || !hasResolvedNavRef.current)),
        });

        if (permsForNav && (isResolved || !hasResolvedNavRef.current)) {
          console.debug("[BOOTSTRAP_DEBUG] Step 3 - ENTERED if block, will update nav perms");
          console.debug("[perm-ui] setClientNavPerms before", {
            mode: navMode,
            activeOrgId: data?.activeOrgId ?? null,
            trueKeys,
          });
          setClientNavPerms(permsForNav);
          console.debug("[perm-ui] setClientNavPerms after", {
            mode: navMode,
            activeOrgId: data?.activeOrgId ?? null,
            trueKeys,
          });
          if (isResolved) {
            hasResolvedNavRef.current = true;
          }
          if (data?.activeOrgName) {
            setClientOrgName(data.activeOrgName);
          }
          if (data?.needsMembership === true) {
            setHasMembership(false);
          }
          console.debug("[AppShell][auth-trace] permissions fetched", {
            ok: response.ok,
            source: data.navPermissions ? "nav" : "perm",
            total: permissionKeys.length,
            enabled: enabledCount,
            diag: data.diag,
          });
        } else {
          console.debug("[BOOTSTRAP_DEBUG] Step 3 - SKIPPED if block, condition not met");
        }

        console.debug("[BOOTSTRAP_DEBUG] Step 4 - About to call setBootstrapStatus('ready')");
        setBootstrapStatus("ready");
        console.debug("[BOOTSTRAP_DEBUG] Step 5 - Called setBootstrapStatus('ready')");
        return;
        } catch (innerError) {
          console.error("[BOOTSTRAP_DEBUG] Inner catch - API fetch/parse error:", innerError);
          if (!cancelled) {
            setPermissionsError(true);
            setBootstrapStatus("error");
          }
        }
      } catch (outerError) {
        console.error("[BOOTSTRAP_DEBUG] Outer catch - Session error:", outerError);
        if (!cancelled && serverNavPerms) {
          console.debug("[BOOTSTRAP_DEBUG] Using serverNavPerms as fallback after error");
          setClientNavPerms(serverNavPerms);
          setBootstrapStatus("ready");
        } else if (!cancelled) {
          setPermissionsError(true);
          setBootstrapStatus("error");
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authReloadToken, clientOrgId, isLoginRoute, serverNavPerms]);

  useEffect(() => {
    if (isLoginRoute) return;
    if (authState === "guest") {
      setClientOrgId(null);
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
        setClientOrgId(membership?.org_id ?? null);
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
          <div data-nav-key="home" data-nav-href="/" style={{ display: "contents" }}>
            <a className="nav-item" href="/">
              首頁
            </a>
          </div>
          <div data-nav-key="login" data-nav-href="/login" style={{ display: "contents" }}>
            <a className="nav-item" href="/login">
              登入
            </a>
          </div>
        </>
      )}
      {authState === "authed" && (
        <>
          <div data-nav-key="dashboard" data-nav-href="/dashboard" style={{ display: "contents" }}>
            <a className="nav-item" href="/dashboard">
              儀表板
            </a>
          </div>
          {clientDeviceApproved === false ? (
            <>
              <div
                data-nav-key="device_register"
                data-nav-href="/device/register"
                style={{ display: "contents" }}
              >
                <a className="nav-item" href="/device/register">
                  設備申請
                </a>
              </div>
              <div data-nav-key="settings" data-nav-href="/settings" style={{ display: "contents" }}>
                <a className="nav-item" href="/settings">
                  個人設定
                </a>
              </div>
            </>
          ) : (
            <>
              {canRead("projects") && (
                <div data-nav-key="projects" data-nav-href="/projects" style={{ display: "contents" }}>
                  <a className="nav-item" href="/projects">
                    專案
                  </a>
                </div>
              )}
              {/* 此路由已停用 - 功能重複且有權限問題 */}

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
                    <div data-nav-key="users" data-nav-href="/admin/users" style={{ display: "contents" }}>
                      <a className="nav-item" href="/admin/users">
                        使用者
                      </a>
                    </div>
                  )}
                  {canRead("roles") && (
                    <div data-nav-key="roles" data-nav-href="/admin/roles" style={{ display: "contents" }}>
                      <a className="nav-item" href="/admin/roles">
                        權限設定
                      </a>
                    </div>
                  )}
                  {canRead("logs") && (
                    <div data-nav-key="logs" data-nav-href="/admin/logs" style={{ display: "contents" }}>
                      <a className="nav-item" href="/admin/logs">
                        系統記錄
                      </a>
                    </div>
                  )}
                  {clientIsPlatformAdmin && canRead("companies") && (
                    <div data-nav-key="companies" data-nav-href="/admin/orgs" style={{ display: "contents" }}>
                      <a className="nav-item" href="/admin/orgs">
                        公司
                      </a>
                    </div>
                  )}
                  {canRead("departments") && (
                    <div data-nav-key="departments" data-nav-href="/admin/units" style={{ display: "contents" }}>
                      <a className="nav-item" href="/admin/units">
                        部門
                      </a>
                    </div>
                  )}
                  {canRead("cost_types") && (
                    <div
                      data-nav-key="cost_types"
                      data-nav-href="/admin/cost-types"
                      style={{ display: "contents" }}
                    >
                      <a className="nav-item" href="/admin/cost-types">
                        費用類型
                      </a>
                    </div>
                  )}
                  {canRead("devices") && (
                    <div data-nav-key="devices" data-nav-href="/admin/devices" style={{ display: "contents" }}>
                      <a className="nav-item" href="/admin/devices">
                        設備授權
                      </a>
                    </div>
                  )}
                  {canRead("costs") && (
                    <div data-nav-key="costs" data-nav-href="/admin/costs" style={{ display: "contents" }}>
                      <a className="nav-item" href="/admin/costs">
                        費用分析
                      </a>
                    </div>
                  )}
                </details>
              )}
              <div data-nav-key="settings" data-nav-href="/settings" style={{ display: "contents" }}>
                <a className="nav-item" href="/settings">
                  個人設定
                </a>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
  const sidebarContent = authState === "guest" || navReady ? (
    <div
      className="sidebar-content"
      data-clip-probe="1"
      data-clip-overflow="unknown"
      data-clip-h="unknown"
    >
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

      <nav
        className="sidebar-nav"
        data-sidebar-probe="1"
        data-sidebar-branch={sidebarBranch}
        data-truekeys={sidebarTrueKeysAttr.slice(0, 160)}
      >
        {navContent}
      </nav>
    </div>
  ) : bootstrapStatus === "error" ? (
    <div
      className="sidebar-content"
      data-clip-probe="1"
      data-clip-overflow="unknown"
      data-clip-h="unknown"
    >
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
        <nav
          className="sidebar-nav"
          data-sidebar-probe="1"
          data-sidebar-branch={sidebarBranch}
          data-truekeys={sidebarTrueKeysAttr.slice(0, 160)}
        >
          <div data-nav-key="dashboard" data-nav-href="/dashboard" style={{ display: "contents" }}>
            <a className="nav-item" href="/dashboard">
              儀表板
            </a>
          </div>
        </nav>
      )}
    </div>
  ) : (
    <div
      className="sidebar-content"
      data-clip-probe="1"
      data-clip-overflow="unknown"
      data-clip-h="unknown"
    >
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
        <nav
          className="sidebar-nav"
          data-sidebar-probe="1"
          data-sidebar-branch={sidebarBranch}
          data-truekeys={sidebarTrueKeysAttr.slice(0, 160)}
        >
          <div data-nav-key="dashboard" data-nav-href="/dashboard" style={{ display: "contents" }}>
            <a className="nav-item" href="/dashboard">
              儀表板
            </a>
          </div>
        </nav>
      )}
    </div>
  );

  if (isLoginRoute) {
    return (
      <>
        <div
          data-appshell-probe="1"
          data-appshell-branch={appshellBranch}
          data-route={pathname}
          data-authstate={authState}
          data-bootstrap={bootstrapStatus}
          data-navready={String(navPermsReady)}
          data-deviceapproved={String(clientDeviceApproved)}
          data-navsource={sidebarNavSource}
          data-truekeys={sidebarTrueKeysAttr.slice(0, 160)}
          style={{ display: "none" }}
        />
        {children}
      </>
    );
  }

  if (authState === "unknown") {
    return (
      <div
        data-appshell-probe="1"
        data-appshell-branch={appshellBranch}
        data-route={pathname}
        data-authstate={authState}
        data-bootstrap={bootstrapStatus}
        data-navready={String(navPermsReady)}
        data-deviceapproved={String(clientDeviceApproved)}
        data-navsource={sidebarNavSource}
        data-truekeys={sidebarTrueKeysAttr.slice(0, 160)}
        style={{ display: "none" }}
      />
    );
  }

  console.log("[Sidebar] rendering, nav keys:", Object.keys(sidebarNavPerms ?? {}));
  console.log("[Sidebar] about to return JSX");

  return (
    <div className="app-shell">
      <div
        data-appshell-probe="1"
        data-appshell-branch={appshellBranch}
        data-route={pathname}
        data-authstate={authState}
        data-bootstrap={bootstrapStatus}
        data-navready={String(navPermsReady)}
        data-deviceapproved={String(clientDeviceApproved)}
        data-navsource={sidebarNavSource}
        data-truekeys={sidebarTrueKeysAttr.slice(0, 160)}
        style={{ display: "none" }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 6,
          left: 6,
          zIndex: 99999,
          fontSize: 12,
          padding: "2px 6px",
          background: "rgba(255,0,0,0.15)",
        }}
      >
        SHELL_MARK vP0
      </div>
      <aside
        className="app-sidebar"
        data-clip-probe="1"
        data-clip-overflow="unknown"
        data-clip-h="unknown"
        data-sidebar-mounted="true"
      >
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
