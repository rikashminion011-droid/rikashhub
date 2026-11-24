"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { addAutopayAction, deleteAutopayAction } from "../actions";
import type { AutopayData, AutopayOwner } from "../server/autopay";

/** "2026-11-15" as "15, 2026": the day of the month and the year, without the month. The full date is kept underneath. */
const dayAndYear = (date: string) => `${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;

const PAGES: { owner: AutopayOwner; key: "my" | "office"; label: string }[] = [
  { owner: "MY", key: "my", label: "My Autopay" },
  { owner: "OFFICE", key: "office", label: "Office Autopay" },
];

/**
 * Auto Pay: two pages, My Autopay and Office Autopay, each its own table of Autopay Date and Autopay Amount with the Total.
 * "Add Autopay" adds a dated amount to the page that is open.
 */
export function AutopayTab({ portalId, data, owner, baseHref, today, actions }: { portalId: string; data: AutopayData; owner: AutopayOwner; baseHref: string; today: string; actions: { add: typeof addAutopayAction; remove: typeof deleteAutopayAction } }) {
  const page = PAGES.find((p) => p.owner === owner) ?? PAGES[0]!;
  const table = data[page.key];
  return (
    <section className="space-y-4" aria-label="Auto Pay">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Auto Pay pages" className="inline-flex rounded-lg border bg-muted p-0.5">
          {PAGES.map((p) => (
            <Link key={p.key} href={`${baseHref}&owner=${p.owner}`} aria-current={p.owner === page.owner ? "page" : undefined} className={cn("rounded-md px-4 py-1.5 text-sm font-medium", p.owner === page.owner ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {p.label} <span className="ml-1 text-xs text-muted-foreground tabular-nums">{formatINR(data[p.key].totalPaise)}</span>
            </Link>
          ))}
        </nav>
        <AddAutopay key={page.owner} portalId={portalId} owner={page.owner} label={page.label} today={today} add={actions.add} />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[22rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Autopay Date</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Autopay Amount</th>
              <th scope="col" className="w-12 px-2 py-2.5">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                  Nothing in {page.label} yet.
                </td>
              </tr>
            ) : (
              table.rows.map((r) => <Row key={r.id} row={r} remove={actions.remove} />)
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(table.totalPaise)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Row({ row, remove }: { row: { id: string; date: string; amountPaise: number }; remove: typeof deleteAutopayAction }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <tr>
      <td className="px-3 py-2.5 whitespace-nowrap">{dayAndYear(row.date)}</td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatINR(row.amountPaise)}</td>
      <td className="px-2 py-1.5 text-right">
        <button
          type="button"
          aria-label="Remove this autopay"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await remove({ id: row.id });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            router.refresh();
          }}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

function AddAutopay({ portalId, owner, label, today, add }: { portalId: string; owner: AutopayOwner; label: string; today: string; add: typeof addAutopayAction }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    const r = await add({ portalId, owner, date, amount });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success(`Added to ${label}.`);
    setAmount("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" />}>
        <Plus /> Add Autopay
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to {label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Autopay Date</span>
            <DatePicker value={date} onChange={setDate} ariaLabel="Autopay date" className="w-full" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Autopay Amount</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Autopay amount" placeholder="0" className="h-10 text-base tabular-nums sm:text-sm" />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
