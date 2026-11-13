"use client";

import { ArrowDownToLine, ArrowLeftRight, ArrowUpToLine, Copy, Loader2, MoreVertical, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { DatePicker, TimePicker } from "@/components/shared/date-picker";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { saveBulkAction, saveTransferAction } from "../actions";
import { availablePersons, keywordsFor } from "../availability";
import { clearDraft, readDraft, writeDraft } from "../bulk-draft";
import { addNextDay, cloneRows, deleteRows, insertRow, isCreditRow, nextCell, rowWithAmounts, rowWithReason, rowsToAdd, type BulkRow, type Direction, type RowChange } from "../bulk-rows";
import { groupBanks, groupCategories } from "../cascade";
import { istTimeOf } from "../datetime";
import { peopleShares, shareValueOf, type FormShare } from "../entry-state";
import type { QuickPayOptions } from "../types";
import { MAX_BULK_ROWS, isBlankBulkRow, validateBulk, type BulkRowErrors } from "../validation";
import { InlineAdd } from "./inline-add";
import { PeoplePicker } from "./people-picker";
import { ShareFields } from "./split-control";
import { SelfTransferDialog, SelfTransferItem } from "./transfer-dialog";
import { useQuickAdd, type QuickAddHostActions } from "./use-quick-add";

const bankName = (options: QuickPayOptions, id: string) => options.banks.find((b) => b.id === id)?.name ?? "Bank";
const newKey = () => crypto.randomUUID();
const newRequestId = () => crypto.randomUUID();

const blankRow = (date: string, time: string, key = newKey()): BulkRow => ({
  key, date, time, debit: "", credit: "", reason: "", accountId: null, categoryId: null, shares: [],
});

/** The five starting rows. Their keys are fixed (not random) so the server-rendered page and the browser agree. */
const startingRows = (date: string, time: string) => Array.from({ length: 5 }, (_, i) => blankRow(date, time, `start-${i}`));

const WIDE = "(min-width: 1400px)";
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
/** True where the sheet is a table (a wide screen); smaller screens get a card for each row. */
const useIsWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);

/** The columns the arrow keys move through, left to right. */
const COLS = 8;
const CONTROL = "input:not(:disabled), button[role=combobox], button[data-grid-control]:not(:disabled)";

const controlIn = (row: Element | null | undefined, col: number): HTMLElement | null => row?.querySelector<HTMLElement>(`td[data-col="${col}"]`)?.querySelector<HTMLElement>(CONTROL) ?? null;

function focusControl(control: HTMLElement | null) {
  if (!control) return;
  control.focus();
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
  // Typing replaces what was there, like a spreadsheet.
  if (control instanceof HTMLInputElement && control.type === "text") control.select();
}

/** One cell of the grid. On a phone the label shows above the box; on a wide screen the column header does that job. */
function Cell({ col, label, wide = false, children }: { col: number; label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <td data-col={col} className={cn("px-1 py-1 align-top max-[1399px]:block max-[1399px]:p-0 min-[1400px]:border-r min-[1400px]:border-border/60", wide && "max-[1399px]:col-span-2")}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground min-[1400px]:hidden">{label}</span>
      {children}
    </td>
  );
}

/**
 * Spreadsheet-style entry: one row per transaction with its own date and time. Debit and Credit are mutually exclusive, a
 * Credit has no category, a keyword in the Reason picks the category, and Split works as in Quick Entry (pick people, each
 * with a percentage and an amount). Nothing is saved until Save All, and then every row is saved together; until then the
 * sheet is kept in this browser, so a refresh does not lose it.
 *
 * Keys: the arrows move between cells; Space moves to the next box (in Reason, two spaces in a row do); Enter moves to the
 * next line, and on the last line starts a new row. Each row has a ⋮ menu (Insert row above or below, Clone, Delete).
 */
