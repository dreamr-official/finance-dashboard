import { AppSidebar } from "@/components/app-sidebar";
import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar demoMode={isDemoMode()} role={user.role} />
      {!isDemoMode() && <RealtimeRefresh />}
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
