"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClientClient } from "@/lib/supabase/browser";

type LogoutButtonProps = {
  className?: string;
  label?: string;
};

export default function LogoutButton({ className, label = "登出" }: LogoutButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    if (isPending) return;
    setIsPending(true);
    const supabase = createBrowserClientClient();
    const { error } = await supabase.auth.signOut();
    setIsPending(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button className={className} type="button" onClick={handleLogout} disabled={isPending}>
      {isPending ? "登出中..." : label}
    </button>
  );
}
