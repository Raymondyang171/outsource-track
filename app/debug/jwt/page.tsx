import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";

function decodeJwtPayload(token: string | null | undefined) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default async function DebugJwtPage() {
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = authData.user;

  if (!user) {
    redirect("/login");
  }

  const accessToken = sessionData.session?.access_token ?? null;
  const payload = decodeJwtPayload(accessToken);
  const platformRole = payload?.platform_role ?? null;
  const isPlatformAdmin = isPlatformAdminFromAccessToken(accessToken);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">JWT Debug</div>
          <div className="page-subtitle">伺服器端解析目前登入者的 JWT payload。</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
{JSON.stringify(
  {
    user: {
      id: user.id,
      email: user.email,
    },
    platform_role: platformRole,
    is_platform_admin: isPlatformAdmin,
    jwt_payload: payload,
  },
  null,
  2
)}
        </pre>
      </div>
    </div>
  );
}
