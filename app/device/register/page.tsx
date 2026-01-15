import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DeviceRegisterClient from "./DeviceRegisterClient";

export const dynamic = "force-dynamic";

export default async function DeviceRegisterPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  return <DeviceRegisterClient />;
}
