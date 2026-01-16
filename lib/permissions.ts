import type { SupabaseClient } from "@supabase/supabase-js";

type PermissionAction = "read" | "create" | "update" | "delete";

export type PermissionSet = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export const roles = ["viewer", "member", "manager", "admin"] as const;

export const resources = [
  "projects",
  "tasks",
  "files",
  "costs",
  "cost_types",
  "users",
  "companies",
  "departments",
  "memberships",
  "roles",
  "devices",
  "logs",
] as const;

type RoleId = string;
type ResourceId = (typeof resources)[number];

const roleRank: Record<string, number> = {
  viewer: 0,
  member: 1,
  manager: 2,
  admin: 3,
};

const defaultRolePermissions: Record<string, Record<ResourceId, PermissionSet>> = Object.fromEntries(
  roles.map((role) => [
    role,
    Object.fromEntries(
      resources.map((resource) => {
        if (role === "viewer") {
          return [resource, { read: true, create: false, update: false, delete: false }];
        }
        if (role === "member") {
          if (resource === "costs" || resource === "cost_types") {
            return [resource, { read: true, create: false, update: false, delete: false }];
          }
          return [resource, { read: true, create: true, update: true, delete: false }];
        }
        return [resource, { read: true, create: true, update: true, delete: true }];
      })
    ),
  ])
) as Record<RoleId, Record<ResourceId, PermissionSet>>;

function isMissingTableError(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? "");
  return message.includes("Could not find the table");
}

function normalizeRole(role: string | null | undefined): RoleId | null {
  if (!role) return null;
  const normalized = String(role).trim();
  return normalized ? normalized : null;
}

async function getUserRole(
  admin: SupabaseClient,
  userId: string,
  orgId?: string | null
): Promise<RoleId | null> {
  let query = admin
    .from("memberships")
    .select("role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  let best: RoleId | null = null;
  let bestRank = -1;
  for (const row of data) {
    const role = normalizeRole(row.role);
    if (!role) continue;
    const rank = roleRank[role] ?? 0;
    if (!best || rank > bestRank) {
      best = role;
      bestRank = rank;
    }
  }
  return best;
}

async function getRolePermissions(admin: SupabaseClient, role: RoleId): Promise<Record<ResourceId, PermissionSet>> {
  const { data, error } = await admin
    .from("role_permissions")
    .select("resource, can_read, can_create, can_update, can_delete")
    .eq("role", role);

  if (error) {
    if (isMissingTableError(error)) {
      return defaultRolePermissions[role] ?? Object.fromEntries(
        resources.map((resource) => [resource, { read: false, create: false, update: false, delete: false }])
      ) as Record<ResourceId, PermissionSet>;
    }
    return defaultRolePermissions[role] ?? Object.fromEntries(
      resources.map((resource) => [resource, { read: false, create: false, update: false, delete: false }])
    ) as Record<ResourceId, PermissionSet>;
  }

  if (!data || data.length === 0) {
    return defaultRolePermissions[role] ?? Object.fromEntries(
      resources.map((resource) => [resource, { read: false, create: false, update: false, delete: false }])
    ) as Record<ResourceId, PermissionSet>;
  }

  const map = {
    ...(defaultRolePermissions[role] ?? Object.fromEntries(
      resources.map((resource) => [resource, { read: false, create: false, update: false, delete: false }])
    )),
  } as Record<ResourceId, PermissionSet>;
  for (const row of data) {
    if (!resources.includes(row.resource as ResourceId)) continue;
    map[row.resource as ResourceId] = {
      read: !!row.can_read,
      create: !!row.can_create,
      update: !!row.can_update,
      delete: !!row.can_delete,
    };
  }
  for (const resource of resources) {
    if (!map[resource].read) {
      map[resource] = { read: false, create: false, update: false, delete: false };
    }
  }
  return map;
}

export async function isOrgAdminOrUnitMember(
  client: SupabaseClient,
  userId: string,
  orgId: string | null | undefined,
  unitId: string | null | undefined
) {
  if (!orgId || !unitId) return false;
  const { data, error } = await client
    .from("memberships")
    .select("role, unit_id")
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error || !data || data.length === 0) return false;

  for (const row of data) {
    const role = normalizeRole(row.role);
    if (role === "admin") return true;
  }

  return data.some((row) => row.unit_id === unitId);
}

export async function isServerSuperAdmin(client: SupabaseClient, userId: string) {
  const superOrgId = process.env.PLATFORM_SUPER_ADMIN_ORG_ID;
  if (!superOrgId) return false;

  const { data, error } = await client
    .from("memberships")
    .select("role, org_id")
    .eq("user_id", userId)
    .eq("org_id", superOrgId);

  if (error || !data || data.length === 0) return false;
  return data.some((row) => normalizeRole(row.role) === "admin");
}

export async function verifyMembership(
  client: SupabaseClient,
  userId: string,
  orgId: string | null | undefined
): Promise<boolean> {
  if (!orgId) return false;

  const { data, error } = await client
    .from("memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .limit(1);

  if (error) {
    console.error("Error verifying membership:", error);
    return false;
  }

  return data && data.length > 0;
}

export async function getPermissionsForResource(
  admin: SupabaseClient,
  userId: string,
  orgId: string | null | undefined,
  resource: ResourceId
) {
  const role = await getUserRole(admin, userId, orgId);
  if (!role) {
    return { role: null as RoleId | null, permissions: null as PermissionSet | null };
  }

  const map = await getRolePermissions(admin, role);
  return { role, permissions: map[resource] ?? null };
}

export async function getPermissionsMapForUser(
  admin: SupabaseClient,
  userId: string,
  orgId: string | null | undefined
) {
  const role = await getUserRole(admin, userId, orgId);
  if (!role) {
    return { role: null as RoleId | null, permissions: null as Record<ResourceId, PermissionSet> | null };
  }
  const map = await getRolePermissions(admin, role);
  return { role, permissions: map };
}

export async function checkPermission(
  admin: SupabaseClient,
  userId: string,
  orgId: string | null | undefined,
  resource: ResourceId,
  action: PermissionAction
) {
  const { permissions } = await getPermissionsForResource(admin, userId, orgId, resource);
  if (!permissions?.read) {
    return false;
  }
  return !!permissions?.[action];
}
