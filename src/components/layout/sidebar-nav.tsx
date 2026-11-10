"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { ACCOUNT_ITEM, NAV_ITEMS, QUICK_PAY_ITEMS, findNavItem, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const { title, href, icon: Icon } = item;
  // Only the most specific item is highlighted (GPay Transactions, not Quick Entry as well).
  const active = findNavItem(pathname)?.href === href;
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-[#fdf1df] text-neutral-950"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className={cn("size-4 shrink-0", active && "text-amber-500")} aria-hidden />
        {title}
      </Link>
    </li>
  );
}

/** Logo, the nine module links, and the account link underneath. Used in the desktop sidebar and the mobile drawer. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link href="/dashboard" onClick={onNavigate} aria-label="Rikash Hub home">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>

        <p className="mt-5 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Quick Pay</p>
        <ul className="space-y-0.5">
          {QUICK_PAY_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>

        <p className="mt-5 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Account</p>
        <ul className="space-y-0.5">
          <NavLink item={ACCOUNT_ITEM} pathname={pathname} onNavigate={onNavigate} />
        </ul>
      </nav>

      <div className="shrink-0 border-t px-5 py-3 text-xs text-muted-foreground">Amounts in ₹ (INR)</div>
    </div>
  );
}
