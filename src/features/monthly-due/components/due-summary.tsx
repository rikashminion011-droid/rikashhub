"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { computeBalances } from "../model";
import type { DueItem, DueOverview } from "../server/service";

type Key = "myDue" | "bills" | "debt" | "myBalance" | "new";
type Part = "food" | "hdfc" | "shopping" | "expenses";

const signed = (paise: number) => (paise < 0 ? `−${formatINR(-paise)}` : formatINR(paise));
const when = (iso: string) => {
  const d = new Date(iso);
  return `${formatLongDate(istDateOf(d))}, ${formatClock(istTimeOf(d))}`;
};
const monthName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
const monthLabel = (month: string) => monthName.format(new Date(`${month}-01T00:00:00Z`));

/**
 * The figures of Monthly Due. My Due is Food + HDFC statement (your lines) + Shopping Records (your part) + My other expenses:
 * each shows as a title with its amount and a tick (all ticked to begin with), and only the ticked ones are added; press a title
 * to see what it is made of. My monthly bills have their own total. The Debt Amount is what the chosen recipients still owe;
 * My Balance is Debt Amount - My monthly bills - My Due; New Balance is the total of Update Balance + My Balance.
 */
export function DueSummary({ o, periodQuery }: { o: DueOverview; periodQuery: string }) {
  const [open, setOpen] = useState<Key | null>("myDue");
  const [counted, setCounted] = useState<Record<Part, boolean>>({ food: true, hdfc: true, shopping: true, expenses: true });
  const [shown, setShown] = useState<Record<Part, boolean>>({ food: false, hdfc: false, shopping: false, expenses: false });
  const toggle = (k: Key) => setOpen((cur) => (cur === k ? null : k));

  const parts: { key: Part; title: string; totalPaise: number; link?: { href: string; label: string } }[] = [
    { key: "food", title: "Food", totalPaise: o.food.totalPaise, link: { href: `/food${periodQuery}`, label: "Open Food Tracking" } },
    { key: "hdfc", title: `HDFC statement · ${formatLongDate(o.hdfc.range.from)} to ${formatLongDate(o.hdfc.range.to)}`, totalPaise: o.hdfc.totalPaise, link: { href: "/credit-cards", label: "Open Credit Portal" } },
    { key: "shopping", title: "Shopping Records", totalPaise: o.shopping.totalPaise, link: { href: "/shopping", label: "Open Shopping Records" } },
    { key: "expenses", title: "My other expenses", totalPaise: o.expenses.totalPaise },
  ];
  const myDue = parts.reduce((s, p) => s + (counted[p.key] ? p.totalPaise : 0), 0);
  const { myBalancePaise, newBalancePaise } = computeBalances({ debtPaise: o.debtAmountPaise, billsPaise: o.bills.totalPaise, myDuePaise: myDue, oldPaise: o.updateBalance.totalPaise });

  const cards: { key: Key; label: string; value: string; note: string; tone?: string }[] = [
    { key: "myDue", label: "My Due", value: formatINR(myDue), note: "Ticked: Food, HDFC statement, Shopping, My other expenses" },
    { key: "bills", label: "My monthly bills", value: formatINR(o.bills.totalPaise), note: "Bills of the months in this period" },
    { key: "debt", label: "Debt Amount", value: formatINR(o.debtAmountPaise), note: "Remaining, from the recipients chosen in Debt Management" },
    { key: "myBalance", label: "My Balance", value: signed(myBalancePaise), note: "Debt Amount − My monthly bills − My Due", tone: myBalancePaise < 0 ? "text-destructive" : undefined },
    { key: "new", label: "New Balance", value: signed(newBalancePaise), note: "Total of Update Balance + My Balance", tone: newBalancePaise < 0 ? "text-destructive" : undefined },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-expanded={open === c.key}
            onClick={() => toggle(c.key)}
            className={cn("rounded-xl border bg-card px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50", open === c.key && "border-foreground")}
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={cn("text-xl font-semibold tabular-nums", c.tone)}>{c.value}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{c.note}</p>
          </button>
        ))}
      </div>

      {open === "myDue" ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">My Due{o.personalName ? ` · ${o.personalName}` : ""}</h2>
          {!o.personalPartyId ? <p className="text-sm text-muted-foreground">Choose your name above to include your HDFC statement and shopping amounts.</p> : null}
          <ul className="divide-y rounded-lg border">
            {parts.map((p) => (
              <li key={p.key} className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <Checkbox checked={counted[p.key]} onCheckedChange={(on) => setCounted((c) => ({ ...c, [p.key]: on === true }))} aria-label={`Count ${p.title} in My Due`} />
                  <button type="button" aria-expanded={shown[p.key]} onClick={() => setShown((s) => ({ ...s, [p.key]: !s[p.key] }))} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-sm font-semibold outline-none focus-visible:underline">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ChevronDown className={cn("size-4 shrink-0 transition-transform", !shown[p.key] && "-rotate-90")} aria-hidden />
                      <span className="break-words">{p.title}</span>
                    </span>
                    <span className={cn("shrink-0 tabular-nums", !counted[p.key] && "text-muted-foreground line-through")}>{formatINR(p.totalPaise)}</span>
                  </button>
                </div>
                {shown[p.key] ? (
                  <div className="mt-2 space-y-2 pl-7">
                    {p.link ? (
                      <Link href={p.link.href} className="text-xs font-medium underline underline-offset-4">
                        {p.link.label}
                      </Link>
                    ) : null}
                    {p.key === "food" ? (
                      o.food.days.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No meals in this period.</p>
                      ) : (
                        <ul className="divide-y rounded-lg border text-sm">
                          {o.food.days.map((d) => (
                            <li key={d.date} className="flex items-center justify-between px-3 py-1.5">
                              <span>{formatLongDate(d.date)}</span>
                              <span className="font-medium tabular-nums">{formatINR(d.totalPaise)}</span>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : p.key === "hdfc" ? (
                      <Items items={o.hdfc.items} />
                    ) : p.key === "shopping" ? (
                      <Items items={o.shopping.items} />
                    ) : (
                      <MonthRows rows={o.expenses.rows} />
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="flex justify-between gap-4 px-3 pt-1 text-sm font-semibold tabular-nums">
            <span>My Due (ticked)</span>
            <span>{formatINR(myDue)}</span>
          </p>
        </div>
      ) : null}

      {open === "bills" ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">My monthly bills</h2>
          <MonthRows rows={o.bills.rows} />
          <p className="flex justify-between gap-4 pt-1 text-sm font-semibold tabular-nums">
            <span>Total</span>
            <span>{formatINR(o.bills.totalPaise)}</span>
          </p>
        </div>
      ) : null}

      {open === "debt" ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Debt Amount, person by person</h2>
            <Link href={`/debt${periodQuery}`} className="text-sm font-medium underline underline-offset-4">
              Open Debt Management
            </Link>
          </div>
          {o.debt.people.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is owed by the chosen recipients in this period.</p>
          ) : (
            <table className="w-full max-w-md text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Recipient</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {o.debt.people.map((p) => (
                  <tr key={p.partyId}>
                    <td className="py-2 pr-3">
                      <Link href={`/debt/${p.partyId}${periodQuery}`} className="font-medium underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-2 pl-3 text-right font-medium tabular-nums">{signed(p.remainingPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-2 pr-3">Total remaining</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{signed(o.debt.remainingPaise)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      ) : null}

      {open === "myBalance" ? (
        <div className="max-w-md space-y-1 rounded-xl border bg-card p-4 text-sm">
          <h2 className="text-sm font-semibold">My Balance</h2>
          {[
            ["Debt Amount", formatINR(o.debtAmountPaise)],
            ["− My monthly bills", formatINR(o.bills.totalPaise)],
            ["− My Due", formatINR(myDue)],
          ].map(([label, value]) => (
            <p key={label} className="flex justify-between gap-4 tabular-nums">
              <span className="text-muted-foreground">{label}</span>
              <span>{value}</span>
            </p>
          ))}
          <p className="flex justify-between gap-4 border-t pt-1 font-semibold tabular-nums">
            <span>My Balance</span>
            <span>{signed(myBalancePaise)}</span>
          </p>
        </div>
      ) : null}

      {open === "new" ? (
        <div className="max-w-md space-y-2 rounded-xl border bg-card p-4 text-sm">
          <h2 className="text-sm font-semibold">New Balance</h2>
          <ul className="divide-y rounded-lg border">
            {o.updateBalance.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3 py-1.5">
                <span>{r.name}</span>
                <span className="font-medium tabular-nums">{signed(r.amountPaise)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between gap-4 font-medium tabular-nums">
            <span className="text-muted-foreground">Total of Update Balance</span>
            <span>{signed(o.updateBalance.totalPaise)}</span>
          </p>
          <p className="flex justify-between gap-4 tabular-nums">
            <span className="text-muted-foreground">+ My Balance</span>
            <span>{signed(myBalancePaise)}</span>
          </p>
          <p className="flex justify-between gap-4 border-t pt-1 font-semibold tabular-nums">
            <span>New Balance</span>
            <span>{signed(newBalancePaise)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Named amounts with the month each belongs to. */
function MonthRows({ rows }: { rows: { id: string; name: string; amountPaise: number; month: string }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing for the months in this period.</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
          <span className="min-w-0 break-words">
            {r.name} <span className="text-xs text-muted-foreground">· {monthLabel(r.month)}</span>
          </span>
          <span className="shrink-0 font-medium tabular-nums">{formatINR(r.amountPaise)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Dated lines, with the reason opening the original entry. A plain list, not boxes. */
function Items({ items }: { items: DueItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing in this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 text-left font-medium">Date and time</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Reason</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Portal / platform</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((i) => (
            <tr key={i.id}>
              <td className="py-1.5 pr-3 whitespace-nowrap">{when(i.occurredAt)}</td>
              <td className="px-3 py-1.5">
                {i.href ? (
                  <Link href={i.href} className="underline-offset-4 hover:underline">
                    {i.reason || "Open"}
                  </Link>
                ) : (
                  i.reason || "—"
                )}
              </td>
              <td className="px-3 py-1.5">{i.related || "—"}</td>
              <td className="py-1.5 pl-3 text-right tabular-nums">{formatINR(i.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
