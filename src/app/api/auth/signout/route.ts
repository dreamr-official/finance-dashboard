import { isDemoMode } from "@/lib/env";
import { redirect } from "next/navigation";

export async function POST() {
  if (!isDemoMode()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
