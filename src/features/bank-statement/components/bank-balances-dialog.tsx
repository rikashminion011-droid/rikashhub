"use client";

import { Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatINR } from "@/lib/finance";

const dayText = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** View Balance: the balance of each bank, taken from the last row of its imported statement. */
export function BankBalancesDialog({ balances }: { balances: { accountId: string; bank: string; balancePaise: number; asOf: string }[] }) {
  const total = balances.reduce((s, b) => s + b.balancePaise, 0);
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" title="View Balance" aria-label="View Balance" className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}>
        <Wallet className="size-5" aria-hidden /> View Balance
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bank balances</DialogTitle>
          <DialogDescription>The closing balance on the last row of each bank&apos;s imported statement.</DialogDescription>
        </DialogHeader>
        {balances.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Import a statement to see its balance.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 pr-3 text-left font-medium">Bank</th>
                <th scope="col" className="py-2 px-3 text-left font-medium">As of</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {balances.map((b) => (
                <tr key={b.accountId}>
                  <td className="py-2 pr-3 font-medium">{b.bank}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{dayText.format(new Date(`${b.asOf}T00:00:00Z`))}</td>
                  <td className="py-2 pl-3 text-right font-semibold tabular-nums">{formatINR(b.balancePaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-2 pr-3" colSpan={2}>
                  Total
                </td>
                <td className="py-2 pl-3 text-right tabular-nums">{formatINR(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
