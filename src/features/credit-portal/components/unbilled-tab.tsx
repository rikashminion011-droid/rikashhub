"use client";

import { Download, FilePlus2, ImageUp, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AddResult } from "@/features/quick-pay/components/inline-add";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { PortalActions } from "../actions";
import type { UnbilledRow } from "../server/service";
import { PeriodFilter } from "./period-filter";
import { RecipientCell } from "./recipient-cell";
import { UnbilledEditDialog, UnbilledSheet } from "./unbilled-sheet";

const when = (iso: string) => {
  const d = new Date(iso);
  return { date: formatLongDate(istDateOf(d)), time: formatClock(istTimeOf(d)) };
};

/**
 * Unbilled Transactions of a portal: what has been spent but is not on a statement yet. Add several at once, edit or delete
 * one, export the table. A transaction the statement now shows is marked Settled and no longer counts.
 */
export function UnbilledTab({
  portalId,
  rows,
  people: initialPeople,
  actions,
  addPerson,
  today,
  defaultRange,
  exportHref,
}: {
  portalId: string;
  rows: UnbilledRow[];
  people: { id: string; name: string }[];
  actions: Pick<PortalActions, "saveUnbilledBulk" | "updateUnbilled" | "deleteUnbilled">;
  addPerson: (name: string) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
  today: string;
  /** The period shown when none is chosen (HDFC: the 16th to the 15th). Without one, the current month. */
  defaultRange?: { from: string; to: string };
  exportHref: string;
}) {
  const router = useRouter();
  const [people, setPeople] = useState(initialPeople);
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<UnbilledRow | null>(null);
  const [deleting, setDeleting] = useState<UnbilledRow | null>(null);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  const namesOf = (ids: string[]) => ids.map((id) => ({ id, name: nameOf(id) })).filter((n) => n.name);
  const counted = rows.filter((r) => !r.settled);
  const debit = counted.filter((r) => r.kind === "DEBIT").reduce((s, r) => s + r.amountPaise, 0);
  const credit = counted.filter((r) => r.kind === "CREDIT").reduce((s, r) => s + r.amountPaise, 0);

  const onAddPerson = async (name: string): Promise<AddResult> => {
    const r = await addPerson(name);
    if (!r.ok) return r;
    setPeople((p) => (p.some((x) => x.id === r.id) ? p : [...p, { id: r.id, name: r.name }]));
    return { ok: true, id: r.id };
  };

  const menu = (row: UnbilledRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.reason || row.details || "this transaction"}`} className="text-muted-foreground" />}>
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => setEditing(row)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDeleting(row)} className="text-destructive focus:text-destructive">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <PeriodFilter today={today} defaultRange={defaultRange}>
        <Button type="button" variant="outline" onClick={() => setSheet(true)}>
          <FilePlus2 /> Add Bulk
        </Button>
        <Button type="button" variant="outline" disabled title="Reading the transactions from images is the next step">
          <ImageUp /> Import Image
        </Button>
        <a href={exportHref} className={cn(buttonVariants({ variant: "outline" }))}>
          <Download /> Export
        </a>
      </PeriodFilter>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm" aria-live="polite">
        <span>
          <span className="text-muted-foreground">Unbilled debit </span>
          <span className="font-semibold text-red-600 tabular-nums">{formatINR(debit)}</span>
        </span>
        {credit > 0 ? (
          <span>
            <span className="text-muted-foreground">Credit </span>
            <span className="font-semibold text-green-600 tabular-nums">{formatINR(credit)}</span>
          </span>
        ) : null}
        <span className="text-muted-foreground">{counted.length} unbilled{rows.length > counted.length ? ` · ${rows.length - counted.length} settled by a statement` : ""}</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No unbilled transactions in this period. Use Add Bulk to add some.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Date and Time</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Reason</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Debit</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Recipient</th>
                  <th scope="col" className="w-12 px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const t = when(r.occurredAt);
                  return (
                    <tr key={r.id} className={cn("align-top hover:bg-muted/30", r.settled && "opacity-55")}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <p className="font-medium">{t.date}</p>
                        <p className="text-xs text-muted-foreground">{t.time}</p>
                      </td>
                      <td className="max-w-64 px-3 py-2.5 break-words">
                        {r.reason || <span className="text-muted-foreground">{r.details || "—"}</span>}
                        {r.settled ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Settled</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={r.kind === "DEBIT" ? "font-medium text-red-600" : "font-medium text-green-600"}>{r.kind === "DEBIT" ? "Debit" : "Credit"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatINR(r.amountPaise)}</td>
                      <td className="px-3 py-2.5">
                        <RecipientCell names={namesOf(r.recipientIds)} />
                      </td>
                      <td className="px-2 py-1.5 text-right">{menu(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {rows.map((r) => {
              const t = when(r.occurredAt);
              return (
                <li key={r.id} className={cn("space-y-1 rounded-xl border bg-card p-3", r.settled && "opacity-55")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-semibold break-words">{r.reason || r.details || "Transaction"}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <p className={cn("font-semibold tabular-nums", r.kind === "DEBIT" ? "text-red-600" : "text-green-600")}>
                        {r.kind === "DEBIT" ? "−" : "+"}
                        {formatINR(r.amountPaise)}
                      </p>
                      {menu(r)}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.date} · {t.time}
                    {r.settled ? " · Settled" : ""}
                  </p>
                  <div className="text-sm">
                    <RecipientCell names={namesOf(r.recipientIds)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <UnbilledSheet open={sheet} onOpenChange={setSheet} portalId={portalId} people={people} onAddPerson={onAddPerson} saveUnbilledBulk={actions.saveUnbilledBulk} onSaved={() => router.refresh()} today={today} />
      <UnbilledEditDialog row={editing} onClose={() => setEditing(null)} people={people} onAddPerson={onAddPerson} updateUnbilled={actions.updateUnbilled} onSaved={() => router.refresh()} today={today} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this transaction?"
        description={deleting ? `${deleting.kind === "DEBIT" ? "Debit" : "Credit"} of ${formatINR(deleting.amountPaise)} will be removed. This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return null;
          const r = await actions.deleteUnbilled({ id: deleting.id });
          if (!r.ok) return r.error;
          toast.success("Transaction deleted.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
