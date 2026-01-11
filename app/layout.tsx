import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createServerSupabase } from "@/lib/supabase/server";
import ThemeSwitcher from "@/components/theme-switcher";
import LogoutButton from "@/components/logout-button";
import SidebarToggle from "@/components/sidebar-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Outsource Track",
  description: "Asana-style project workspace for outsource teams.",
};
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const userLabel = user?.email ?? "未登入";
  const userInitial = user?.email?.[0]?.toUpperCase() ?? "G";
  const navContent = (
    <>
      <a className="nav-item" href="/">
        首頁
      </a>
      <a className="nav-item" href="/projects">
        專案
      </a>
      <a className="nav-item" href="/dashboard">
        儀表板
      </a>
      {!user && (
        <a className="nav-item" href="/login">
          登入
        </a>
      )}

      {user && (
        <>
          <details className="nav-group">
            <summary className="nav-summary">專案管理</summary>
            <a className="nav-item" href="/admin/tasks">
              任務
            </a>
            <a className="nav-item" href="/admin/projects">
              專案列表
            </a>
          </details>

          <details className="nav-group">
            <summary className="nav-summary">公司設定</summary>
            <a className="nav-item" href="/admin/users">
              使用者
            </a>
            <a className="nav-item" href="/admin/roles">
              權限設定
            </a>
            <a className="nav-item" href="/admin/orgs">
              公司
            </a>
            <a className="nav-item" href="/admin/units">
              部門
            </a>
          </details>
        </>
      )}
    </>
  );
  const sidebarContent = (
    <>
      <div className="sidebar-brand">
        <div className="brand-mark">OT</div>
        <div>
          <div>Outsource Track</div>
          <div className="sidebar-meta">Asana-style workspace</div>
        </div>
      </div>

      <div className="sidebar-meta">
        <div>{userLabel}</div>
        <div>{user ? "已登入" : "請先登入"}</div>
      </div>

      <nav className="sidebar-nav">{navContent}</nav>
    </>
  );

  return (
    <html lang="zh-Hant" data-theme="ocean">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="app-shell">
          <aside className="app-sidebar">
            <div className="sidebar-mini">OT</div>
            <div className="sidebar-content">{sidebarContent}</div>
            <SidebarToggle />
          </aside>

          <div className="app-frame">
            <header className="app-topbar">
              <div className="topbar-left">
                <details className="sidebar-drawer">
                  <summary className="drawer-trigger" aria-label="開啟選單">
                    <span className="drawer-icon" aria-hidden="true">
                      ☰
                    </span>
                    <span className="drawer-label">選單</span>
                  </summary>
                  <div className="drawer-panel">
                    <div className="sidebar-content">{sidebarContent}</div>
                  </div>
                </details>
                <input className="search-input" placeholder="搜尋專案、任務或成員" />
                <span className="badge">Workspace</span>
              </div>
              <div className="topbar-right">
                <ThemeSwitcher />
                {user && <LogoutButton className="btn btn-ghost" />}
                <a className="btn btn-ghost" href="/admin/projects">
                  新建專案
                </a>
                <div className="badge">{userInitial}</div>
              </div>
            </header>
            <main className="app-main">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
