"use client";

import Link from "next/link";
import { useState } from "react";
import { formatLongDate } from "@/features/quick-pay/date-format";
import { formatClock } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { DueItem, DueOverview } from "../server/service";

type Key = "myDue" | "debt" | "myBalance" | "new";

const signed = (paise: number) => (paise < 0 ? `−${formatINR(-paise)}` : formatINR(paise));
const when = (iso: string) => {
  const d = new Date(iso);
  return `${formatLongDate(istDateOf(d))}, ${formatClock(istTimeOf(d))}`;
};

/**
 * The figures of Monthly Due. My Due is Food + HDFC statement (your lines) + Shopping Records (your part) + Monthly Expenses;
 * the Debt Amount is the total value of the recipients chosen in Debt Management; My Balance is Debt Amount - My Due;
 * New Balance is the total of Update Balance + My Balance. Each figure can be pressed to see what it is made of.
 */
export function DueSummary({ o, periodQuery }: { o: DueOverview; periodQuery: string }) {
  const [open, setOpen] = useState<Key | null>(null);
  const toggle = (k: Key) => setOpen((cur) => (cur === k ? null : k));

  const cards: { key: Key; label: string; value: string; note: string; tone?: string }[] = [
    { key: "myDue", label: "My Due", value: formatINR(o.myDuePaise), note: "Food + HDFC statement + Shopping + Monthly Expenses" },
    { key: "debt", label: "Debt Amount", value: formatINR(o.debtAmountPaise), note: "Recipients chosen in Debt Management" },
    { key: "myBalance", label: "My Balance", value: signed(o.myBalancePaise), note: "Debt Amount − My Due" },
    { key: "new", label: "New Balance", value: signed(o.newBalancePaise), note: "Total of Update Balance + My Balance", tone: o.newBalancePaise < 0 ? "text-destructive" : undefined },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <div className="space-y-5 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">My Due{o.personalName ? ` · ${o.personalName}` : ""}</h2>
          {!o.personalPartyId ? <p className="text-sm text-muted-foreground">Choose your name above to include your HDFC statement and shopping amounts. Food and monthly expenses are counted already.</p> : null}

          <Part title="Food" totalPaise={o.food.totalPaise} link={{ href: `/food${periodQuery}`, label: "Open Food Tracking" }}>
            {o.food.days.length === 0 ? (
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
            )}
          </Part>
          <Part title={`HDFC statement · ${formatLongDate(o.hdfc.range.from)} to ${formatLongDate(o.hdfc.range.to)}`} totalPaise={o.hdfc.totalPaise} link={{ href: "/credit-cards", label: "Open Credit Portal" }}>
            <Items items={o.hdfc.items} />
          </Part>
          <Part title="Shopping Records" totalPaise={o.shopping.totalPaise} link={{ href: "/shopping", label: "Open Shopping Records" }}>
            <Items items={o.shopping.items} />
          </Part>
          <Part title="Monthly Expenses" totalPaise={o.expenses.totalPaise}>
            <ul className="divide-y rounded-lg border text-sm">
              {o.expenses.months.flatMap((m) => m.rows.map((r) => ({ ...r, month: m.month }))).map((r, i) => (
                <li key={`${r.month}-${i}`} className="flex items-center justify-between px-3 py-1.5">
                  <span>
                    {r.name} <span className="text-xs text-muted-foreground">· {r.month}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatINR(r.amountPaise)}</span>
                </li>
              ))}
            </ul>
          </Part>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">Recipient</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Total value</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
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
                      <td className="px-3 py-2 text-right tabular-nums">{formatINR(p.totalDebtPaise)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-success">{formatINR(p.paidPaise)}</td>
                      <td className="py-2 pl-3 text-right font-medium tabular-nums">{signed(p.remainingPaise)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-2 pr-3">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(o.debt.totalPaise)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(o.debt.paidPaise)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{signed(o.debt.remainingPaise)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {open === "myBalance" ? (
        <div className="space-y-1 rounded-xl border bg-card p-4 text-sm">
          <h2 className="text-sm font-semibold">My Balance</h2>
          {[
            ["Debt Amount", formatINR(o.debtAmountPaise)],
            ["− My Due", formatINR(o.myDuePaise)],
          ].map(([label, value]) => (
            <p key={label} className="flex justify-between gap-4 tabular-nums">
              <span className="text-muted-foreground">{label}</span>
              <span>{value}</span>
            </p>
          ))}
          <p className="flex justify-between gap-4 border-t pt-1 font-semibold tabular-nums">
            <span>My Balance</span>
            <span>{signed(o.myBalancePaise)}</span>
          </p>
        </div>
      ) : null}

      {open === "new" ? (
        <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
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
            <span>{signed(o.myBalancePaise)}</span>
          </p>
          <p className="flex justify-between gap-4 border-t pt-1 font-semibold tabular-nums">
            <span>New Balance</span>
            <span>{signed(o.newBalancePaise)}</span>
          </p>
        </div>
      ) : null}
    </div>
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

function Part({ title, totalPaise, link, children }: { title: string; totalPaise: number; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title} <span className="ml-2 font-normal tabular-nums text-muted-foreground">{formatINR(totalPaise)}</span>
        </h3>
        {link ? (
          <Link href={link.href} className="text-xs font-medium underline underline-offset-4">
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
