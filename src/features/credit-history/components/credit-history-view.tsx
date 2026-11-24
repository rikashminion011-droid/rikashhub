"use client";

import { ChevronLeft, Eye, MoreVertical, Star, StarOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { setDefaultCreditAction } from "../actions";
import type { CreditDebit, CreditSource, CreditSummary } from "../server/service";

const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const dayTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const signed = (paise: number) => (paise < 0 ? `−${formatINR(-paise)}` : formatINR(paise));
const tone = (paise: number) => (paise < 0 ? "text-destructive" : paise === 0 ? "text-muted-foreground" : "text-success");

/**
 * Credit History: totals on top; on a wide screen the credits on the left and the chosen one on the right; on a phone the totals
 * and compact credit cards first, and choosing a credit opens its debits with a way back.
 */
export function CreditHistoryView({ sources, summary, selectedId, hasSelection, debits, setDefault }: { sources: CreditSource[]; summary: CreditSummary; selectedId: string | null; /** True when a credit was chosen in the address (a phone then shows its detail). */ hasSelection: boolean; debits: CreditDebit[]; setDefault: typeof setDefaultCreditAction }) {
  const router = useRouter();
  const selected = sources.find((s) => s.id === selectedId) ?? null;

  async function mark(id: string | null) {
    const r = await setDefault({ creditId: id });
    if (!r.ok) return void toast.error(r.error);
    toast.success(id ? "Default credit source set." : "Default removed.");
    router.refresh();
  }

  const stat = (label: string, paise: number, colour?: string) => (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", colour)}>{signed(paise)}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1" role="group" aria-label="Totals">
        {stat("Total Credited Amount", summary.creditedPaise, "text-success")}
        {stat("Total Debited Amount", summary.debitedPaise, "text-destructive")}
        {stat("Total Remaining Balance", summary.remainingPaise, tone(summary.remainingPaise))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* The credits */}
        <section className={cn("min-w-0 space-y-2", hasSelection && "max-lg:hidden")} aria-label="Credits">
          {sources.length === 0 ? (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No credits yet. Credits saved in Quick Entry appear here.</p>
          ) : (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li key={s.id} className={cn("flex items-stretch rounded-xl border bg-card", s.id === selected?.id && "border-primary ring-1 ring-primary/40")}>
                  <Link href={`/credit-history?c=${s.id}`} scroll={false} aria-current={s.id === selected?.id ? "true" : undefined} className="min-w-0 flex-1 space-y-1 rounded-l-xl px-3 py-2.5 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold text-success tabular-nums">{formatINR(s.amountPaise)}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {s.isDefault ? <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"><Star className="size-3" aria-hidden /> Default</span> : null}
                        {s.isLatest ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">Latest</span> : null}
                      </div>
                    </div>
                    <p className="text-sm break-words">{s.reason || <span className="text-muted-foreground">No reason</span>}</p>
                    <p className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted-foreground tabular-nums">
                      <span>{day.format(new Date(s.occurredAt))}</span>
                      <span>
                        Used {formatINR(s.usedPaise)} · Balance <span className={cn("font-semibold", tone(s.balancePaise))}>{signed(s.balancePaise)}</span>
                      </span>
                    </p>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Credit actions" className="my-auto mr-1 shrink-0" />}>
                      <MoreVertical />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {s.isDefault ? (
                        <DropdownMenuItem onClick={() => void mark(null)}>
                          <StarOff /> Remove as Default
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => void mark(s.id)}>
                          <Star /> Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => router.push(`/credit-history?c=${s.id}`, { scroll: false })}>
                        <Eye /> View Transactions
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The chosen credit */}
        <section className={cn("min-w-0 space-y-3", !hasSelection && "max-lg:hidden")} aria-label="Selected credit">
          {selected ? (
            <>
              <Link href="/credit-history" scroll={false} className="inline-flex items-center gap-1 text-sm font-medium text-primary lg:hidden">
                <ChevronLeft className="size-4" aria-hidden /> All credits
              </Link>
              <div className="space-y-2 rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold break-words">{selected.reason || "Credit"}</p>
                  {selected.isDefault ? <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"><Star className="size-3" aria-hidden /> Default</span> : null}
                </div>
                <p className="text-xs text-muted-foreground">{dayTime.format(new Date(selected.occurredAt))}</p>
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Original credit</dt>
                    <dd className="font-semibold text-success tabular-nums">{formatINR(selected.amountPaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Total used</dt>
                    <dd className="font-semibold tabular-nums">{formatINR(selected.usedPaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Remaining balance</dt>
                    <dd className={cn("font-semibold tabular-nums", tone(selected.balancePaise))}>{signed(selected.balancePaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Transactions</dt>
                    <dd className="font-semibold tabular-nums">{selected.debitCount}</dd>
                  </div>
                </dl>
              </div>
              {debits.length === 0 ? (
                <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No debit has used this credit yet.</p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead className="border-b bg-muted text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Date and time</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Reason</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Category</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Through</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Recipient</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {debits.map((d) => (
                          <tr key={d.id} className="hover:bg-muted/40">
                            <td className="px-3 py-2.5 whitespace-nowrap">{dayTime.format(new Date(d.occurredAt))}</td>
                            <td className="max-w-48 px-3 py-2.5 break-words">
                              <Link href={`/quick-pay?entry=${d.id}`} className="underline-offset-4 hover:underline">
                                {d.reason || "Open"}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5">{d.category || <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2.5 text-right font-medium text-destructive tabular-nums">{formatINR(d.chargedPaise)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{d.through || <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2.5">{d.recipients || <span className="text-muted-foreground">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="space-y-2 md:hidden">
                    {debits.map((d) => (
                      <li key={d.id} className="space-y-1 rounded-xl border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/quick-pay?entry=${d.id}`} className="text-sm font-medium break-words">
                            {d.reason || "Open"}
                          </Link>
                          <p className="shrink-0 font-semibold text-destructive tabular-nums">{formatINR(d.chargedPaise)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {dayTime.format(new Date(d.occurredAt))}
                          {d.category ? ` · ${d.category}` : ""}
                          {d.through ? ` · ${d.through}` : ""}
                          {d.recipients ? ` · ${d.recipients}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Choose a credit to see the debits that used it.</p>
          )}
        </section>
      </div>
    </div>
  );
}
