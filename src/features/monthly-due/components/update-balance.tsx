"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { setOpeningBalanceAction } from "@/features/quick-pay/actions";
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
export function UpdateBalance({ rows, today, nowTime, setOpeningBalance }: { rows: BalanceRow[]; today: string; nowTime: string; setOpeningBalance: typeof setOpeningBalanceAction }) {
  const router = useRouter();
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, show(r.amountPaise)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = rows.map((r) => ({ row: r, paise: parseSigned(text[r.id] ?? "") }));
  const total = parsed.reduce((s, p) => s + (p.paise ?? 0), 0);
  const changed = parsed.filter((p) => p.paise !== null && p.paise !== p.row.amountPaise);

  async function save() {
    setError(null);
    if (parsed.some((p) => p.paise === null)) return setError("Enter amounts like 12500 or 1200.50.");
    setSaving(true);
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
    router.refresh();
  }

  return (
    <section className="space-y-3" aria-labelledby="update-balance">
      <h2 id="update-balance" className="text-sm font-semibold">
        Update Balance
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No banks yet. Add them in Customize, Through.</p>
      ) : (
        <div className="max-w-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 pr-3 text-left font-medium">Bank / Cash</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-3">{r.name}</td>
                  <td className="py-1.5 pl-3">
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
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pl-3 text-right tabular-nums">{formatINR(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" size="sm" onClick={save} disabled={saving || changed.length === 0}>
        {saving ? <Loader2 className="animate-spin" /> : null} Save
      </Button>
    </section>
  );
}
