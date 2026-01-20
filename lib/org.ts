export async function getLatestUserOrgId(adminClient: any, userId: string) {
  const { data, error } = await adminClient
    .from("memberships")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0]?.org_id ?? null;
}

type EnsureActiveOrgOptions = {
  setCookie?: (orgId: string) => void;
};

export async function ensureActiveOrg(
  adminClient: any,
  userId: string,
  options: EnsureActiveOrgOptions = {}
) {
  const { data: profileRow, error } = await adminClient
    .from("profiles")
    .select("active_org_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && profileRow?.active_org_id) {
    return profileRow.active_org_id ?? null;
  }

  const orgId = await getLatestUserOrgId(adminClient, userId);
  if (!orgId) {
    return null;
  }

  await adminClient.from("profiles").update({ active_org_id: orgId }).eq("user_id", userId);
  if (options.setCookie) {
    options.setCookie(orgId);
  }
  return orgId;
}

type ActiveOrgOptions = {
  cookieOrgId?: string | null;
};

export async function getActiveOrgId(
  adminClient: any,
  userId: string,
  options: ActiveOrgOptions = {}
) {
  const cookieOrgId = options.cookieOrgId ?? null;
  if (cookieOrgId) {
    return cookieOrgId;
  }

  const { data, error } = await adminClient
    .from("profiles")
    .select("active_org_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && data?.active_org_id) {
    return data.active_org_id ?? null;
  }

  return await getLatestUserOrgId(adminClient, userId);
}

export async function getActiveOrg(
  adminClient: any,
  userId: string,
  options: ActiveOrgOptions = {}
) {
  const orgId = await getActiveOrgId(adminClient, userId, options);
  if (!orgId) return null;

  const { data, error } = await adminClient
    .from("orgs")
    .select("id, name, logo_url")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}
