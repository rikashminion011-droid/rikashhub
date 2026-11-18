"use client";

import { ArrowDownToLine, ArrowUpToLine, Copy, Loader2, MoreVertical, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { SwapArrowsIcon } from "@/components/shared/swap-icon";
import { DatePicker, TimePicker } from "@/components/shared/date-picker";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { BulkDraftActions, getRecentCreditsAction, saveBulkAction, saveTransferAction } from "../actions";
import type { RecentCredit } from "../types";
import { CreditsPanel } from "./credits-panel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { keywordsFor } from "../availability";
import { cleanDraftRows, clearLocalDraft, readLocalDraft, writeLocalDraft } from "../bulk-draft";
import { addRowsAtEnd, cloneRows, deleteRows, insertRow, isCreditRow, nextCell, rowWithAmounts, rowWithReason, rowsToAdd, type AddRowsMode, type BulkRow, type Direction, type RowChange } from "../bulk-rows";
import { groupBanks, groupCategories } from "../cascade";
import { istTimeOf } from "../datetime";
import { bulkRowTone } from "../row-tone";
import { nextSwitch } from "../switching";
import type { QuickPayOptions } from "../types";
import { MAX_BULK_ROWS, isBlankBulkRow, validateBulk, type BulkRowErrors, type EntryType } from "../validation";
import { InlineAdd } from "./inline-add";
import { BulkRowMore } from "./bulk-row-more";
import { CycleButton } from "./cycle-button";
import { ReasonCategoryDialog } from "./reason-category-dialog";
import { SelfTransferButton, TypeToggle } from "./type-toggle";
import { officeDebtPerson, peopleShares } from "../entry-state";
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

/** The columns the arrow keys move through, left to right. */
const COLS = 6;
const WIDE = "(min-width: 1024px)";
const subscribeWide = (notify: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
/** True where the sheet is a spreadsheet (a wide screen); a phone gets a card for each row. */
const useIsWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
const CONTROL = "input:not(:disabled), button[role=combobox], button[data-grid-control]:not(:disabled)";

const controlIn = (row: Element | null | undefined, col: number): HTMLElement | null => row?.querySelector<HTMLElement>(`td[data-col="${col}"]`)?.querySelector<HTMLElement>(CONTROL) ?? null;

function focusControl(control: HTMLElement | null) {
  if (!control) return;
  control.focus();
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
  // Typing replaces what was there, like a spreadsheet.
  if (control instanceof HTMLInputElement && control.type === "text") control.select();
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
  draftActions,
}: {
  /** Keeps the sheet as a draft on the server, so it is the same on every device. */
  draftActions: BulkDraftActions;
  options: QuickPayOptions;
  /** Today's date (YYYY-MM-DD) and the current time (HH:mm) in IST, used to pre-fill new rows. */
  today: string;
  nowTime: string;
  saveBulk: typeof saveBulkAction;
  /** For adding a category or a person without leaving the sheet. */
  quickActions: QuickAddHostActions & { saveTransfer?: typeof saveTransferAction; getRecentCredits?: typeof getRecentCreditsAction };
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
  // Rows whose Debit/Credit button was pressed while still empty (the amount then decides which it is).
  const [kinds, setKinds] = useState<Record<string, EntryType>>({});
  // The row whose Reason is being put under a category.
  const [assignFor, setAssignFor] = useState<BulkRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // How many rows each Add row button adds (1 to begin with).
  const [howMany, setHowMany] = useState("1");
  const [saving, setSaving] = useState(false);
  // The row whose Through list was used to open Self Transfer; its Debit is the (fixed) amount of the transfer.
  // The transfer stays on that row, and is saved together with every other row when Save All is pressed.
  const [transferFor, setTransferFor] = useState<BulkRow | null>(null);
  // The row whose Credit History is open (double-click or press and hold on its Debit button), and the credits to choose from.
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [credits, setCredits] = useState<RecentCredit[] | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);
  // One id per sheet: sending the same sheet again (retry, double click) can never save it twice.
  const [requestId, setRequestId] = useState(newRequestId);
  // After rows are added, the cursor goes to the first new one.
  const focusAfter = useRef<{ key: string; col: number } | null>(null);

  const bankGroups = useMemo(() => groupBanks(options.banks), [options.banks]);
  const categoryGroups = useMemo(() => groupCategories(options.categories), [options.categories]);
  // The main categories the switch icon steps through (a Debit and a Credit share one list).
  const mainCategoryIds = useMemo(() => options.categories.filter((c) => !c.isSub).map((c) => c.id), [options.categories]);
  const switches = options.settings.switch;

  // Bring back the draft: the one saved on the server (the same on every device), or this browser's copy if that is newer.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = readLocalDraft();
      let server: { rows: BulkRow[]; savedAt: number } | null = null;
      try {
        const result = await draftActions.load();
        const rows = result.ok && result.draft ? cleanDraftRows(result.draft.rows) : null;
        if (result.ok && result.draft && rows) server = { rows, savedAt: result.draft.savedAt };
      } catch {
        // Offline: this browser's copy is used.
      }
      if (cancelled) return;
      const pick = server && (!local || server.savedAt >= local.savedAt) ? server : local;
      // The draft can only be read once the page is shown, so it is put in now.
      if (pick) setRows(pick.rows);
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftActions]);

  // Keep the draft as it is typed: this browser at once, the server a moment after typing stops (and straight away on leaving).
  const latestRows = useRef(rows);
  useEffect(() => {
    latestRows.current = rows;
  }, [rows]);
  useEffect(() => {
    if (!restored) return;
    writeLocalDraft(rows);
    const timer = setTimeout(() => void draftActions.save({ rows }).catch(() => undefined), 800);
    return () => clearTimeout(timer);
  }, [rows, restored, draftActions]);
  useEffect(() => {
    if (!restored) return;
    const flush = () => {
      if (document.visibilityState === "hidden") void draftActions.save({ rows: latestRows.current }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [restored, draftActions]);

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
  /** Adds the number of rows typed in the box: dated today, on the last row's date, or the day after it. */
  function addBy(mode: AddRowsMode) {
    const count = rowsToAdd(howMany, MAX_BULK_ROWS - rows.length);
    if (count === 0) return void toast.error(`A sheet can hold at most ${MAX_BULK_ROWS} rows.`);
    apply(addRowsAtEnd(rows, mode, count, (d, t) => blankRow(d, t), today, mode === "today" ? istTimeOf(new Date()) : nowTime, MAX_BULK_ROWS), 2);
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
    if (event.key === " " && isInput && (col === 2 || col === 3) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (col === 3) {
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

  // ── Debit or Credit ──
  /** A row is a Credit when its amount is in Credit, a Debit when it is in Debit; an empty row follows the button last pressed. */
  const typeOf = (row: BulkRow): EntryType => (row.credit.trim() !== "" && row.debit.trim() === "" ? "CREDIT" : row.debit.trim() !== "" ? "DEBIT" : (kinds[row.key] ?? "DEBIT"));

  /** The − and + buttons: the amount moves to the other column, so what is saved is exactly what the sheet showed. */
  /** Choosing the category Office on a Debit row that is not shared yet puts the Debt on the person called Office. */
  function officeDebt(row: BulkRow, categoryId: string | null): Partial<BulkRow> {
    const person = officeDebtPerson(categoryId, options);
    if (!person || isCreditRow(row) || row.splitKind || row.shares.length > 0) return {};
    return { splitKind: "DEBT", shares: peopleShares([], [person], "DEBT", options.settings) };
  }

  /** Credit History for a row: the recent credits to attach. Works from a Credit row too, by making it a Debit first. */
  function openHistory(row: BulkRow) {
    if (!quickActions.getRecentCredits) return;
    if (isCreditRow(row)) setType(row, "DEBIT");
    setHistoryFor(row.key);
    if (credits === null && !loadingCredits) {
      setLoadingCredits(true);
      void quickActions.getRecentCredits().then((r) => {
        setLoadingCredits(false);
        if (r.ok) setCredits(r.credits);
        else toast.error(r.error);
      });
    }
  }

  function setType(row: BulkRow, next: EntryType) {
    const amount = row.debit.trim() || row.credit.trim();
    setKinds((k) => ({ ...k, [row.key]: next }));
    if (amount === "") return void (next === "CREDIT" && update(row.key, { shares: [], splitKind: null, creditIds: [] }));
    change(row.key, (r) => rowWithAmounts(r, next === "CREDIT" ? { credit: amount, debit: "" } : { debit: amount, credit: "" }));
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
    // The saved rows leave the draft. The server already removed it with the save; this makes the browser's copy and any
    // draft save still waiting to run agree, so leaving the page right now cannot put the saved rows back.
    const fresh = startingRows(today, nowTime);
    latestRows.current = fresh;
    clearLocalDraft();
    void draftActions.clear().catch(() => undefined);
    setRows(fresh);
    setSelected(new Set());
    setRequestId(newRequestId());
    // The saved transactions are in Transaction History: go there to see them.
    router.push("/quick-pay/transactions");
  }

  /** Cancel, once confirmed: the sheet and its draft are thrown away (nothing is kept), and the page goes back to Transaction History. */
  async function cancelSheet(): Promise<string | null> {
    clearLocalDraft();
    // Waited for, so a draft saved a moment ago cannot come back after the page changes.
    await draftActions.clear().catch(() => undefined);
    setRows(startingRows(today, nowTime));
    setErrors({});
    setSelected(new Set());
    router.push("/quick-pay/transactions");
    return null;
  }

  const bad = (key: string, field: keyof BulkRowErrors) => Boolean(errors[key]?.[field]);
  // On a wide screen the boxes are plain (like a spreadsheet); they only show a frame when hovered or focused.
  const field = "h-9 text-base lg:h-8 lg:border-transparent lg:bg-transparent lg:text-sm lg:shadow-none lg:hover:bg-muted/60 lg:focus-visible:bg-background";
  const count = selected.size;

  const menu = (key: string, index: number) => (
    <RowMenu label={`Row ${index + 1} actions`} count={targetsOf(key).size} onInsert={(where) => insert(key, where)} onClone={() => clone(key)} onDelete={() => remove(key)} />
  );

  return (
    <div className="space-y-3">
      {/* Save, cancel and the totals at the top; the buttons that add rows are under the table */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={saveAll} disabled={saving || totals.filled === 0}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : `Save All${totals.filled ? ` (${totals.filled})` : ""}`}
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirmCancel(true)} disabled={saving}>
          Cancel
        </Button>
        <Link href="/quick-pay/transactions" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Back to Transaction History
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

      {/* One line per transaction, with the same choices as Quick Entry. Wider than a phone, so it scrolls sideways there. */}
      <div className="lg:overflow-x-auto lg:rounded-lg lg:border lg:bg-card">
        <table className="w-full text-sm max-lg:block lg:min-w-[88rem] lg:table-fixed" onKeyDown={onGridKeyDown}>
          <colgroup className="max-lg:hidden">
            <col style={{ width: "3.5rem" }} />
            <col style={{ width: "11rem" }} />
            <col style={{ width: "8rem" }} />
            <col style={{ width: "8.75rem" }} />
            <col style={{ width: "7.5rem" }} />
            <col />
            <col style={{ width: "14rem" }} />
            <col style={{ width: "14rem" }} />
            <col style={{ width: "6.5rem" }} />
            <col style={{ width: "2.5rem" }} />
          </colgroup>
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground max-lg:hidden">
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-medium">
                <span className="sr-only">Select and row number</span>#
              </th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Date</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Time</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">
                <span className="sr-only">Debit or Credit, Self Transfer</span>
                <span aria-hidden>Debit / Credit</span>
              </th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Amount</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Reason</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Category</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Through</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">More</th>
              <th scope="col" className="px-1 py-2">
                <span className="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="max-lg:block max-lg:space-y-3 lg:divide-y">
            {rows.map((row, index) => {
              const e = errors[row.key] ?? {};
              const type = typeOf(row);
              const credit = type === "CREDIT";
              const on = selected.has(row.key);
              const amountText = credit ? row.credit : row.debit;
              const amountPaise = parseAmountInput(amountText);
              const tone = bulkRowTone(row.transfer ? "TRANSFER" : isBlankBulkRow(row) ? null : type);
              return (
                <tr
                  key={row.key}
                  id={`row-${row.key}`}
                  data-grid-row=""
                  aria-selected={on}
                  className={cn("align-top transition-colors max-lg:relative max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-2 max-lg:gap-y-2 max-lg:rounded-xl max-lg:border max-lg:p-3", tone, on && "outline-2 -outline-offset-2 outline-primary/60", Object.keys(e).length > 0 && "bg-destructive/5")}
                >
                  <td className="border-r border-border/60 px-2 py-2.5 max-lg:block max-lg:border-0 max-lg:p-0 max-lg:col-span-2">
                    <span className="flex items-center gap-2">
                      <Checkbox checked={on} onCheckedChange={() => toggle(row.key)} aria-label={`Select row ${index + 1}`} />
                      <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    </span>
                  </td>
                  <td data-col={0} className="border-r border-border/60 px-1 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">Date</span>
                    <DatePicker compact bare={wide} hideIcon={wide} ariaLabel={`Row ${index + 1} date`} value={row.date} max={today} invalid={bad(row.key, "date")} onChange={(d) => update(row.key, { date: d })} />
                    {e.date ? <p className="mt-0.5 text-[11px] text-destructive">{e.date}</p> : null}
                  </td>
                  <td data-col={1} className="border-r border-border/60 px-1 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">Time</span>
                    <TimePicker compact bare={wide} ariaLabel={`Row ${index + 1} time`} value={row.time} invalid={bad(row.key, "time")} onChange={(t) => update(row.key, { time: t })} />
                    {e.time ? <p className="mt-0.5 text-[11px] text-destructive">{e.time}</p> : null}
                  </td>
                  <td className="border-r border-border/60 px-2 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">Debit or Credit</span>
                    <div className="flex items-center gap-1.5">
                      <TypeToggle size="sm" value={type} onChange={(t) => setType(row, t)} onDebitHistory={quickActions.getRecentCredits ? () => openHistory(row) : undefined} historyOn={(row.creditIds?.length ?? 0) > 0} />
                      {quickActions.saveTransfer ? <SelfTransferButton size="sm" onClick={() => openTransfer(row)} /> : null}
                    </div>
                  </td>
                  <td data-col={2} className="border-r border-border/60 px-1 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">Amount</span>
                    <Input
                      inputMode="decimal"
                      aria-label={`Row ${index + 1} amount`}
                      placeholder="0.00"
                      value={amountText}
                      aria-invalid={bad(row.key, "amount")}
                      onChange={(ev) => change(row.key, (r) => rowWithAmounts(r, credit ? { credit: ev.target.value, debit: "" } : { debit: ev.target.value, credit: "" }))}
                      className={cn(field, "text-right tabular-nums")}
                    />
                    {e.amount ? <p className="mt-0.5 text-[11px] text-destructive">{e.amount}</p> : null}
                  </td>
                  <td data-col={3} className="border-r border-border/60 px-1 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0 max-lg:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">Reason</span>
                    <div className="relative">
                      <Input
                        aria-label={`Row ${index + 1} reason`}
                        placeholder="Reason"
                        value={row.reason}
                        maxLength={200}
                        onChange={(ev) => change(row.key, (r) => rowWithReason(r, ev.target.value, keywordsFor(options, isCreditRow(r) ? "CREDIT" : "DEBIT")))}
                        className={cn(field, adders.assignReason && "pr-8")}
                      />
                      {adders.assignReason ? (
                        <span className="absolute top-1/2 right-2 -translate-y-1/2" title="Choose which category this reason belongs to">
                          <Checkbox checked={assignFor?.key === row.key} disabled={row.reason.trim() === ""} onCheckedChange={(next) => setAssignFor(next === true ? row : null)} aria-label={`Row ${index + 1}: put this reason under a category`} />
                        </span>
                      ) : null}
                    </div>
                    {e.reason ? <p className="mt-0.5 text-[11px] text-destructive">{e.reason}</p> : null}
                  </td>
                  <td data-col={4} className="border-r border-border/60 px-1 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0 max-lg:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">Category</span>
                    {row.transfer ? (
                      <p className="flex h-8 items-center px-2.5 text-sm text-muted-foreground">—</p>
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          {/* A Debit and a Credit share one list of categories; a keyword in the Reason picks it; a new one can be added here */}
                          <CascadingSelect
                            compact
                            bare={wide}
                            clearable
                            ariaLabel={`Row ${index + 1} category`}
                            groups={categoryGroups}
                            value={row.categoryId}
                            onChange={(v) => update(row.key, { categoryId: v, categoryManual: true, categoryAuto: false, ...officeDebt(row, v) })}
                            placeholder={row.categoryAuto ? "Category · auto" : "Category"}
                            searchPlaceholder="Search categories…"
                            emptyText="No category found. Add one below."
                            footer={
                              <InlineAdd
                                label="New category"
                                placeholder="Add a category…"
                                onAdd={async (name) => {
                                  const added = await adders.addCategory(name, type);
                                  if (added.ok) update(row.key, { categoryId: added.id, categoryManual: true, categoryAuto: false, ...officeDebt(row, added.id) });
                                  return added;
                                }}
                              />
                            }
                          />
                        </div>
                        {switches.category.enabled ? (
                          <CycleButton
                            label={`Row ${index + 1}: switch to the next category`}
                            className="size-8"
                            disabled={mainCategoryIds.length < 2}
                            onClick={() => { const next = nextSwitch(switches.category, mainCategoryIds, row.categoryId); update(row.key, { categoryId: next, categoryManual: true, categoryAuto: false, ...officeDebt(row, next) }); }}
                          />
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td data-col={5} className="border-r border-border/60 px-1 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0 max-lg:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">Through</span>
                    {row.transfer ? (
                      <div className="flex h-8 items-center gap-1.5 rounded-md bg-yellow-100 px-2 text-sm text-yellow-900" title="Self transfer, saved with Save All">
                        <SwapArrowsIcon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {bankName(options, row.transfer.fromId)} → {bankName(options, row.transfer.toId)}
                        </span>
                        <button type="button" data-grid-control="" aria-label={`Row ${index + 1}: remove the self transfer`} onClick={() => update(row.key, { transfer: null, accountId: null })} className="rounded p-0.5 hover:bg-yellow-200">
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <CascadingSelect compact bare={wide} ariaLabel={`Row ${index + 1} bank`} groups={bankGroups} value={row.accountId} onChange={(v) => update(row.key, { accountId: v })} placeholder="Bank" searchPlaceholder="Search banks…" invalid={bad(row.key, "bank")} footer={quickActions.saveTransfer ? <SelfTransferItem onOpen={() => openTransfer(row)} /> : undefined} />
                        </div>
                        {switches.bank.enabled ? (
                          <CycleButton
                            label={`Row ${index + 1}: switch to the next bank`}
                            className="size-8"
                            disabled={options.banks.length < 2}
                            onClick={() => update(row.key, { accountId: nextSwitch(switches.bank, options.banks.map((b) => b.id), row.accountId) })}
                          />
                        ) : null}
                      </div>
                    )}
                    {e.bank ? <p className="mt-0.5 text-[11px] text-destructive">{e.bank}</p> : null}
                  </td>
                  <td className="border-r border-border/60 px-1 py-1 align-top max-lg:block max-lg:border-0 max-lg:p-0">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground lg:hidden">More</span>
                    {row.transfer ? (
                      <p className="flex h-8 items-center px-2.5 text-sm text-muted-foreground">—</p>
                    ) : (
                      <BulkRowMore row={row} index={index} credit={credit} amountPaise={amountPaise} options={options} invalid={bad(row.key, "split")} onChange={(changes) => update(row.key, changes)} onAddPerson={async (name) => adders.addPerson(name)} />
                    )}
                    {e.split ? <p className="mt-0.5 text-[11px] text-destructive">{e.split}</p> : null}
                  </td>
                  <td className="px-1 py-1 align-top max-lg:absolute max-lg:top-2 max-lg:right-2 max-lg:p-0">{menu(row.key, index)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Add rows">
        <Button type="button" variant="outline" onClick={() => addBy("today")} disabled={rows.length >= MAX_BULK_ROWS}>
          <Plus /> Add row (Today)
        </Button>
        <Button type="button" variant="outline" onClick={() => addBy("last")} disabled={rows.length >= MAX_BULK_ROWS}>
          <Plus /> Add row (Last entry date)
        </Button>
        <Button type="button" variant="outline" onClick={() => addBy("next")} disabled={rows.length >= MAX_BULK_ROWS}>
          <Plus /> Add row (Next day)
        </Button>
        <Input
          inputMode="numeric"
          aria-label="How many rows to add"
          title="How many rows each button adds"
          value={howMany}
          onChange={(e) => setHowMany(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          onBlur={() => setHowMany((v) => (v.trim() === "" || Number(v) < 1 ? "1" : v))}
          className="h-9 w-16 text-center text-base tabular-nums sm:text-sm"
        />
      </div>
      {/* Credit History of one row: choose the credit to attach to this Debit */}
      <Dialog open={historyFor !== null} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent className="sm:max-w-md">
          {(() => {
            const row = rows.find((r) => r.key === historyFor);
            if (!row) return null;
            const ids = row.creditIds ?? [];
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Credit History · row {rows.indexOf(row) + 1}</DialogTitle>
                  <DialogDescription>Choose a recent credit to attach to this debit. Choosing it again takes it off.</DialogDescription>
                </DialogHeader>
                <CreditsPanel
                  credits={credits}
                  loading={loadingCredits}
                  selected={ids}
                  onChoose={(creditId, on) => update(row.key, { creditIds: on ? [creditId] : [] })}
                  canCycle={switches.credit.enabled}
                  onCycle={() => {
                    const next = nextSwitch(switches.credit, (credits ?? []).filter((c) => c.type === "CREDIT").map((c) => c.id), ids[0] ?? null);
                    if (next) update(row.key, { creditIds: [next] });
                  }}
                  source={options.settings.credits.source}
                  debitAmount={row.debit}
                  onTurnOff={() => {
                    update(row.key, { creditIds: [] });
                    setHistoryFor(null);
                  }}
                />
                <DialogFooter>
                  <Button type="button" onClick={() => setHistoryFor(null)}>
                    Save
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
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
      {adders.assignReason ? (
        <ReasonCategoryDialog
          open={assignFor !== null}
          onOpenChange={(open) => !open && setAssignFor(null)}
          reason={assignFor?.reason.trim() ?? ""}
          categories={options.categories}
          currentId={assignFor?.categoryId ?? null}
          onAssign={async (input) => {
            if (!assignFor) return null;
            const done = await adders.assignReason!(assignFor.reason.trim(), typeOf(assignFor), input);
            if (!done.ok) return done.error;
            update(assignFor.key, { categoryId: done.categoryId, categoryManual: true, categoryAuto: false });
            return null;
          }}
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
