"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sidebar-collapsed";

export default function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const next = stored === "1";
    setCollapsed(next);
    document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded";
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    }
  }, [collapsed]);

  return (
    <button
      type="button"
      className="sidebar-toggle"
      onClick={() => setCollapsed((prev) => !prev)}
      aria-pressed={collapsed}
      aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
    >
      <span aria-hidden="true">{collapsed ? "→" : "←"}</span>
      {collapsed ? "展開選單" : "收合選單"}
    </button>
  );
}
