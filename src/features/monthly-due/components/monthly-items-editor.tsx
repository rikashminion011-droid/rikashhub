"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import type { DueActions } from "../actions";
import { DEFAULT_EXPENSE_NAME } from "../model";
import type { ExpenseKind, ExpenseRow } from "../server/service";

interface Line {
  key: number;
  name: string;
  amount: string;
  month: string;
}

const show = (paise: number) => (paise === 0 ? "" : (paise / 100).toFixed(2).replace(/\.00$/, ""));

/**
 * "My other expenses" or "My monthly bills": a list of named amounts, each with the month it belongs to. A new row asks for its
 * month (it starts on the month being viewed). Only the rows whose month the date filter covers are shown, and they are the
 * ones that count. Nothing changes until Save.
 */
export function MonthlyItemsEditor({ kind, title, rows, scope, defaultMonth, saveItems }: { kind: ExpenseKind; title: string; rows: ExpenseRow[]; scope: string[]; defaultMonth: string; saveItems: DueActions["saveItems"] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() => {
    const start = rows.map((r, key) => ({ key, name: r.name, amount: show(r.amountPaise), month: r.month }));
    // My other expenses begins with Room Rent, ready to be filled in.
    return start.length === 0 && kind === "OTHER" ? [{ key: 0, name: DEFAULT_EXPENSE_NAME, amount: "", month: defaultMonth }] : start;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((s, l) => s + (parseAmountInput(l.amount.trim() === "" ? "0" : l.amount) ?? 0), 0);
  const update = (key: number, change: Partial<Line>) => {
    setError(null);
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  };

  async function save() {
    setSaving(true);
    setError(null);
    const r = await saveItems({ kind, scope, rows: lines.map(({ name, amount, month }) => ({ name, amount, month })) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success(`${title} saved.`);
    router.refresh();
  }

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-sm font-semibold tabular-nums">{formatINR(total)}</p>
      </div>
      {lines.length === 0 ? <p className="text-sm text-muted-foreground">Nothing for the months in this period. Add a row and choose its month.</p> : null}
      <ul className="space-y-2.5">
        {lines.map((l, i) => (
          <li key={l.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <Input aria-label={`${title} ${i + 1} name`} maxLength={60} placeholder="Name" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} className="h-10 min-w-32 flex-1 basis-40 text-base sm:text-sm" />
            <Input aria-label={`${title} ${i + 1} amount`} inputMode="decimal" placeholder="0" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} className="h-10 w-28 text-right text-base tabular-nums sm:text-sm" />
            <MonthPicker value={l.month} ariaLabel={`${title} ${i + 1} month`} className="w-44" onChange={(m) => update(l.key, { month: m })} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${l.name || "this row"}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: Math.max(-1, ...ls.map((l) => l.key)) + 1, name: "", amount: "", month: defaultMonth }])}>
          <Plus /> Add
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
