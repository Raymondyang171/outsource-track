import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const cookieStore = await cookies(); // ✅ Next.js 16：cookies() 是 async

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server Components 不能寫 cookie；交給 proxy.ts（Proxy）做
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">我的帳號</div>
          <div className="page-subtitle">檢視目前登入狀態。</div>
        </div>
      </div>
      <div className="card">
        <pre>
          {JSON.stringify(
            { email: data.user?.email ?? null, error: error?.message ?? null },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
}
