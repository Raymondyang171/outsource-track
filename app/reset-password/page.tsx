"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClientClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const supabase = createBrowserClientClient();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        setReady(true);
      }
    };
    void checkSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  async function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMsg(null);

    if (!ready) {
      setMsg("請透過密碼重設信件開啟此頁面。");
      return;
    }
    if (!password || !confirm) {
      setMsg("請輸入新密碼並確認。");
      return;
    }
    if (password !== confirm) {
      setMsg("兩次輸入的密碼不一致。");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMsg(`密碼更新失敗：${error.message}`);
      return;
    }

    router.replace("/settings?ok=password_updated");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">重設密碼</div>
          <div className="page-subtitle">請輸入新的密碼完成更新。</div>
        </div>
      </div>

      <form className="card space-y-4" onSubmit={submitReset} style={{ maxWidth: 420 }}>
        <div className="admin-field">
          <label htmlFor="password">新密碼</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            disabled={!ready}
            required
          />
        </div>
        <div className="admin-field">
          <label htmlFor="password_confirm">確認密碼</label>
          <input
            id="password_confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            disabled={!ready}
            required
          />
        </div>
        <button type="submit" disabled={!ready}>
          更新密碼
        </button>
        {!ready && (
          <div className="page-subtitle">尚未驗證重設連結，請由信件連結進入。</div>
        )}
        {msg && <div className="page-subtitle">{msg}</div>}
      </form>
    </div>
  );
}
