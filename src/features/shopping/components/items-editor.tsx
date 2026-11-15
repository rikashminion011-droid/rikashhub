"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AddResult } from "@/features/quick-pay/components/inline-add";
import { PeoplePicker } from "@/features/quick-pay/components/people-picker";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { ShoppingActions } from "../actions";
import type { ItemRow } from "../server/service";

interface Line {
  key: number;
  name: string;
  quantity: string;
  rate: string;
  recipientIds: string[];
}

const MIN_ROWS = 10;
const num = (text: string) => {
  const q = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(q) && q >= 0 ? q : 0;
};
const rowTotal = (l: Line) => Math.round(num(l.quantity) * (parseAmountInput(l.rate.trim() === "" ? "0" : l.rate) ?? 0));

/**
 * The item table of a purchase: Items, Quantity, Rate, Total (quantity x rate, worked out) and Recipients. It starts with at
 * least 10 rows and more can be added. Each row shows the running amount spent against the purchase total.
 */
export function ItemsEditor({
  purchaseId,
  totalPaise,
  saved,
  people: initialPeople,
  saveItems,
  addPerson,
}: {
  purchaseId: string;
  totalPaise: number;
  saved: ItemRow[];
  people: { id: string; name: string }[];
  saveItems: ShoppingActions["saveItems"];
  addPerson: (name: string) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [people, setPeople] = useState(initialPeople);
  const [lines, setLines] = useState<Line[]>(() => {
    const filled = saved.map((i, key) => ({ key, name: i.name, quantity: String(i.quantity), rate: (i.ratePaise / 100).toFixed(2).replace(/\.00$/, ""), recipientIds: i.recipientIds }));
    while (filled.length < MIN_ROWS) filled.push({ key: filled.length, name: "", quantity: "", rate: "", recipientIds: [] });
    return filled;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAddPerson = async (name: string): Promise<AddResult> => {
    const r = await addPerson(name);
    if (!r.ok) return r;
    setPeople((p) => (p.some((x) => x.id === r.id) ? p : [...p, { id: r.id, name: r.name }]));
    return { ok: true, id: r.id };
  };
  const update = (key: number, change: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const addRows = (n: number) => setLines((ls) => [...ls, ...Array.from({ length: n }, (_, i) => ({ key: Math.max(-1, ...ls.map((l) => l.key)) + 1 + i, name: "", quantity: "", rate: "", recipientIds: [] as string[] }))]);

  const used = lines.reduce((s, l) => s + rowTotal(l), 0);
  const runs = lines.reduce<number[]>((acc, l) => [...acc, (acc.at(-1) ?? 0) + rowTotal(l)], []);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await saveItems({ id: purchaseId, items: lines.map(({ name, quantity, rate, recipientIds }) => ({ name, quantity, rate, recipientIds })) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success("Purchase details saved.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-2 py-2.5 text-left font-medium">Items</th>
              <th scope="col" className="w-24 px-2 py-2.5 text-right font-medium">Quantity</th>
              <th scope="col" className="w-28 px-2 py-2.5 text-right font-medium">Rate</th>
              <th scope="col" className="w-36 px-2 py-2.5 text-right font-medium">Total</th>
              <th scope="col" className="w-48 px-2 py-2.5 text-left font-medium">Recipients</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l, i) => {
              const total = rowTotal(l);
              const running = runs[i] ?? 0;
              const touched = Boolean(l.name.trim() || l.quantity.trim() || l.rate.trim());
              return (
                <tr key={l.key} className="align-top">
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Item ${i + 1}`} maxLength={200} value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} className="h-9 text-base sm:text-sm" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Quantity ${i + 1}`} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className="h-9 text-right text-base tabular-nums sm:text-sm" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Rate ${i + 1}`} inputMode="decimal" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} className="h-9 text-right text-base tabular-nums sm:text-sm" />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <p className="font-medium">{touched ? formatINR(total) : ""}</p>
                    {touched ? (
                      <p className={cn("text-[11px]", running > totalPaise ? "text-destructive" : "text-muted-foreground")}>
                        {formatINR(running)} / {formatINR(totalPaise)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <PeoplePicker compact ariaLabel={`Recipients of row ${i + 1}`} people={people} selected={l.recipientIds} onChange={(ids) => update(l.key, { recipientIds: ids })} onAddPerson={onAddPerson} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addRows(1)}>
            <Plus /> Add row
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addRows(5)}>
            <Plus /> Add 5 rows
          </Button>
        </div>
        <p className={cn("text-sm tabular-nums", used > totalPaise ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
          Items {formatINR(used)} of {formatINR(totalPaise)}
          {used !== totalPaise ? ` · ${used > totalPaise ? "over by" : "left"} ${formatINR(Math.abs(totalPaise - used))}` : " · matches the purchase"}
        </p>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : null} {saving ? "Saving…" : "Save details"}
      </Button>
    </div>
  );
}
