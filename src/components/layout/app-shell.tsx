"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { findNavItem } from "@/config/navigation";
import { useUiStore } from "@/stores/ui-store";
import { SidebarContent } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppShell({
  user,
  children,
}: {
  user: { name: string | null; email: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();
  const current = findNavItem(pathname);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r bg-sidebar text-sidebar-foreground lg:block">
        <SidebarContent />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-72 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu />
          </Button>
          <p className="truncate text-sm font-medium">{current?.title ?? "Rikash Finance"}</p>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
