"use client";

import { MoreVertical, Pencil, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { deleteEntryAction, patchEntryAction, QuickPayActions } from "../actions";
import { groupCategories } from "../cascade";
import { formatTransactionWhen } from "../datetime";
import { matchCategory } from "../keywords";
import { formatPercent } from "../split";
import type { QuickPayOptions, TxRow } from "../types";
import { MAX_REASON_LENGTH } from "../validation";
import { EditEntryDialog } from "./edit-entry-dialog";
import { SplitDialog, type SplitChoice } from "./split-dialog";

export interface TableActions {
  patchEntry: typeof patchEntryAction;
  deleteEntry: typeof deleteEntryAction;
  saveEntry: QuickPayActions["saveEntry"];
  getEntry: QuickPayActions["getEntry"];
  getRecentCredits: QuickPayActions["getRecentCredits"];
}

/**
 * The GPay Transactions list. The Reason, Category and Split of every row can be changed right in the table; the ⋮ menu
 * opens a pop-up to edit everything about a transaction, or deletes it. On a phone each transaction is a card.
 */
export function TransactionsTable({
  rows,
  filtered,
  options,
  actions,
}: {
  rows: readonly TxRow[];
  /** True when filters or a search are active, so the empty state can say so. */
  filtered: boolean;
  options: QuickPayOptions;
  actions: TableActions;
}) {
  const router = useRouter();
  // Rows changed in place; they show the saved result straight away, before the page reloads.
  const [patched, setPatched] = useState<Record<string, TxRow>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<TxRow | null>(null);
  const [deleting, setDeleting] = useState<TxRow | null>(null);

  const view = useMemo(() => rows.map((r) => patched[r.id] ?? r), [rows, patched]);
  const labels = options.settings.fields.labels;
  const categoryGroups = useMemo(() => groupCategories(options.categories), [options.categories]);

  /** Saves a change to one row. Returns an error message, or null when saved. */
  const patch = useCallback(
    async (id: string, change: { reason?: string; categoryId?: string | null; split?: SplitChoice | null }): Promise<string | null> => {
      const result = await actions.patchEntry({ id, ...change });
      if (!result.ok) return result.error;
      setPatched((p) => ({ ...p, [id]: result.row }));
      router.refresh(); // totals, balances and the other panels
      return null;
    },
    [actions, router],
  );

  const commitReason = useCallback(
    async (row: TxRow, reason: string) => {
      // A keyword in the new Reason fills the category, but only when the row has none (yours is never overwritten).
      const auto = !row.categoryId ? matchCategory(reason, options.keywords) : null;
      const problem = await patch(row.id, { reason, ...(auto ? { categoryId: auto } : {}) });
      if (problem) toast.error(problem);
      else if (auto) toast.success("Category picked from the reason.");
      return problem;
    },
    [patch, options.keywords],
  );

  const commitCategory = useCallback(
    async (row: TxRow, categoryId: string | null) => {
      const problem = await patch(row.id, { categoryId });
      if (problem) toast.error(problem);
    },
    [patch],
  );

  const removeSplit = useCallback(
    async (row: TxRow) => {
      const problem = await patch(row.id, { split: null });
      if (problem) toast.error(problem);
      else toast.success("Split removed.");
    },
    [patch],
  );

  async function confirmDelete(): Promise<string | null> {
    if (!deleting) return null;
    const result = await actions.deleteEntry({ id: deleting.id });
    if (!result.ok) return result.error;
    toast.success("Transaction deleted. Totals and balances updated.");
    router.refresh();
    return null;
  }

  if (view.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
        <Receipt className="size-7 text-muted-foreground" aria-hidden />
        <p className="font-medium">{filtered ? "No transactions match these filters" : "No transactions yet"}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {filtered ? "Try a different month or date range, or clear the filters." : "Add your first entry, import a statement, or paste in a sheet of entries with Add Bulk."}
        </p>
        {!filtered ? (
          <Link href="/quick-pay" className="mt-1 text-sm font-medium underline underline-offset-4">
            Add an entry
          </Link>
        ) : null}
      </div>
    );
  }

  const cells = (row: TxRow) => ({
    reason: <ReasonCell value={row.reason} onCommit={(text) => commitReason(row, text)} />,
    category: (
      <CascadingSelect
        compact
        clearable
        ariaLabel={`${labels.category} of ${row.reason || row.details || "this transaction"}`}
        groups={categoryGroups}
        value={row.categoryId}
        onChange={(v) => void commitCategory(row, v)}
        placeholder={labels.category}
        searchPlaceholder="Search categories…"
      />
    ),
    split: <SplitCell row={row} label={labels.split} onOpen={() => setSplitting(row)} onRemove={() => void removeSplit(row)} />,
    menu: <RowMenu onEdit={() => setEditing(row.id)} onDelete={() => setDeleting(row)} />,
  });

  return (
    <>
      {/* Wide screens: a table */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Date &amp; Time</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Debit</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Credit</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Transaction details</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">{labels.reason}</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Bank</th>
              <th scope="col" className="w-44 px-3 py-2.5 text-left font-medium">{labels.category}</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">{labels.split}</th>
              <th scope="col" className="w-12 px-2 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {view.map((row) => {
              const when = formatTransactionWhen(new Date(row.occurredAt));
              const c = cells(row);
              return (
                <tr key={row.id} className="align-top hover:bg-muted/30">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <p className="font-medium">{when.date}</p>
                    <p className="text-xs text-muted-foreground">{when.timeAndDay}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-destructive tabular-nums">{row.type === "DEBIT" ? formatINR(row.amountPaise) : ""}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-success tabular-nums">{row.type === "CREDIT" ? formatINR(row.amountPaise) : ""}</td>
                  <td className="max-w-56 px-3 py-2.5 break-words text-muted-foreground">{row.details || "—"}</td>
                  <td className="max-w-56 px-3 py-1.5">{c.reason}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.bankName || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-1.5">{c.category}</td>
                  <td className="px-3 py-2">{c.split}</td>
                  <td className="px-2 py-1.5 text-right">{c.menu}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: a card for each transaction */}
      <ul className="space-y-3 md:hidden">
        {view.map((row) => {
          const when = formatTransactionWhen(new Date(row.occurredAt));
          const c = cells(row);
          const debit = row.type === "DEBIT";
          return (
            <li key={row.id} className="space-y-2 rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("text-lg font-semibold tabular-nums", debit ? "text-destructive" : "text-success")}>
                    {debit ? "−" : "+"}
                    {formatINR(row.amountPaise)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {when.date} · {when.timeAndDay}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {row.bankName ? <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{row.bankName}</span> : null}
                  {c.menu}
                </div>
              </div>
              {row.details ? <p className="text-xs break-words text-muted-foreground">{row.details}</p> : null}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{labels.reason}</p>
                {c.reason}
              </div>
              <div className="grid grid-cols-2 items-end gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{labels.category}</p>
                  {c.category}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{labels.split}</p>
                  {c.split}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <EditEntryDialog
        entryId={editing}
        options={options}
        actions={actions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setPatched((p) => {
            const rest = { ...p };
            if (editing) delete rest[editing];
            return rest;
          });
          router.refresh();
        }}
      />
      <SplitDialog row={splitting} options={options} onClose={() => setSplitting(null)} onSave={(choice) => patch(splitting!.id, { split: choice })} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this transaction?"
        description={deleting ? `${deleting.type === "DEBIT" ? "Debit" : "Credit"} of ${formatINR(deleting.amountPaise)} will be removed from GPay Transactions, and the totals and the bank balance will be recalculated. This cannot be undone.` : ""}
        confirmLabel="Delete transaction"
        onConfirm={confirmDelete}
      />
    </>
  );
}

/** The Reason: click to edit in place. Enter or leaving the box saves; Escape cancels. */
function ReasonCell({ value, onCommit }: { value: string; onCommit: (text: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  const finished = useRef(false);

  async function commit() {
    if (finished.current) return;
    finished.current = true;
    const next = text.trim();
    if (next === value.trim()) return setEditing(false);
    setSaving(true);
    const problem = await onCommit(next);
    setSaving(false);
    // On a problem the old text stays (the message was shown); either way the box closes.
    if (problem) setText(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          finished.current = false;
          setText(value);
          setEditing(true);
        }}
        className="group flex min-h-8 w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={value ? `Edit reason: ${value}` : "Add a reason"}
      >
        <span className={cn("min-w-0 flex-1 break-words", !value && "text-muted-foreground")}>{value || "Add reason…"}</span>
        <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 max-md:opacity-60" aria-hidden />
      </button>
    );
  }
  return (
    <Input
      autoFocus
      value={text}
      maxLength={MAX_REASON_LENGTH}
      disabled={saving}
      aria-label="Reason"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          finished.current = true;
          setText(value);
          setEditing(false);
        }
      }}
      className="h-8 text-base sm:text-sm"
    />
  );
}

/** The Split box: tick it to choose a person and a share; the person and share show beside it, and clicking them changes it. */
function SplitCell({ row, label, onOpen, onRemove }: { row: TxRow; label: string; onOpen: () => void; onRemove: () => void }) {
  const on = row.partyId !== null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Checkbox checked={on} onCheckedChange={(next) => (next === true ? onOpen() : onRemove())} aria-label={`${label}: ${on ? "on, untick to remove" : "off, tick to split"}`} />
      {on ? (
        <button type="button" onClick={onOpen} className="rounded-md bg-amber-50 px-2 py-0.5 text-left text-xs text-amber-900 hover:bg-amber-100" title="Change the split">
          <span className="font-medium">{row.person}</span>
          {row.splitPercent !== null ? <span> · {formatPercent(row.splitPercent)}</span> : null}
          {row.sharePaise !== null ? <span> · {formatINR(row.sharePaise)}</span> : null}
        </button>
      ) : null}
    </div>
  );
}

/** ⋮ menu: Edit (opens the pop-up) and Delete. */
function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}>
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
