"use client";

import { ArrowDownToLine, ArrowUpToLine, Copy, ListChecks, Loader2, MoreVertical, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { saveBulkAction } from "../actions";
import { cloneRows, deleteRows, insertRow, nextCell, type Direction, type RowChange } from "../bulk-rows";
import { groupBanks, groupCategories } from "../cascade";
import type { QuickPayOptions } from "../types";
import { MAX_BULK_ROWS, isBlankBulkRow, validateBulk, type BulkRowErrors, type BulkRowInput } from "../validation";

const newKey = () => crypto.randomUUID();
const newRequestId = () => crypto.randomUUID();

const blankRow = (date: string, time: string, key = newKey()): BulkRowInput => ({
  key, date, time, debit: "", credit: "", reason: "", accountId: null, categoryId: null, partyId: null,
});

/** The five starting rows. Their keys are fixed (not random) so the server-rendered page and the browser agree. */
const startingRows = (date: string, time: string) => Array.from({ length: 5 }, (_, i) => blankRow(date, time, `start-${i}`));

/** The columns the arrow keys move through, left to right. */
const COLS = 8;
const CONTROL = "input:not(:disabled), button[role=combobox]";

const controlIn = (row: Element | null | undefined, col: number): HTMLElement | null => row?.querySelector<HTMLElement>(`td[data-col="${col}"]`)?.querySelector<HTMLElement>(CONTROL) ?? null;

function focusControl(control: HTMLElement | null) {
  if (!control) return;
  control.focus();
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
  // Typing replaces what was there, like a spreadsheet. Date and time boxes have no text to select.
  if (control instanceof HTMLInputElement && control.type === "text") control.select();
}

/** One cell of the grid. On a phone the label shows above the box; on a wide screen the column header does that job. */
function Cell({ col, label, wide = false, children }: { col: number; label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <td data-col={col} className={cn("px-1.5 py-1.5 align-top max-md:block max-md:p-0", wide && "max-md:col-span-2")}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">{label}</span>
      {children}
    </td>
  );
}

/**
 * Spreadsheet-style entry: one row per transaction with its own date and time. Debit and Credit are mutually exclusive.
 * Nothing is saved until Save All, and then every row is saved together.
 *
 * Each row has a ⋮ menu (Insert row above or below, Clone, Select all, Delete) and a tick box; menu actions apply to the
 * ticked rows when the row is one of them. The arrow keys move between cells. On a phone each row is a card.
 */
export function BulkEntry({
  options,
  today,
  nowTime,
  saveBulk,
}: {
  options: QuickPayOptions;
  /** Today's date (YYYY-MM-DD) and the current time (HH:mm) in IST, used to pre-fill new rows. */
  today: string;
  nowTime: string;
  saveBulk: typeof saveBulkAction;
}) {
  const [rows, setRows] = useState<BulkRowInput[]>(() => startingRows(today, nowTime));
  const [errors, setErrors] = useState<Record<string, BulkRowErrors>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per sheet: sending the same sheet again (retry, double click) can never save it twice.
  const [requestId, setRequestId] = useState(newRequestId);
  // After rows are added, the cursor goes to the first new one.
  const focusAfter = useRef<{ key: string; col: number } | null>(null);

  const bankGroups = useMemo(() => groupBanks(options.banks), [options.banks]);
  const categoryGroups = useMemo(() => groupCategories(options.categories), [options.categories]);
  const persons = options.persons.map((p) => ({ value: p.id, label: p.name }));

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    let filled = 0;
    for (const r of rows) {
      if (isBlankBulkRow(r)) continue;
      filled++;
      debit += parseAmountInput(r.debit) ?? 0;
      credit += parseAmountInput(r.credit) ?? 0;
    }
    return { debit, credit, filled };
  }, [rows]);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    focusControl(controlIn(document.getElementById(`row-${target.key}`), target.col));
  }, [rows]);

  function update(key: string, changes: Partial<BulkRowInput>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...changes } : r)));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: {} }));
  }

  function addRows(count: number) {
    setRows((all) => {
      const last = all.at(-1);
      // New rows start from the previous row's date and time, which is what you want when typing a day's entries.
      return [...all, ...Array.from({ length: count }, () => blankRow(last?.date ?? today, last?.time ?? nowTime))];
    });
  }

  // ── Selecting rows ──
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.key));
  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const selectAll = (on: boolean) => setSelected(on ? new Set(rows.map((r) => r.key)) : new Set());
  /** A menu action applies to the ticked rows when the row it was opened on is one of them, otherwise to that row alone. */
  const targetsOf = (key: string): ReadonlySet<string> => (selected.has(key) ? selected : new Set([key]));

  // ── Row actions ──
  function apply(change: RowChange | { error: string }, focusCol = 0) {
    if ("error" in change) return void toast.error(change.error);
    setRows(change.rows);
    focusAfter.current = change.added[0] ? { key: change.added[0], col: focusCol } : null;
  }

  function insert(key: string, where: "above" | "below") {
    apply(insertRow(rows, key, where, (d, t) => blankRow(d, t), MAX_BULK_ROWS));
  }

  function clone(key: string) {
    const keys = targetsOf(key);
    const change = cloneRows(rows, keys, newKey, MAX_BULK_ROWS);
    apply(change);
    if (!("error" in change)) {
      setSelected(new Set());
      toast.success(`${change.added.length} row${change.added.length === 1 ? "" : "s"} cloned.`);
    }
  }

  function remove(key: string) {
    const keys = targetsOf(key);
    const before = rows;
    const removed = before.map((row, index) => ({ row, index })).filter((x) => keys.has(x.row.key));
    setRows(deleteRows(before, keys, () => blankRow(today, nowTime)));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.has(k))));
    setSelected(new Set());
    toast(`${removed.length} row${removed.length === 1 ? "" : "s"} deleted.`, {
      action: {
        label: "Undo",
        onClick: () =>
          setRows((now) => {
            // Everything was deleted and an empty row was put in its place: bring the old sheet back.
            if (removed.length === before.length) return before;
            const back = [...now];
            for (const { row, index } of removed) back.splice(Math.min(index, back.length), 0, row);
            return back;
          }),
      },
    });
  }

  // ── Arrow keys ──
  const onGridKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const directions: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const direction = directions[event.key];
    if (!direction || event.altKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement;
    // Inside an open dropdown list the arrows belong to the list.
    if (target.closest("[data-popup]")) return;
    const cell = target.closest<HTMLElement>("td[data-col]");
    const tr = cell?.parentElement;
    if (!cell || !tr) return;

    const isInput = target instanceof HTMLInputElement;
    const picker = isInput && (target.type === "date" || target.type === "time");
    const horizontal = direction === "left" || direction === "right";
    if (horizontal) {
      // Date and time boxes use left and right to move between day, month and year: hold Ctrl to leave the cell.
      if (picker && !event.ctrlKey) return;
      if (!picker && event.ctrlKey) return;
      // In a text box the arrows move the cursor until it reaches the end, then they move to the next cell.
      if (isInput && target.type === "text") {
        const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
        const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
        if (direction === "left" ? !atStart : !atEnd) return;
      }
    } else if (event.ctrlKey) return;

    const body = tr.parentElement;
    const trs = body ? [...body.querySelectorAll<HTMLElement>(":scope > tr[data-grid-row]")] : [];
    const found = nextCell({ rows: trs.length, cols: COLS }, { row: trs.indexOf(tr), col: Number(cell.dataset.col) }, direction, (r, c) => controlIn(trs[r], c) !== null);
    if (!found) return;
    event.preventDefault();
    focusControl(controlIn(trs[found.row], found.col));
  }, []);

  // ── Saving ──
  async function saveAll() {
    if (saving) return;
    setFormError(null);

    const checked = validateBulk(rows, new Date());
    if (!checked.ok) {
      setErrors(checked.errors);
      setFormError(checked.message);
      const firstBad = rows.find((r) => checked.errors[r.key]);
      if (firstBad) document.getElementById(`row-${firstBad.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});

    setSaving(true);
    let result: Awaited<ReturnType<typeof saveBulkAction>>;
    try {
      result = await saveBulk({ requestId, rows });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and press Save All again." };
    }
    setSaving(false);

    if (!result.ok) {
      setFormError(result.error);
      if ("rowErrors" in result) setErrors(result.rowErrors);
      toast.error(result.error);
      return;
    }
    toast.success(result.duplicate ? "That sheet was already saved." : `${result.count} transaction${result.count === 1 ? "" : "s"} saved.`, {
      description: "Totals, the table and bank balances are updated.",
    });
    setRows(startingRows(today, nowTime));
    setSelected(new Set());
    setRequestId(newRequestId());
  }

  const bad = (key: string, field: keyof BulkRowErrors) => Boolean(errors[key]?.[field]);
  const field = "h-8 text-base md:text-sm";
  const count = selected.size;

  const menu = (key: string, index: number) => {
    const n = targetsOf(key).size;
    return (
      <RowMenu
        label={`Row ${index + 1} actions`}
        count={n}
        allSelected={allSelected}
        onInsert={(where) => insert(key, where)}
        onClone={() => clone(key)}
        onSelectAll={() => selectAll(!allSelected)}
        onDelete={() => remove(key)}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Selection toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <Checkbox checked={allSelected} onCheckedChange={(v) => selectAll(v === true)} aria-label="Select all rows" />
          Select all
        </label>
        {count > 0 ? (
          <>
            <span className="text-muted-foreground tabular-nums" aria-live="polite">
              {count} selected
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => clone([...selected][0]!)}>
              <Copy /> Clone
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => remove([...selected][0]!)}>
              <Trash2 /> Delete
            </Button>
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </>
        ) : (
          <span className="hidden text-xs text-muted-foreground md:inline">Tip: use the arrow keys to move between cells.</span>
        )}
      </div>

      <div className="rounded-xl border bg-card max-md:border-0 max-md:bg-transparent md:overflow-x-auto">
        <table className="w-full text-sm md:min-w-[74rem]" onKeyDown={onGridKeyDown}>
          <thead className="hidden border-b bg-muted/50 text-xs text-muted-foreground md:table-header-group">
            <tr>
              <th scope="col" className="w-16 px-2 py-2 text-left font-medium">
                <span className="sr-only">Select and row number</span>#
              </th>
              <th scope="col" className="w-36 px-1.5 py-2 text-left font-medium">Date</th>
              <th scope="col" className="w-24 px-1.5 py-2 text-left font-medium">Time</th>
              <th scope="col" className="w-28 px-1.5 py-2 text-left font-medium">Debit</th>
              <th scope="col" className="w-28 px-1.5 py-2 text-left font-medium">Credit</th>
              <th scope="col" className="min-w-44 px-1.5 py-2 text-left font-medium">Reason</th>
              <th scope="col" className="w-44 px-1.5 py-2 text-left font-medium">Bank Through</th>
              <th scope="col" className="w-44 px-1.5 py-2 text-left font-medium">Category</th>
              <th scope="col" className="w-36 px-1.5 py-2 text-left font-medium">Split</th>
              <th scope="col" className="w-10 px-1.5 py-2 md:sticky md:right-0 md:bg-muted">
                <span className="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="max-md:block md:divide-y">
            {rows.map((row, index) => {
              const e = errors[row.key] ?? {};
              const hasDebit = row.debit.trim() !== "";
              const hasCredit = row.credit.trim() !== "";
              const on = selected.has(row.key);
              return (
                <tr
                  key={row.key}
                  id={`row-${row.key}`}
                  data-grid-row=""
                  aria-selected={on}
                  className={cn(
                    "max-md:mb-3 max-md:grid max-md:grid-cols-2 max-md:gap-x-2 max-md:gap-y-2 max-md:rounded-xl max-md:border max-md:bg-card max-md:p-3",
                    on && "bg-amber-50/60 max-md:border-amber-300",
                    Object.keys(e).length > 0 && "bg-destructive/5",
                  )}
                >
                  <td className="px-2 py-2.5 max-md:col-span-2 max-md:flex max-md:items-center max-md:justify-between max-md:p-0">
                    <span className="flex items-center gap-2">
                      <Checkbox checked={on} onCheckedChange={() => toggle(row.key)} aria-label={`Select row ${index + 1}`} />
                      <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    </span>
                    {/* On a phone the menu sits in the card's top corner */}
                    <span className="md:hidden">{menu(row.key, index)}</span>
                  </td>
                  <Cell col={0} label="Date">
                    <Input type="date" aria-label={`Row ${index + 1} date`} value={row.date} max={today} aria-invalid={bad(row.key, "date")} onChange={(ev) => update(row.key, { date: ev.target.value })} className={field} />
                    {e.date ? <p className="mt-0.5 text-[11px] text-destructive">{e.date}</p> : null}
                  </Cell>
                  <Cell col={1} label="Time">
                    <Input type="time" aria-label={`Row ${index + 1} time`} value={row.time} aria-invalid={bad(row.key, "time")} onChange={(ev) => update(row.key, { time: ev.target.value })} className={field} />
                    {e.time ? <p className="mt-0.5 text-[11px] text-destructive">{e.time}</p> : null}
                  </Cell>
                  <Cell col={2} label="Debit">
                    <Input
                      inputMode="decimal"
                      aria-label={`Row ${index + 1} debit`}
                      placeholder="0.00"
                      value={row.debit}
                      disabled={hasCredit}
                      aria-invalid={bad(row.key, "amount")}
                      onChange={(ev) => update(row.key, { debit: ev.target.value })}
                      className={cn(field, "text-right tabular-nums")}
                    />
                  </Cell>
                  <Cell col={3} label="Credit">
                    <Input
                      inputMode="decimal"
                      aria-label={`Row ${index + 1} credit`}
                      placeholder="0.00"
                      value={row.credit}
                      disabled={hasDebit}
                      aria-invalid={bad(row.key, "amount")}
                      onChange={(ev) => update(row.key, { credit: ev.target.value })}
                      className={cn(field, "text-right tabular-nums")}
                    />
                  </Cell>
                  <Cell col={4} label="Reason" wide>
                    <Input aria-label={`Row ${index + 1} reason`} placeholder="Reason" value={row.reason} maxLength={200} onChange={(ev) => update(row.key, { reason: ev.target.value })} className={field} />
                    {e.amount ? <p className="mt-0.5 text-[11px] text-destructive">{e.amount}</p> : null}
                    {e.reason ? <p className="mt-0.5 text-[11px] text-destructive">{e.reason}</p> : null}
                  </Cell>
                  <Cell col={5} label="Bank Through">
                    <CascadingSelect compact ariaLabel={`Row ${index + 1} bank`} groups={bankGroups} value={row.accountId} onChange={(v) => update(row.key, { accountId: v })} placeholder="Bank" searchPlaceholder="Search banks…" invalid={bad(row.key, "bank")} />
                    {e.bank ? <p className="mt-0.5 text-[11px] text-destructive">{e.bank}</p> : null}
                  </Cell>
                  <Cell col={6} label="Category">
                    <CascadingSelect compact clearable ariaLabel={`Row ${index + 1} category`} groups={categoryGroups} value={row.categoryId} onChange={(v) => update(row.key, { categoryId: v })} placeholder="Category" searchPlaceholder="Search categories…" />
                  </Cell>
                  <Cell col={7} label="Split" wide>
                    <SearchableSelect compact clearable ariaLabel={`Row ${index + 1} split`} options={persons} value={row.partyId} onChange={(v) => update(row.key, { partyId: v })} placeholder="Person" searchPlaceholder="Search people…" />
                  </Cell>
                  <td className={cn("px-1.5 py-1.5 align-top max-md:hidden md:sticky md:right-0", Object.keys(e).length > 0 ? "md:bg-red-50" : on ? "md:bg-amber-50" : "md:bg-card")}>{menu(row.key, index)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => addRows(1)} disabled={rows.length >= MAX_BULK_ROWS}>
          <Plus /> Add row
        </Button>
        <Button type="button" variant="outline" onClick={() => addRows(5)} disabled={rows.length + 5 > MAX_BULK_ROWS}>
          <Plus /> Add 5 rows
        </Button>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {totals.filled} row{totals.filled === 1 ? "" : "s"} · Debit {formatINR(totals.debit)} · Credit {formatINR(totals.credit)}
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={saveAll} disabled={saving || totals.filled === 0}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : `Save All${totals.filled ? ` (${totals.filled})` : ""}`}
        </Button>
        <Link href="/quick-pay/transactions" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Back to GPay Transactions
        </Link>
      </div>
    </div>
  );
}

/** ⋮ menu for one row: Insert row above or below, Clone, Select all, Delete. */
function RowMenu({
  label,
  count,
  allSelected,
  onInsert,
  onClone,
  onSelectAll,
  onDelete,
}: {
  label: string;
  /** How many rows Clone and Delete will act on. */
  count: number;
  allSelected: boolean;
  onInsert: (where: "above" | "below") => void;
  onClone: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
}) {
  const many = count > 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} className="text-muted-foreground" />}>
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onInsert("above")}>
          <ArrowUpToLine /> Insert row above
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onInsert("below")}>
          <ArrowDownToLine /> Insert row below
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClone}>
          <Copy /> {many ? `Clone ${count} rows` : "Clone"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSelectAll}>
          <ListChecks /> {allSelected ? "Deselect all" : "Select all"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 /> {many ? `Delete ${count} rows` : "Delete"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
