"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { ALL_NAV_ITEMS, findNavItem } from "@/config/navigation";
import { visibleSections, type NavLayout } from "@/features/navigation/model";
import { cn } from "@/lib/utils";

const BY_HREF = new Map(ALL_NAV_ITEMS.map((i) => [i.href, i]));

function NavLink({ id, title, pathname, onNavigate }: { id: string; title: string; pathname: string; onNavigate?: () => void }) {
  const item = BY_HREF.get(id);
  if (!item) return null;
  const Icon = item.icon;
  // Only the most specific item is highlighted (GPay Transactions, not Quick Entry as well).
  const active = findNavItem(pathname)?.href === id;
  return (
    <li>
      <Link
        href={id}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-[#fdf1df] text-neutral-950" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className={cn("size-4 shrink-0", active && "text-amber-500")} aria-hidden />
        <span className="min-w-0 truncate">{title}</span>
      </Link>
    </li>
  );
}

/**
 * The logo with a pencil beside it (opens Customize), and the pages under their headings as the user arranged them: names,
 * order and hidden pages. Used in the desktop sidebar and the mobile drawer.
 */
export function SidebarContent({ layout, onNavigate, onCustomize }: { layout: NavLayout; onNavigate?: () => void; onCustomize: () => void }) {
  const pathname = usePathname();
  const sections = visibleSections(layout);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pr-3 pl-5">
        <Link href="/quick-pay" onClick={onNavigate} aria-label="Rikash Hub home">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={onCustomize}
          aria-label="Customize side navigator"
          title="Customize"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        {sections.map((section, index) => (
          <div key={section.id} className={index > 0 ? "mt-5" : undefined}>
            {section.title ? <p className="mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{section.title}</p> : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.id} id={item.id} title={item.title} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t px-5 py-3 text-xs text-muted-foreground">Amounts in ₹ (INR)</div>
    </div>
  );
}
