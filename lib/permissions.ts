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
  "users",
  "companies",
  "departments",
  "memberships",
  "roles",
] as const;

type RoleId = (typeof roles)[number];
type ResourceId = (typeof resources)[number];

const roleRank: Record<RoleId, number> = {
  viewer: 0,
  member: 1,
  manager: 2,
  admin: 3,
};

const defaultRolePermissions: Record<RoleId, Record<ResourceId, PermissionSet>> = Object.fromEntries(
  roles.map((role) => [
    role,
    Object.fromEntries(
      resources.map((resource) => {
        if (role === "viewer") {
          return [resource, { read: true, create: false, update: false, delete: false }];
        }
        if (role === "member") {
          return [resource, { read: true, create: true, update: true, delete: false }];
        }
        return [resource, { read: true, create: true, update: true, delete: true }];
      })
    ),
  ])
) as Record<RoleId, Record<ResourceId, PermissionSet>>;

function isMissingTableError(error: any) {
  const message = String(error?.message ?? "");
  return message.includes("Could not find the table");
}

function normalizeRole(role: string | null | undefined): RoleId | null {
  if (!role) return null;
  return roles.includes(role as RoleId) ? (role as RoleId) : null;
}

async function getUserRole(admin: any, userId: string, orgId?: string | null): Promise<RoleId | null> {
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

  let best: RoleId | null = normalizeRole(data[0]?.role);
  for (const row of data) {
    const role = normalizeRole(row.role);
    if (!role) continue;
    if (!best || roleRank[role] > roleRank[best]) {
      best = role;
    }
  }
  return best;
}

async function getRolePermissions(admin: any, role: RoleId): Promise<Record<ResourceId, PermissionSet>> {
  const { data, error } = await admin
    .from("role_permissions")
    .select("resource, can_read, can_create, can_update, can_delete")
    .eq("role", role);

  if (error) {
    if (isMissingTableError(error)) {
      return defaultRolePermissions[role];
    }
    return defaultRolePermissions[role];
  }

  if (!data || data.length === 0) {
    return defaultRolePermissions[role];
  }

  const map = { ...defaultRolePermissions[role] } as Record<ResourceId, PermissionSet>;
  for (const row of data) {
    if (!resources.includes(row.resource as ResourceId)) continue;
    map[row.resource as ResourceId] = {
      read: !!row.can_read,
      create: !!row.can_create,
      update: !!row.can_update,
      delete: !!row.can_delete,
    };
  }
  return map;
}

export async function getPermissionsForResource(
  admin: any,
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

export async function checkPermission(
  admin: any,
  userId: string,
  orgId: string | null | undefined,
  resource: ResourceId,
  action: PermissionAction
) {
  const { permissions } = await getPermissionsForResource(admin, userId, orgId, resource);
  return !!permissions?.[action];
}
