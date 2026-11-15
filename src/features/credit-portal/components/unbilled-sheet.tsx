"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker, TimePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PeoplePicker } from "@/features/quick-pay/components/people-picker";
import type { AddResult } from "@/features/quick-pay/components/inline-add";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { PortalActions } from "../actions";
import type { UnbilledRow } from "../server/service";

export interface SheetRow {
  key: string;
  date: string;
  time: string;
  reason: string;
  kind: "DEBIT" | "CREDIT";
  amount: string;
  recipientIds: string[];
}

const newKey = () => crypto.randomUUID();
const newRequestId = () => crypto.randomUUID();
const blank = (date: string, time: string): SheetRow => ({ key: newKey(), date, time, reason: "", kind: "DEBIT", amount: "", recipientIds: [] });
const isBlank = (r: SheetRow) => !r.reason.trim() && !r.amount.trim() && r.recipientIds.length === 0;

const select = "h-9 w-full rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm";

/**
 * Add Bulk for unbilled transactions: one row per transaction with its date and time (the current ones to begin with), a
 * reason, Debit or Credit, the amount and the people it is for. Enter moves to the same box on the next row (and starts a new
 * row after the last one). Nothing is saved until Save All, and then every row is saved together.
 */
export function UnbilledSheet({
  open,
  onOpenChange,
  portalId,
  people,
  onAddPerson,
  saveUnbilledBulk,
  onSaved,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalId: string;
  people: { id: string; name: string }[];
  onAddPerson: (name: string) => Promise<AddResult>;
  saveUnbilledBulk: PortalActions["saveUnbilledBulk"];
  onSaved: () => void;
  today: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(78rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Add Bulk: unbilled transactions</DialogTitle>
          <DialogDescription>One row for each transaction. Press Enter to go to the next row. Nothing is saved until Save All.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so it always starts fresh */}
        {open ? <SheetBody portalId={portalId} people={people} onAddPerson={onAddPerson} saveUnbilledBulk={saveUnbilledBulk} onSaved={() => { onSaved(); onOpenChange(false); }} onCancel={() => onOpenChange(false)} today={today} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SheetBody({ portalId, people, onAddPerson, saveUnbilledBulk, onSaved, onCancel, today }: { portalId: string; people: { id: string; name: string }[]; onAddPerson: (name: string) => Promise<AddResult>; saveUnbilledBulk: PortalActions["saveUnbilledBulk"]; onSaved: () => void; onCancel: () => void; today: string }) {
  const now = new Date();
  const start = () => blank(istDateOf(now), istTimeOf(now));
  const [rows, setRows] = useState<SheetRow[]>(() => [start(), start(), start()]);
  const [requestId] = useState(newRequestId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusAfter = useRef<{ key: string; field: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const update = (key: string, changes: Partial<SheetRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  const total = rows.reduce((s, r) => s + (r.kind === "DEBIT" ? 1 : -1) * (parseAmountInput(r.amount) ?? 0), 0);

  function focusField(key: string, field: string) {
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-row="${key}"] [data-field="${field}"]`)?.focus());
  }

  function enter(index: number, field: string) {
    const next = rows[index + 1];
    if (next) return focusField(next.key, field);
    const last = rows[index]!;
    const fresh = blank(last.date, last.time);
    setRows((all) => [...all, fresh]);
    focusAfter.current = { key: fresh.key, field };
    focusField(fresh.key, field);
  }

  async function save() {
    if (saving) return;
    const filled = rows.filter((r) => !isBlank(r));
    if (filled.length === 0) return setError("Add at least one row with an amount.");
    const bad = filled.findIndex((r) => (parseAmountInput(r.amount) ?? 0) <= 0);
    if (bad >= 0) return setError(`Row ${rows.indexOf(filled[bad]!) + 1} needs an amount above zero.`);
    setError(null);
    setSaving(true);
    let result: Awaited<ReturnType<typeof saveUnbilledBulk>>;
    try {
      result = await saveUnbilledBulk({ requestId, portalId, rows: filled.map((r) => ({ key: r.key, date: r.date, time: r.time, reason: r.reason, kind: r.kind, amount: r.amount, recipientIds: r.recipientIds })) });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and press Save All again." };
    }
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(result.duplicate ? "That sheet was already saved." : `${result.count} transaction${result.count === 1 ? "" : "s"} saved.`);
    onSaved();
  }

  const onKey = (e: React.KeyboardEvent, index: number, field: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      enter(index, field);
    }
  };

  return (
    <div ref={root} className="space-y-3">
      <div className="hidden grid-cols-[12rem_7.5rem_minmax(0,1fr)_6.5rem_7.5rem_13rem_2.25rem] gap-2 px-1 text-xs font-medium text-muted-foreground lg:grid">
        <span>Date</span>
        <span>Time</span>
        <span>Reason</span>
        <span>Debit</span>
        <span>Amount</span>
        <span>Recipient</span>
        <span />
      </div>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} data-row={r.key} className="grid gap-2 rounded-xl border p-2 sm:grid-cols-2 lg:grid-cols-[12rem_7.5rem_minmax(0,1fr)_6.5rem_7.5rem_13rem_2.25rem] lg:items-start lg:rounded-none lg:border-0 lg:p-0">
            <DatePicker compact ariaLabel={`Row ${i + 1} date`} value={r.date} max={today} onChange={(d) => update(r.key, { date: d })} />
            <TimePicker compact ariaLabel={`Row ${i + 1} time`} value={r.time} onChange={(t) => update(r.key, { time: t })} />
            <Input data-field="reason" aria-label={`Row ${i + 1} reason`} placeholder="Reason" maxLength={200} value={r.reason} onChange={(e) => update(r.key, { reason: e.target.value })} onKeyDown={(e) => onKey(e, i, "reason")} className="h-8 text-base sm:text-sm sm:col-span-2 lg:col-span-1" />
            <select aria-label={`Row ${i + 1} debit or credit`} value={r.kind} onChange={(e) => update(r.key, { kind: e.target.value as "DEBIT" | "CREDIT" })} className={cn(select, "h-8", r.kind === "CREDIT" ? "text-green-700" : "text-red-700")}>
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
            <Input data-field="amount" inputMode="decimal" aria-label={`Row ${i + 1} amount`} placeholder="0.00" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} onKeyDown={(e) => onKey(e, i, "amount")} className="h-8 text-right text-base tabular-nums sm:text-sm" />
            <PeoplePicker compact ariaLabel={`Row ${i + 1} recipient`} people={people} selected={r.recipientIds} onChange={(ids) => update(r.key, { recipientIds: ids })} onAddPerson={onAddPerson} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((all) => (all.length > 1 ? all.filter((x) => x.key !== r.key) : [start()]))} className="text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setRows((all) => [...all, blank(all.at(-1)?.date ?? istDateOf(now), all.at(-1)?.time ?? istTimeOf(now))])}>
          <Plus /> Add row
        </Button>
        <Button type="button" variant="outline" onClick={() => setRows((all) => [...all, ...Array.from({ length: 5 }, () => blank(all.at(-1)?.date ?? istDateOf(now), all.at(-1)?.time ?? istTimeOf(now)))])}>
          <Plus /> Add 5 rows
        </Button>
        <p className="ml-auto text-sm tabular-nums text-muted-foreground" aria-live="polite">
          {rows.filter((r) => !isBlank(r)).length} rows · Net {formatINR(total)}
        </p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} {saving ? "Saving…" : "Save All"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Edit one unbilled transaction. */
export function UnbilledEditDialog({
  row,
  onClose,
  people,
  onAddPerson,
  updateUnbilled,
  onSaved,
  today,
}: {
  row: UnbilledRow | null;
  onClose: () => void;
  people: { id: string; name: string }[];
  onAddPerson: (name: string) => Promise<AddResult>;
  updateUnbilled: PortalActions["updateUnbilled"];
  onSaved: () => void;
  today: string;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">{row ? <EditBody key={row.id} row={row} onClose={onClose} people={people} onAddPerson={onAddPerson} updateUnbilled={updateUnbilled} onSaved={onSaved} today={today} /> : null}</DialogContent>
    </Dialog>
  );
}

function EditBody({ row, onClose, people, onAddPerson, updateUnbilled, onSaved, today }: { row: UnbilledRow; onClose: () => void; people: { id: string; name: string }[]; onAddPerson: (name: string) => Promise<AddResult>; updateUnbilled: PortalActions["updateUnbilled"]; onSaved: () => void; today: string }) {
  const at = new Date(row.occurredAt);
  const [draft, setDraft] = useState<SheetRow>({ key: row.id, date: istDateOf(at), time: istTimeOf(at), reason: row.reason, kind: row.kind, amount: (row.amountPaise / 100).toFixed(2), recipientIds: row.recipientIds });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await updateUnbilled({ id: row.id, row: { key: row.id, date: draft.date, time: draft.time, reason: draft.reason, kind: draft.kind, amount: draft.amount, recipientIds: draft.recipientIds } });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success("Transaction updated.");
    onSaved();
    onClose();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-3"
    >
      <DialogHeader>
        <DialogTitle>Edit transaction</DialogTitle>
        <DialogDescription>{row.details || "Change anything and press Save."}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2">
        <DatePicker ariaLabel="Date" value={draft.date} max={today} onChange={(d) => setDraft({ ...draft, date: d })} className="h-10" />
        <TimePicker ariaLabel="Time" value={draft.time} onChange={(t) => setDraft({ ...draft, time: t })} className="h-10" />
      </div>
      <Input aria-label="Reason" placeholder="Reason" maxLength={200} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className="h-10 text-base sm:text-sm" />
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <select aria-label="Debit or credit" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as "DEBIT" | "CREDIT" })} className={cn(select, "h-10")}>
          <option value="DEBIT">Debit</option>
          <option value="CREDIT">Credit</option>
        </select>
        <Input aria-label="Amount" inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="h-10 text-right text-base tabular-nums sm:text-sm" />
      </div>
      <PeoplePicker ariaLabel="Recipients" people={people} selected={draft.recipientIds} onChange={(ids) => setDraft({ ...draft, recipientIds: ids })} onAddPerson={onAddPerson} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </DialogFooter>
    </form>
  );
}
