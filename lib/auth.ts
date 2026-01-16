type JwtPayload = {
  platform_role?: string;
};

export type PlatformRole = "super_admin";

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof window === "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }

  return globalThis.atob(padded);
}

function decodeJwtPayload(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    return JSON.parse(base64UrlDecode(payload)) as JwtPayload;
  } catch {
    return null;
  }
}

export function getPlatformRoleFromAccessToken(token: string | null | undefined): PlatformRole | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.platform_role) return null;
  return payload.platform_role === "super_admin" ? "super_admin" : null;
}

export function isPlatformAdminFromAccessToken(token: string | null | undefined) {
  return getPlatformRoleFromAccessToken(token) === "super_admin";
}
