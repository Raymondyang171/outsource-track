"use client";

import { useState } from "react";
import { createBrowserClientClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createBrowserClientClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function signIn() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : "登入成功");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Login</h1>
      <div style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={signIn}>Sign in</button>
        {msg && <p>{msg}</p>}
      </div>
    </div>
  );
}
