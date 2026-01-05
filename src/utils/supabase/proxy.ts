// src/utils/supabase/proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // 1) 先準備一個「可回傳」的 Response
  let response = NextResponse.next({ request });

  // 2) 建立 Supabase SSR client：用 request/response cookies 做同步
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Supabase 近期建議用 publishable key；過渡期 anon / publishable 兩者都可能存在
    // 你先用你目前已放的 key 也可以，但建議後續換成 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY :contentReference[oaicite:2]{index=2}
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 先把新 cookies 寫回 request（讓同一次 request 內的 server 端讀得到）
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          // 再把新 cookies 寫回 response（讓瀏覽器更新）
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 3) 觸發一次 getUser：讓 Supabase 有機會刷新/同步 session cookies
  // 官方也提醒：createServerClient 和 getUser 之間不要塞其他邏輯，避免難除錯的登出問題 :contentReference[oaicite:3]{index=3}
  await supabase.auth.getUser();

  return response;
}
