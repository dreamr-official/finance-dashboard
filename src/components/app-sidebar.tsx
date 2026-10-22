"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Repeat,
  Wallet,
  Settings,
  Menu,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith(href)
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Footer({ demoMode, role }: { demoMode: boolean; role: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className="mt-auto flex flex-col gap-2 px-3 pb-4">
      {demoMode && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Demo data — connect Supabase &amp; Plaid to go live
        </div>
      )}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground capitalize">{role}</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
          <form action="/api/auth/signout" method="post">
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar({ demoMode, role }: { demoMode: boolean; role: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center px-6 text-lg font-semibold tracking-tight">
          Finance
        </div>
        <NavLinks />
        <Footer demoMode={demoMode} role={role} />
      </aside>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent side="left" className="flex w-64 flex-col p-0 pt-4">
            <div className="px-6 pb-2 text-lg font-semibold">Finance</div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <Footer demoMode={demoMode} role={role} />
          </SheetContent>
        </Sheet>
        <span className="text-lg font-semibold">Finance</span>
      </div>
    </>
  );
}
