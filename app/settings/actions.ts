import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

async function fetchLatestOrgId(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.org_id ?? null;
}

export async function updateProfileAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    redirect(`/settings?error=${encodeURIComponent("display_name_required")}`);
  }

  const jobTitleIdRaw = formData.get("job_title_id");
  const requestedJobTitleId = jobTitleIdRaw ? String(jobTitleIdRaw).trim() : "";
  let jobTitleId: string | null = requestedJobTitleId || null;

  if (requestedJobTitleId) {
    const orgId = await fetchLatestOrgId(supabase, user.id);
    if (!orgId) {
      redirect(`/settings?error=${encodeURIComponent("org_not_found")}`);
    }

    const { data: jobTitleRow } = await supabase
      .from("job_titles")
      .select("id, org_id")
      .eq("id", requestedJobTitleId)
      .maybeSingle();

    if (!jobTitleRow || jobTitleRow.org_id !== orgId) {
      redirect(`/settings?error=${encodeURIComponent("invalid_job_title")}`);
    }

    jobTitleId = jobTitleRow.id;
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, display_name: displayName, job_title_id: jobTitleId }, { onConflict: "user_id" });

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message ?? "update_failed")}`);
  }

  redirect("/settings?ok=updated");
}

export async function sendPasswordResetAction() {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) {
    redirect("/login");
  }

  const redirectBase = process.env.NEXT_PUBLIC_SITE_URL;
  const { error } = redirectBase
    ? await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${redirectBase}/reset-password`,
      })
    : await supabase.auth.resetPasswordForEmail(user.email);

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message ?? "reset_failed")}`);
  }

  redirect("/settings?ok=password_email_sent");
}

export async function createJobTitleAction(formData: FormData) {
  "use server";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login");
  }

  const name = String(formData.get("job_title_name") ?? "").trim();
  if (!name) {
    redirect(`/settings?error=${encodeURIComponent("job_title_required")}`);
  }

  const orgId = await fetchLatestOrgId(supabase, user.id);
  if (!orgId) {
    redirect(`/settings?error=${encodeURIComponent("org_not_found")}`);
  }

  const { error } = await supabase
    .from("job_titles")
    .insert({ name, org_id: orgId, created_by: user.id });

  if (error) {
    const isDuplicate =
      error.code === "23505" ||
      error.message?.includes("job_titles_org_name_key") ||
      error.details?.includes("job_titles_org_name_key");
    const errorKey = isDuplicate ? "job_title_exists" : error.message ?? "insert_failed";
    redirect(`/settings?error=${encodeURIComponent(errorKey)}`);
  }

  redirect("/settings?ok=job_title_added");
}
