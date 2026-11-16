"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import type { DueActions } from "../actions";
import type { ExpenseRow } from "../server/service";

interface Line {
  key: number;
  name: string;
  amount: string;
}

const show = (paise: number) => (paise === 0 ? "" : (paise / 100).toFixed(2).replace(/\.00$/, ""));

/**
 * The month's typed expenses. Room Rent is always the first line; the + button adds any other (Food, Internet, ...) with its
 * own name and amount. Everything here counts in My Due for the chosen month. Nothing changes until Save.
 */
export function MonthlyExpensesEditor({ month, monthLabel, rows, saveExpenses }: { month: string; monthLabel: string; rows: ExpenseRow[]; saveExpenses: DueActions["saveExpenses"] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() => rows.map((r, key) => ({ key, name: r.name, amount: show(r.amountPaise) })));
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
    const r = await saveExpenses({ month, rows: lines.map(({ name, amount }) => ({ name, amount })) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success(`Expenses for ${monthLabel} saved.`);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="expenses-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="expenses-heading" className="text-sm font-semibold">
          Monthly Expenses · {monthLabel}
        </h2>
        <p className="text-sm font-semibold tabular-nums">{formatINR(total)}</p>
      </div>
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={l.key} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
            <Input aria-label={`Expense ${i + 1} name`} maxLength={60} placeholder="Name" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} className="h-10 text-base sm:text-sm" />
            <Input aria-label={`Expense ${i + 1} amount`} inputMode="decimal" placeholder="0" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} className="h-10 text-right text-base tabular-nums sm:text-sm" />
            {i === 0 ? <span className="size-9" aria-hidden /> : (
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${l.name || "this expense"}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-destructive">
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: Math.max(-1, ...ls.map((l) => l.key)) + 1, name: "", amount: "" }])}>
          <Plus /> Add expense
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
