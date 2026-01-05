import { createServerSupabase } from "@/lib/supabase/server";

export default async function MePage() {
  const supabase = createServerSupabase();
  const { data } = await supabase.auth.getUser();

  return (
    <div style={{ padding: 24 }}>
      <h1>/me</h1>
      <pre>{JSON.stringify({ user: data.user?.email ?? null }, null, 2)}</pre>
    </div>
  );
}