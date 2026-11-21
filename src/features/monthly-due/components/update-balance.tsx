"use client";

import { Landmark, Loader2, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { setOpeningBalanceAction } from "@/features/quick-pay/actions";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatINR, parseAmountInput } from "@/lib/finance";
import type { BalanceRow } from "../server/service";

const show = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/** An amount typed like "12,500" or "-300.50" as paise, or null when it is not an amount. */
function parseSigned(text: string): number | null {
  const t = text.replace(/[₹,\s]/g, "");
  if (t === "") return 0;
  const negative = t.startsWith("-");
  const paise = parseAmountInput(negative ? t.slice(1) : t);
  return paise === null ? null : negative ? -paise : paise;
}

/**
 * Update Balance: what each bank (and Cash) holds, one line each, with the Total underneath. Type the real amount and press
 * Save: from that moment the bank's balance is that amount (what is entered afterwards moves it as usual). The Total is My Balance.
 */
export function UpdateBalance({ rows, setOpeningBalance }: { rows: BalanceRow[]; setOpeningBalance: typeof setOpeningBalanceAction }) {
  const router = useRouter();
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, show(r.amountPaise)])));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = rows.map((r) => ({ row: r, paise: parseSigned(text[r.id] ?? "") }));
  const total = parsed.reduce((s, p) => s + (p.paise ?? 0), 0);
  const changed = parsed.filter((p) => p.paise !== null && p.paise !== p.row.amountPaise);

  async function save() {
    setError(null);
    if (parsed.some((p) => p.paise === null)) return setError("Enter amounts like 12500 or 1200.50.");
    setSaving(true);
    // The moment of saving (read now, since this can sit in the header for a long while).
    const now = new Date();
    const today = istDateOf(now);
    const nowTime = istTimeOf(now);
    let failed: string | null = null;
    for (const { row, paise } of changed) {
      const r = await setOpeningBalance({ accountId: row.id, amount: String(paise! / 100), date: today, time: nowTime });
      if (!r.ok) {
        failed = `${row.name}: ${r.error}`;
        break;
      }
    }
    setSaving(false);
    if (failed) return setError(failed);
    toast.success("Balances updated.");
    setOpen(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Closing leaves edit mode and drops anything typed but not saved.
        if (!next) {
          setEditing(false);
          setError(null);
          setText(Object.fromEntries(rows.map((r) => [r.id, show(r.amountPaise)])));
        }
      }}
    >
      <DialogTrigger render={<button type="button" title="Update Balance" aria-label="Update Balance" className="flex size-10 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}>
        <Landmark className="size-5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-center justify-between gap-2 pr-8">
          <DialogTitle>Update Balance</DialogTitle>
          <button
            type="button"
            aria-label={editing ? "Stop editing" : "Edit balances"}
            title={editing ? "Stop editing" : "Edit balances"}
            aria-pressed={editing}
            onClick={() => {
              if (editing) setText(Object.fromEntries(rows.map((r) => [r.id, show(r.amountPaise)])));
              setError(null);
              setEditing((e) => !e);
            }}
            className="flex size-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
          </button>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No banks yet. Add them in Customize, Through.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 pr-3 text-left font-medium">Bank or Cash</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-3">{r.name}</td>
                  <td className="py-1.5 pl-3">
                    {editing ? (
                      <Input
                        inputMode="decimal"
                        aria-label={`${r.name} amount`}
                        value={text[r.id] ?? ""}
                        onChange={(e) => {
                          setError(null);
                          setText((t) => ({ ...t, [r.id]: e.target.value }));
                        }}
                        className="ml-auto h-9 w-40 text-right text-base tabular-nums sm:text-sm"
                      />
                    ) : (
                      <p className="py-1.5 text-right font-medium tabular-nums">{formatINR(r.amountPaise)}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pl-3 text-right tabular-nums">{formatINR(editing ? total : rows.reduce((t, r) => t + r.amountPaise, 0))}</td>
              </tr>
            </tfoot>
          </table>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {editing ? (
          <Button type="button" onClick={save} disabled={saving || changed.length === 0}>
            {saving ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
