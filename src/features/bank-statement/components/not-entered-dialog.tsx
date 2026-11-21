"use client";

import { FileWarning } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatINR } from "@/lib/finance";

const dayText = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

interface Row {
  id: string;
  date: string;
  time: string;
  bank: string;
  details: string;
  debitPaise: number;
  creditPaise: number;
}

/**
 * Not entered: bank statement rows (for the period on this page) that have no matching entry in Transaction History, with the
 * total debit and credit of what is missing.
 */
export function NotEnteredDialog({ rows, totals }: { rows: Row[]; totals: { debitPaise: number; creditPaise: number } }) {
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" title="Not entered" aria-label={`Not entered: ${rows.length}`} className="relative flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}>
        <FileWarning className="size-5" aria-hidden /> Not entered
        <span className="min-w-5 rounded-full bg-amber-500 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">{rows.length}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Not entered in Transaction History</DialogTitle>
          <DialogDescription>Bank statement rows with no entry of the same bank, day and amount.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Total Debit </span>
            <span className="text-lg font-semibold text-red-600 tabular-nums">{formatINR(totals.debitPaise)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Total Credit </span>
            <span className="text-lg font-semibold text-green-600 tabular-nums">{formatINR(totals.creditPaise)}</span>
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Everything on the bank statement is entered.</p>
        ) : (
          <div className="max-h-[55vh] overflow-auto rounded-lg border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Bank</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Details</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Debit</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {dayText.format(new Date(`${r.date}T00:00:00Z`))}
                      {r.time !== "00:00" ? <span className="block text-xs text-muted-foreground">{r.time}</span> : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.bank}</td>
                    <td className="max-w-72 px-3 py-2 break-words text-muted-foreground">{r.details}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.debitPaise ? formatINR(r.debitPaise) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.creditPaise ? formatINR(r.creditPaise) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="px-3 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(totals.debitPaise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(totals.creditPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
