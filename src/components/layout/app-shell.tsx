"use client";

import { ChevronRight, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { findNavItem } from "@/config/navigation";
import type { NavActions } from "@/features/navigation/actions";
import { NavCustomizer } from "@/features/navigation/components/nav-customizer";
import { titleOf, type NavLayout } from "@/features/navigation/model";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { SidebarContent } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/**
 * On a wide screen the side navigator is hidden: move the pointer to the left edge (or press the menu button) and it slides
 * out; move the pointer away and it slides back. The page itself always uses the full width. On a phone the menu button
 * opens it as a drawer.
 */
export function AppShell({
  user,
  navLayout,
  navActions,
  children,
}: {
  user: { name: string | null; email: string };
  /** The side navigator as this user arranged it. */
  navLayout: NavLayout;
  navActions: NavActions;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();
  const current = findNavItem(pathname);
  // The saved layout, updated the moment a change is saved in the Customize editor.
  const [layout, setLayout] = useState(navLayout);
  const [customizing, setCustomizing] = useState(false);

  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  // A short delay so a pointer that slips off the edge for a moment does not make it flicker.
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => cancelClose, []);

  // Touch screens have no hover: a press anywhere outside the open navigator closes it.
  const aside = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (aside.current && !aside.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="min-h-dvh">
      {/* Desktop: the hot zone at the left edge, a small visible tab, and the sliding navigator */}
      <div aria-hidden className="fixed inset-y-0 left-0 z-40 hidden w-2 lg:block" onMouseEnter={show} />
      <button
        type="button"
        aria-label="Show navigation"
        onMouseEnter={show}
        onClick={show}
        className={cn(
          "fixed top-1/2 left-0 z-40 hidden h-16 w-4 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 bg-card text-muted-foreground shadow-sm transition-opacity hover:text-foreground lg:flex",
          open && "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
      <aside
        ref={aside}
        aria-label="Navigation"
        inert={!open}
        data-open={open}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideSoon();
        }}
        className="fixed inset-y-0 left-0 z-50 hidden w-64 -translate-x-full border-r bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 ease-out data-[open=true]:translate-x-0 lg:block"
      >
        <SidebarContent layout={layout} onNavigate={() => setOpen(false)} onCustomize={() => setCustomizing(true)} />
      </aside>

      {/* Phones and tablets: a drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-72 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            layout={layout}
            onNavigate={() => setMobileNavOpen(false)}
            onCustomize={() => {
              setMobileNavOpen(false);
              setCustomizing(true);
            }}
          />
        </SheetContent>
      </Sheet>

      <NavCustomizer open={customizing} onOpenChange={setCustomizing} layout={layout} actions={navActions} onSaved={setLayout} />

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
            <Menu />
          </Button>
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label="Show navigation" onClick={show}>
            <Menu />
          </Button>
          <p className="truncate text-sm font-medium">{current ? titleOf(layout, current.href) : "Rikash Hub"}</p>
          <div className="ml-auto flex items-center gap-1">
            <UserMenu name={user.name} email={user.email} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
