"use client";

import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AddOptionDialog, ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { RecipientCell } from "@/features/credit-portal/components/recipient-cell";
import type { AddResult } from "@/features/quick-pay/components/inline-add";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { ShoppingActions } from "../actions";
import type { PlatformRow, PurchaseRow } from "../server/service";
import { PurchaseDialog } from "./purchase-dialog";

const when = (iso: string) => {
  const d = new Date(iso);
  return `${formatLongDate(istDateOf(d))}, ${formatClock(istTimeOf(d))}`;
};

/**
 * Shopping Records: choose a platform (or all), filter by period, see the purchases with their image, recipients and amount,
 * show only the Pending ones, and add or edit a purchase.
 */
export function ShoppingView({
  platforms,
  activeId,
  rows,
  totalPaise,
  pendingCount,
  pendingOnly,
  people: initialPeople,
  actions,
  addPerson,
  today,
  now,
}: {
  platforms: PlatformRow[];
  activeId: string | null;
  rows: PurchaseRow[];
  totalPaise: number;
  pendingCount: number;
  pendingOnly: boolean;
  people: { id: string; name: string }[];
  actions: ShoppingActions;
  addPerson: (name: string) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
  today: string;
  now: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [people, setPeople] = useState(initialPeople);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dialog, setDialog] = useState<{ editing: PurchaseRow | null } | null>(null);
  const [deleting, setDeleting] = useState<PurchaseRow | null>(null);
  const active = platforms.find((p) => p.id === activeId) ?? null;

  const onAddPerson = async (name: string): Promise<AddResult> => {
    const r = await addPerson(name);
    if (!r.ok) return r;
    setPeople((p) => (p.some((x) => x.id === r.id) ? p : [...p, { id: r.id, name: r.name }]));
    return { ok: true, id: r.id };
  };

  function go(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="platform" className="sr-only">
          Shopping platform
        </label>
        <select
          id="platform"
          value={active?.id ?? ""}
          onChange={(e) => (e.target.value === "__new" ? setAdding(true) : go({ platform: e.target.value }))}
          className="h-10 min-w-56 rounded-lg border border-input bg-background px-3 text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        >
          <option value="">All Shopping Platforms</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__new">+ New Shopping Platform</option>
        </select>
        {active ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Manage this platform" />}>
              <MoreVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRemoving(true)} className="text-destructive focus:text-destructive">
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <PeriodFilter today={today}>
        <Button type="button" onClick={() => setDialog({ editing: null })} disabled={platforms.length === 0}>
          <Plus /> Add New Purchase
        </Button>
      </PeriodFilter>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-live="polite">
        <span>
          <span className="text-muted-foreground">Total </span>
          <span className="font-semibold tabular-nums">{formatINR(totalPaise)}</span>
        </span>
        <span className="text-muted-foreground">
          {rows.length} purchase{rows.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          aria-pressed={pendingOnly}
          onClick={() => go({ pending: pendingOnly ? "" : "1" })}
          className={cn("rounded-full border px-3 py-1 text-xs font-semibold", pendingOnly ? "border-amber-500 bg-amber-100 text-amber-900" : "bg-card hover:bg-muted", pendingCount === 0 && !pendingOnly && "text-muted-foreground")}
        >
          {pendingCount} Pending
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {pendingOnly ? "Nothing is pending. Every purchase here is complete." : "No purchases in this period. Use Add New Purchase to add one."}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 rounded-xl border bg-card p-3">
              {r.hasImage ? (
                <Link href={`/shopping/${r.id}`} aria-label={`Open ${r.platformName} ${r.number}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private, user-uploaded image */}
                  <img src={`/shopping/image/${r.id}`} alt="" loading="lazy" className="size-20 rounded-lg border bg-muted/30 object-cover" />
                </Link>
              ) : (
                <Link href={`/shopping/${r.id}`} aria-label={`Open ${r.platformName} ${r.number}`} className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
                  No image
                </Link>
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/shopping/${r.id}`} className="min-w-0 font-semibold underline-offset-4 hover:underline">
                    {r.platformName} {r.number}
                    {r.pending ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-amber-900">Pending</span> : null}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <p className="font-semibold tabular-nums">{formatINR(r.amountPaise)}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.platformName} ${r.number}`} className="text-muted-foreground" />}>
                        <MoreVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => setDialog({ editing: r })}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleting(r)} className="text-destructive focus:text-destructive">
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{when(r.occurredAt)}</p>
                <p className="text-sm break-words">{r.reason}</p>
                <div className="text-sm">
                  <RecipientCell names={r.recipientIds.map((id) => ({ id, name: people.find((p) => p.id === id)?.name ?? "" })).filter((n) => n.name)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PurchaseDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        editing={dialog?.editing ?? null}
        platforms={platforms}
        defaultPlatformId={active?.id ?? null}
        people={people}
        onAddPerson={onAddPerson}
        actions={actions}
        today={today}
        now={now}
        onSaved={() => router.refresh()}
      />

      <AddOptionDialog
        open={adding}
        onOpenChange={setAdding}
        title="New Shopping Platform"
        description="It also appears under Shopping Portals in Quick Entry."
        label="Platform name"
        placeholder="D Mart"
        onSave={async (name) => {
          const r = await actions.addPlatform({ name });
          if (!r.ok) return r.error;
          toast.success(`${name} added.`);
          go({ platform: r.id });
          return null;
        }}
      />
      {active ? (
        <>
          <AddOptionDialog
            open={renaming}
            onOpenChange={setRenaming}
            title="Rename platform"
            label="Platform name"
            initialValue={active.name}
            onSave={async (name) => {
              const r = await actions.renamePlatform({ id: active.id, name });
              if (!r.ok) return r.error;
              router.refresh();
              return null;
            }}
          />
          <ConfirmDialog
            open={removing}
            onOpenChange={setRemoving}
            title={`Delete ${active.name}?`}
            description="The platform is removed from the lists. Its purchases are kept and come back if you add the platform again."
            confirmLabel="Delete"
            onConfirm={async () => {
              const r = await actions.removePlatform({ id: active.id });
              if (!r.ok) return r.error;
              toast.success("Platform deleted.");
              go({ platform: "" });
              return null;
            }}
          />
        </>
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this purchase?"
        description={deleting ? `${deleting.platformName} ${deleting.number} (${formatINR(deleting.amountPaise)}) and its item table will be removed.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return null;
          const r = await actions.deletePurchase({ id: deleting.id });
          if (!r.ok) return r.error;
          toast.success("Purchase deleted.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
