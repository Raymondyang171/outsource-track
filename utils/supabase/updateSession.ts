// utils/supabase/updateSession.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieOptions = {
  path?: string;
  domain?: string;
  sameSite?: "strict" | "lax" | "none" | boolean;
  secure?: boolean;
  httpOnly?: boolean;
  maxAge?: number;
  expires?: Date;
};

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const publicPaths = ["/login", "/device/register", "/reset-password", "/api/device/register"];
  const deviceAdminBypass = ["/admin/devices"];
  const deviceApiAllowlist = ["/api/permissions", "/api/device/register"];
  const isApiRequest = pathname.startsWith("/api");
  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const isBypass = deviceAdminBypass.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user || isPublic) {
    return response;
  }
  if (isBypass) {
    return response;
  }
  if (
    isApiRequest &&
    deviceApiAllowlist.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    return response;
  }

  const deviceId = request.cookies.get("device_id")?.value;
  if (!deviceId) {
    console.warn("device_allowlist_blocked", {
      reason: "missing_device_id",
      path: pathname,
      user_id: user.id,
    });
    if (isApiRequest) {
      return NextResponse.json(
        { ok: false, error: "device_not_registered" },
        { status: 403 }
      );
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/device/register";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  let isDeviceApproved = false;

  // 1. Check for specific user-device pair first
  const { data: userDevice } = await supabase
    .from("devices") // FIX: Query "devices" table
    .select("approved")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (userDevice?.approved) {
    isDeviceApproved = true;
  } else {
    // 2. Fallback: check if the device is approved for anyone in the user's org
    const { data: memRow } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memRow?.org_id) {
      const { data: orgApprovedDevice } = await supabase
        .from("devices")
        .select("id")
        .eq("org_id", memRow.org_id)
        .eq("device_id", deviceId)
        .eq("approved", true)
        .limit(1)
        .maybeSingle();

      if (orgApprovedDevice) {
        isDeviceApproved = true;
      }
    }
  }

  if (!isDeviceApproved) {
    console.warn("device_allowlist_blocked", {
      reason: "device_not_approved",
      path: pathname,
      user_id: user.id,
      device_id: deviceId,
    });
    if (isApiRequest) {
      return NextResponse.json(
        { ok: false, error: "device_not_approved" },
        { status: 403 }
      );
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/device/register";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
