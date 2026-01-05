"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClientClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createBrowserClientClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function signIn() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("登入成功");
    router.push("/admin/tasks");
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
