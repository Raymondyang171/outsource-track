"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClientClient } from "@/lib/supabase/browser";
import { safeFetch } from "@/lib/api-client";

export default function LoginPage() {
  const supabase = createBrowserClientClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const formatAuthError = (rawMessage: string) => {
    const msgLower = rawMessage.toLowerCase();
    if (msgLower.includes("invalid login credentials")) {
      return "帳號或密碼錯誤，請確認輸入是否正確。";
    }
    if (msgLower.includes("email not confirmed")) {
      return "此帳號尚未完成信箱驗證，請先驗證後再登入。";
    }
    if (msgLower.includes("too many requests")) {
      return "登入嘗試過於頻繁，請稍後再試。";
    }
    if (msgLower.includes("user not found")) {
      return "查無此帳號，請確認電子郵件是否正確。";
    }
    return `登入失敗：${rawMessage}`;
  };

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (data.user) {
        router.replace("/dashboard");
      }
    };
    void checkSession();
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem("auth-pending");
          }
          router.replace("/dashboard");
        }
      }
    );
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [router, supabase]);

  async function signIn() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(formatAuthError(error.message));
      return;
    }
    setMsg("登入成功");
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      try {
        const payload = {
          level: "info",
          message: "login_success",
          action: "login",
          resource: "auth",
          source: "client",
          meta: {
            email: sessionData.session.user.email ?? null,
          },
        };
        const body = JSON.stringify(payload);
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon("/api/logs", blob);
        } else {
          await safeFetch("/api/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
        }
      } catch {
        // ignore logging failures
      }
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("auth-pending", Date.now().toString());
    }
    if (sessionData.session?.user) {
      router.replace("/dashboard");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">登入</div>
          <div className="page-subtitle">使用你的工作帳號進入專案控制台。</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <div className="admin-form-grid" style={{ padding: 0, border: "none" }}>
          <div className="admin-field">
            <label>電子郵件</label>
            <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="admin-field">
            <label>密碼</label>
            <input
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button onClick={signIn}>登入</button>
          {msg && <p className="page-subtitle">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
