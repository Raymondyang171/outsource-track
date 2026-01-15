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
