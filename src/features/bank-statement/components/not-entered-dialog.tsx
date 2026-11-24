"use client";

import { FileWarning, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { formatINR } from "@/lib/finance";
import { LinkEntryDialog, type LinkActions, type LinkRow } from "./link-entry-dialog";

const dayText = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/**
 * Not entered: bank statement rows (for the period on this page) that have no matching entry in Transaction History, with the
 * total debit and credit of what is missing. Each row has a Link action: it opens the Quick Entry fields, filled in from the
 * row, and saves the entry and links it, so the row leaves this list.
 */
export function NotEnteredDialog({ rows, totals, reviewCount, options, actions }: { rows: LinkRow[]; totals: { debitPaise: number; creditPaise: number }; reviewCount: number; options: QuickPayOptions; actions: LinkActions }) {
  const router = useRouter();
  const [linking, setLinking] = useState<LinkRow | null>(null);
  return (
    <>
      <Dialog>
        <DialogTrigger render={<button type="button" title="Not entered" aria-label={`Not entered: ${rows.length}`} className="relative flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}>
          <FileWarning className="size-5" aria-hidden /> Not entered
          <span className="min-w-5 rounded-full bg-amber-500 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">{rows.length}</span>
        </DialogTrigger>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Not entered in Transaction History</DialogTitle>
            <DialogDescription>Bank statement rows with no entry of the same bank, day and amount. Press Link to enter one with its details.</DialogDescription>
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
          {reviewCount > 0 ? <p className="text-xs text-amber-700">{reviewCount} more row{reviewCount === 1 ? "" : "s"} could match more than one entry. They are marked Needs review on the Bank Statement page.</p> : null}
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Everything on the bank statement is entered.</p>
          ) : (
            <>
              <div className="hidden max-h-[55vh] overflow-auto rounded-lg border md:block">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Bank</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Details</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Debit</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Credit</th>
                      <th scope="col" className="w-24 px-2 py-2 text-right font-medium">Link</th>
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
                        <td className="px-3 py-2 text-right text-red-600 tabular-nums">{r.debitPaise ? formatINR(r.debitPaise) : ""}</td>
                        <td className="px-3 py-2 text-right text-green-600 tabular-nums">{r.creditPaise ? formatINR(r.creditPaise) : ""}</td>
                        <td className="px-2 py-1.5 text-right">
                          <Button type="button" size="sm" variant="outline" onClick={() => setLinking(r)}>
                            <Link2 /> Link
                          </Button>
                        </td>
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
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <ul className="max-h-[55vh] space-y-2 overflow-auto md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="space-y-1.5 rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={r.debitPaise ? "text-base font-semibold text-red-600 tabular-nums" : "text-base font-semibold text-green-600 tabular-nums"}>{formatINR(r.debitPaise || r.creditPaise)}</p>
                        <p className="text-xs text-muted-foreground">
                          {dayText.format(new Date(`${r.date}T00:00:00Z`))} · {r.bank}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => setLinking(r)}>
                        <Link2 /> Link
                      </Button>
                    </div>
                    <p className="text-xs break-words text-muted-foreground">{r.details}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
      <LinkEntryDialog row={linking} options={options} actions={actions} onClose={() => setLinking(null)} onLinked={() => router.refresh()} />
    </>
  );
}