export function BulkEntry({
  options: initialOptions,
  today,
  nowTime,
  saveBulk,
  quickActions,
}: {
  options: QuickPayOptions;
  /** Today's date (YYYY-MM-DD) and the current time (HH:mm) in IST, used to pre-fill new rows. */
  today: string;
  nowTime: string;
  saveBulk: typeof saveBulkAction;
  /** For adding a category or a person without leaving the sheet. */
  quickActions: QuickAddHostActions & { saveTransfer?: typeof saveTransferAction };
}) {
  const [options, setOptions] = useState(initialOptions);
  const adders = useQuickAdd(quickActions, setOptions);
  const router = useRouter();
  const wide = useIsWide();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rows, setRows] = useState<BulkRow[]>(() => startingRows(today, nowTime));
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<Record<string, BulkRowErrors>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  // How many rows "Add rows" adds (starts at 5), and which date "Add row" gives the new row.
  const [howMany, setHowMany] = useState("5");
  const [addMode, setAddMode] = useState<"today" | "next">("today");
  const [saving, setSaving] = useState(false);
  // The row whose Bank Through list was used to open Self Transfer; its Debit is the (fixed) amount of the transfer.
  // The transfer stays on that row, and is saved together with every other row when Save All is pressed.
  const [transferFor, setTransferFor] = useState<BulkRow | null>(null);
  // One id per sheet: sending the same sheet again (retry, double click) can never save it twice.
  const [requestId, setRequestId] = useState(newRequestId);
  // After rows are added, the cursor goes to the first new one.
  const focusAfter = useRef<{ key: string; col: number } | null>(null);

  const bankGroups = useMemo(() => groupBanks(options.banks), [options.banks]);
  const categoryGroups = useMemo(() => groupCategories(options.categories), [options.categories]);
  const creditCategoryGroups = useMemo(() => groupCategories(options.creditCategories), [options.creditCategories]);

  // Bring back what was typed before the page was refreshed.
  useEffect(() => {
    const draft = readDraft();
    // Reading the browser's storage can only happen after the page is shown, so the saved rows are put in now.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setRows(draft);
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) writeDraft(rows);
  }, [rows, restored]);

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

  function update(key: string, changes: Partial<BulkRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...changes } : r)));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: {} }));
  }
  const change = (key: string, fn: (row: BulkRow) => BulkRow) => {
    setRows((all) => all.map((r) => (r.key === key ? fn(r) : r)));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: {} }));
  };

  // ── Adding rows ──
  function addRows() {
    const count = rowsToAdd(howMany, MAX_BULK_ROWS - rows.length);
    if (count === 0) return void toast.error(`A sheet can hold at most ${MAX_BULK_ROWS} rows.`);
    setRows((all) => {
      const last = all.at(-1);
      // New rows start from the previous row's date and time, which is what you want when typing a day's entries.
      return [...all, ...Array.from({ length: count }, () => blankRow(last?.date ?? today, last?.time ?? nowTime))];
    });
  }

  /** Self Transfer from a row: the amount is what was typed in that row's Debit, and the transfer cannot change it. */
  function openTransfer(row: BulkRow) {
    const typed = row.debit.trim() || row.credit.trim();
    const paise = parseAmountInput(typed);
    if (!paise || paise <= 0) return void toast.error("Type the amount in Debit first. The transfer uses that amount.");
    setTransferFor(row);
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
  function apply(result: RowChange | { error: string }, focusCol = 0) {
    if ("error" in result) return void toast.error(result.error);
    setRows(result.rows as BulkRow[]);
    focusAfter.current = result.added[0] ? { key: result.added[0], col: focusCol } : null;
  }

  /** One new row: dated today, or the day after the last row, as chosen beside the button. */
  function addOne() {
    if (addMode === "next") return apply(addNextDay(rows, (d, t) => blankRow(d, t), today, MAX_BULK_ROWS), 2);
    if (rows.length >= MAX_BULK_ROWS) return void toast.error(`A sheet can hold at most ${MAX_BULK_ROWS} rows.`);
    const fresh = blankRow(today, istTimeOf(new Date()));
    setRows((all) => [...all, fresh]);
    focusAfter.current = { key: fresh.key, col: 2 };
  }

  function insert(key: string, where: "above" | "below") {
    apply(insertRow(rows, key, where, (d, t) => blankRow(d, t), MAX_BULK_ROWS));
  }

  function clone(key: string) {
    const keys = targetsOf(key);
    const result = cloneRows(rows, keys, newKey, MAX_BULK_ROWS);
    apply(result);
    if (!("error" in result)) {
      setSelected(new Set());
      toast.success(`${result.added.length} row${result.added.length === 1 ? "" : "s"} cloned.`);
    }
  }

  function remove(key: string) {
    const keys = targetsOf(key);
    const before = rows;
    const removed = before.map((row, index) => ({ row, index })).filter((x) => keys.has(x.row.key));
    setRows(deleteRows(before, keys, () => blankRow(today, nowTime)) as BulkRow[]);
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

  // ── Keyboard ──
  const rowsInGrid = (tr: HTMLElement) => {
    const body = tr.parentElement;
    return body ? [...body.querySelectorAll<HTMLElement>(":scope > tr[data-grid-row]")] : [];
  };

  function onGridKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    // Inside an open dropdown list the keys belong to the list.
    if (target.closest("[data-popup]")) return;
    const cell = target.closest<HTMLElement>("td[data-col]");
    const tr = cell?.parentElement;
    if (!cell || !tr) return;
    const col = Number(cell.dataset.col);
    const isInput = target instanceof HTMLInputElement;
    const trs = rowsInGrid(tr);
    const at = trs.indexOf(tr);
    const usable = (r: number, c: number) => controlIn(trs[r], c) !== null;

    // Enter: the next line, same box. On the last line it starts a new row.
    if (event.key === "Enter" && isInput && target.type === "text" && !event.shiftKey) {
      event.preventDefault();
      const down = nextCell({ rows: trs.length, cols: COLS }, { row: at, col }, "down", usable);
      if (down) return focusControl(controlIn(trs[down.row], down.col));
      if (rows.length >= MAX_BULK_ROWS) return void toast.error(`A sheet can hold at most ${MAX_BULK_ROWS} rows.`);
      const last = rows.at(-1);
      const fresh = blankRow(last?.date ?? today, last?.time ?? nowTime);
      setRows((all) => [...all, fresh]);
      focusAfter.current = { key: fresh.key, col };
      return;
    }

    // Space: the next box (amounts), or two spaces in a row in Reason.
    if (event.key === " " && isInput && (col === 2 || col === 3 || col === 4) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (col === 4) {
        const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
        if (!(target.value.endsWith(" ") && atEnd)) return; // the first space is typed as usual
        const key = tr.id.replace(/^row-/, "");
        change(key, (r) => rowWithReason(r, r.reason.trimEnd(), keywordsFor(options, isCreditRow(r) ? "CREDIT" : "DEBIT")));
      }
      event.preventDefault();
      const right = nextCell({ rows: trs.length, cols: COLS }, { row: at, col }, "right", usable);
      if (right) focusControl(controlIn(trs[right.row], right.col));
      return;
    }

    // Arrows
    const directions: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const direction = directions[event.key];
    if (!direction || event.altKey || event.metaKey || event.shiftKey) return;
    const horizontal = direction === "left" || direction === "right";
    if (horizontal) {
      if (event.ctrlKey) return;
      // In a text box the arrows move the cursor until it reaches the end, then they move to the next cell.
      if (isInput && target.type === "text") {
        const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
        const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
        if (direction === "left" ? !atStart : !atEnd) return;
      }
    } else if (event.ctrlKey) return;

    const found = nextCell({ rows: trs.length, cols: COLS }, { row: at, col }, direction, usable);
    if (!found) return;
    event.preventDefault();
    focusControl(controlIn(trs[found.row], found.col));
  }

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
    clearDraft();
    setRows(startingRows(today, nowTime));
    setSelected(new Set());
    setRequestId(newRequestId());
  }

  /** Cancel, once confirmed: the sheet and its draft are thrown away (nothing is kept), and the page goes back to GPay Transactions. */
  async function cancelSheet(): Promise<string | null> {
    clearDraft();
    setRows(startingRows(today, nowTime));
    setErrors({});
    setSelected(new Set());
    router.push("/quick-pay/transactions");
    return null;
  }

  const bad = (key: string, field: keyof BulkRowErrors) => Boolean(errors[key]?.[field]);
  // On a wide screen the boxes are plain (like a spreadsheet); they only show a frame when hovered or focused.
  const field = cn("h-8 text-base min-[1400px]:text-sm", wide && "border-transparent bg-transparent shadow-none hover:bg-muted/60 focus-visible:bg-background");
  const count = selected.size;

  const menu = (key: string, index: number) => (
    <RowMenu label={`Row ${index + 1} actions`} count={targetsOf(key).size} onInsert={(where) => insert(key, where)} onClone={() => clone(key)} onDelete={() => remove(key)} />
  );

  return (
    <div className="space-y-3">
      {/* Everything you press is at the top: add rows, save, and the totals */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" onClick={addOne} disabled={rows.length >= MAX_BULK_ROWS}>
            <Plus /> Add row
          </Button>
          <select
            aria-label="Date of the new row"
            value={addMode}
            onChange={(e) => setAddMode(e.target.value as "today" | "next")}
            className="h-9 rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          >
            <option value="today">Today</option>
            <option value="next">Next day</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" onClick={addRows} disabled={rows.length >= MAX_BULK_ROWS}>
            <Plus /> Add rows
          </Button>
          <Input
            inputMode="numeric"
            aria-label="How many rows to add"
            title="How many rows to add"
            value={howMany}
            onChange={(e) => setHowMany(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            onBlur={() => setHowMany((v) => (v.trim() === "" || Number(v) < 1 ? "5" : v))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRows();
              }
            }}
            className="h-9 w-16 text-center text-base tabular-nums sm:text-sm"
          />
        </div>
        <Button type="button" onClick={saveAll} disabled={saving || totals.filled === 0}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : `Save All${totals.filled ? ` (${totals.filled})` : ""}`}
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirmCancel(true)} disabled={saving}>
          Cancel
        </Button>
        <Link href="/quick-pay/transactions" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Back to GPay Transactions
        </Link>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {totals.filled} row{totals.filled === 1 ? "" : "s"} · Debit {formatINR(totals.debit)} · Credit {formatINR(totals.credit)}
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

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
          <span className="hidden text-xs text-muted-foreground min-[1400px]:inline">Tip: arrows move between boxes, Space goes to the next box, Enter goes to the next line.</span>
        )}
      </div>

      <div className="min-[1400px]:rounded-lg min-[1400px]:border min-[1400px]:bg-card">
        <table className="w-full table-fixed text-sm" onKeyDown={onGridKeyDown}>
          <colgroup className="max-[1399px]:hidden">
            <col style={{ width: "3.25rem" }} />
            <col style={{ width: "12.5rem" }} />
            <col style={{ width: "7rem" }} />
            <col style={{ width: "6.5rem" }} />
            <col style={{ width: "6.5rem" }} />
            <col />
            <col style={{ width: "10rem" }} />
            <col style={{ width: "11rem" }} />
            <col style={{ width: "16rem" }} />
            <col style={{ width: "2.25rem" }} />
          </colgroup>
          <thead className="hidden border-b bg-muted/50 text-xs text-muted-foreground min-[1400px]:table-header-group">
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-medium">
                <span className="sr-only">Select and row number</span>#
              </th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Date</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Time</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Debit</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Credit</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Reason</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Bank Through</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Category</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Split</th>
              <th scope="col" className="px-1 py-2">
                <span className="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="max-[1399px]:block min-[1400px]:divide-y">
            {rows.map((row, index) => {
              const e = errors[row.key] ?? {};
              const hasDebit = row.debit.trim() !== "";
              const hasCredit = row.credit.trim() !== "";
              const credit = isCreditRow(row);
              const on = selected.has(row.key);
              const amountPaise = parseAmountInput(hasDebit ? row.debit : row.credit);
              const shares = row.shares as FormShare[];
              const people = availablePersons(options, "SPLIT", shares.map((s) => s.partyId));
              return (
                <tr
                  key={row.key}
                  id={`row-${row.key}`}
                  data-grid-row=""
                  aria-selected={on}
                  className={cn(
                    "max-[1399px]:mb-3 max-[1399px]:grid max-[1399px]:grid-cols-2 max-[1399px]:gap-x-2 max-[1399px]:gap-y-2 max-[1399px]:rounded-xl max-[1399px]:border max-[1399px]:bg-card max-[1399px]:p-3",
                    on && "bg-amber-50/60 max-[1399px]:border-amber-300",
                    Object.keys(e).length > 0 && "bg-destructive/5",
                  )}
                >
                  <td className="px-2 py-2.5 max-[1399px]:col-span-2 max-[1399px]:flex max-[1399px]:items-center max-[1399px]:justify-between max-[1399px]:p-0 min-[1400px]:border-r min-[1400px]:border-border/60">
                    <span className="flex items-center gap-2">
                      <Checkbox checked={on} onCheckedChange={() => toggle(row.key)} aria-label={`Select row ${index + 1}`} />
                      <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    </span>
                    {/* On a phone the menu sits in the card's top corner */}
                    <span className="min-[1400px]:hidden">{menu(row.key, index)}</span>
                  </td>
                  <Cell col={0} label="Date">
                    <DatePicker compact bare={wide} ariaLabel={`Row ${index + 1} date`} value={row.date} max={today} invalid={bad(row.key, "date")} onChange={(d) => update(row.key, { date: d })} />
                    {e.date ? <p className="mt-0.5 text-[11px] text-destructive">{e.date}</p> : null}
                  </Cell>
                  <Cell col={1} label="Time">
                    <TimePicker compact bare={wide} ariaLabel={`Row ${index + 1} time`} value={row.time} invalid={bad(row.key, "time")} onChange={(t) => update(row.key, { time: t })} />
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
                      onChange={(ev) => change(row.key, (r) => rowWithAmounts(r, { debit: ev.target.value }))}
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
                      onChange={(ev) => change(row.key, (r) => rowWithAmounts(r, { credit: ev.target.value }))}
                      className={cn(field, "text-right tabular-nums")}
                    />
                  </Cell>
                  <Cell col={4} label="Reason" wide>
                    <Input
                      aria-label={`Row ${index + 1} reason`}
                      placeholder="Reason"
                      value={row.reason}
                      maxLength={200}
                      onChange={(ev) => change(row.key, (r) => rowWithReason(r, ev.target.value, keywordsFor(options, isCreditRow(r) ? "CREDIT" : "DEBIT")))}
                      className={field}
                    />
                    {e.amount ? <p className="mt-0.5 text-[11px] text-destructive">{e.amount}</p> : null}
                    {e.reason ? <p className="mt-0.5 text-[11px] text-destructive">{e.reason}</p> : null}
                  </Cell>
                  <Cell col={5} label="Bank Through">
                    {row.transfer ? (
                      <div className="flex h-8 items-center gap-1.5 rounded-md bg-sky-50 px-2 text-sm text-sky-800" title="Self transfer, saved with Save All">
                        <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {bankName(options, row.transfer.fromId)} → {bankName(options, row.transfer.toId)}
                        </span>
                        <button type="button" data-grid-control="" aria-label={`Row ${index + 1}: remove the self transfer`} onClick={() => update(row.key, { transfer: null, accountId: null })} className="rounded p-0.5 hover:bg-sky-100">
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : (
                    <CascadingSelect compact bare={wide} ariaLabel={`Row ${index + 1} bank`} groups={bankGroups} value={row.accountId} onChange={(v) => update(row.key, { accountId: v })} placeholder="Bank" searchPlaceholder="Search banks…" invalid={bad(row.key, "bank")} footer={quickActions.saveTransfer ? <SelfTransferItem onOpen={() => openTransfer(row)} /> : undefined} />
                    )}
                    {e.bank ? <p className="mt-0.5 text-[11px] text-destructive">{e.bank}</p> : null}
                  </Cell>
                  <Cell col={6} label="Category">
                    {row.transfer ? (<p className="flex h-8 items-center px-2.5 text-sm text-muted-foreground">—</p>) : (<>
                    {/* As in Quick Entry: a Debit and a Credit have different categories; a keyword in the Reason picks it; a new one can be added here */}
                    <CascadingSelect
                      compact
                      bare={wide}
                      clearable
                      ariaLabel={`Row ${index + 1} category`}
                      groups={credit ? creditCategoryGroups : categoryGroups}
                      value={row.categoryId}
                      onChange={(v) => update(row.key, { categoryId: v, categoryManual: true, categoryAuto: false })}
                      placeholder={row.categoryAuto ? "Category · auto" : "Category"}
                      searchPlaceholder="Search categories…"
                      emptyText="No category found. Add one below."
                      footer={
                        <InlineAdd
                          label="New category"
                          placeholder="Add a category…"
                          onAdd={async (name) => {
                            const added = await adders.addCategory(name, credit ? "CREDIT" : "DEBIT");
                            if (added.ok) update(row.key, { categoryId: added.id, categoryManual: true, categoryAuto: false });
                            return added;
                          }}
                        />
                      }
                    />

                  </>)}
                  </Cell>
                  <Cell col={7} label="Split" wide>
                    {row.transfer ? (<p className="flex h-8 items-center px-2.5 text-sm text-muted-foreground">—</p>) : (<>
                    {/* As in Quick Entry: pick people; each gets a percentage and an amount */}
                    <PeoplePicker
                      compact
                      bare={wide}
                      ariaLabel={`Row ${index + 1} split`}
                      people={people}
                      selected={shares.map((s) => s.partyId)}
                      invalid={bad(row.key, "split")}
                      onChange={(ids) => update(row.key, { shares: peopleShares(shares, ids, "SPLIT", options.settings) })}
                      onAddPerson={async (name) => adders.addPerson(name)}
                    />
                    {shares.length > 0 ? (
                      <ul className="mt-1 space-y-1" aria-label={`Row ${index + 1} shares`}>
                        {shares.map((share) => {
                          const name = options.persons.find((p) => p.id === share.partyId)?.name ?? "Person";
                          return (
                            <li key={share.partyId} className="flex items-center gap-1.5">
                              {shares.length > 1 ? (
                                <span className="min-w-0 flex-1 truncate text-xs font-medium" title={name}>
                                  {name}
                                </span>
                              ) : null}
                              <ShareFields
                                compact
                                share={share}
                                name={name}
                                amountPaise={amountPaise}
                                savedPaise={null}
                                percentOptions={options.settings.split.percentOptions}
                                showPercent={options.settings.split.showPercent}
                                showAmount={options.settings.split.showAmount}
                                onChange={(method, value) => update(row.key, { shares: shareValueOf(shares, share.partyId, method, value) })}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {e.split ? <p className="mt-0.5 text-[11px] text-destructive">{e.split}</p> : null}
                  </>)}
                  </Cell>
                  <td className={cn("px-1 py-1 align-top max-[1399px]:hidden")}>{menu(row.key, index)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {quickActions.saveTransfer ? (
        <SelfTransferDialog
          open={transferFor !== null}
          onOpenChange={(open) => {
            if (!open) setTransferFor(null);
          }}
          options={options}
          saveTransfer={quickActions.saveTransfer}
          // Nothing is saved here: the transfer is kept on the row and saved with Save All.
          onChoose={(choice) => {
            if (!transferFor) return;
            update(transferFor.key, { transfer: { fromId: choice.fromId, toId: choice.toId }, accountId: choice.fromId, reason: choice.reason, categoryId: null, categoryManual: false, categoryAuto: false, shares: [] });
            setTransferFor(null);
            toast.success("Self transfer added to the sheet. It is saved with Save All.");
          }}
          fixedAmount={transferFor ? (transferFor.debit.trim() || transferFor.credit.trim()) : undefined}
          initialReason={transferFor?.reason}
          initial={transferFor?.transfer ? { fromId: transferFor.transfer.fromId, toId: transferFor.transfer.toId } : undefined}
        />
      ) : null}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this sheet?"
        description="Everything typed here is thrown away and it is not kept as a draft. This cannot be undone."
        confirmLabel="Yes, cancel"
        onConfirm={cancelSheet}
      />
    </div>
  );
}

/** ⋮ menu for one row: Insert row above or below, Clone, Delete. */
function RowMenu({
  label,
  count,
  onInsert,
  onClone,
  onDelete,
}: {
  label: string;
  /** How many rows Clone and Delete will act on. */
  count: number;
  onInsert: (where: "above" | "below") => void;
  onClone: () => void;
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 /> {many ? `Delete ${count} rows` : "Delete"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
