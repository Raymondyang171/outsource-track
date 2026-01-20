import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import AppShell from "@/components/app-shell";
import { isPlatformAdminFromAccessToken } from "@/lib/auth";
import { getActiveOrgId } from "@/lib/org";
import { getPermissionsMapForUser, resources as permissionResources } from "@/lib/permissions";

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
  const { data: sessionData } = await supabase.auth.getSession();
  const user = data.user;
  const userEmail = user?.email ?? null;
  const userInitial = userEmail?.[0]?.toUpperCase() ?? "G";
  const isPlatformAdmin = isPlatformAdminFromAccessToken(sessionData.session?.access_token);
  let navPermissions: Record<string, boolean> | null = null;
  let activeOrgId: string | null = null;
  let activeOrgName: string | null = null;

  if (user) {
    try {
      const admin = createAdminSupabase();
      if (isPlatformAdmin) {
        navPermissions = Object.fromEntries(permissionResources.map((r) => [r, true]));
      } else {
        activeOrgId = await getActiveOrgId(admin, user.id);
        if (activeOrgId) {
          const { data: orgRow } = await admin
            .from("orgs")
            .select("name")
            .eq("id", activeOrgId)
            .maybeSingle();
          activeOrgName = orgRow?.name ?? null;
        }
        if (activeOrgId) {
          const { permissions } = await getPermissionsMapForUser(admin, user.id, activeOrgId);
          if (permissions) {
            navPermissions = Object.fromEntries(
              permissionResources.map((r) => [r, permissions[r]?.read ?? false])
            );
          } else {
            navPermissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
          }
        } else {
          navPermissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
        }
      }
    } catch {
      navPermissions = Object.fromEntries(permissionResources.map((r) => [r, false]));
    }
  }

  const AppShellWithActiveOrg = AppShell as unknown as React.ComponentType<any>;

  return (
    <html lang="zh-Hant" data-theme="ocean">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppShellWithActiveOrg
          userEmail={userEmail}
          userInitial={userInitial}
          isPlatformAdmin={isPlatformAdmin}
          navPermissions={navPermissions}
          activeOrgId={activeOrgId}
          activeOrgName={activeOrgName}
        >
          {children}
        </AppShellWithActiveOrg>
      </body>
    </html>
  );
}
