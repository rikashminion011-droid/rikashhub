import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { listPortals } from "@/features/credit-portal/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { getDueOverview, type DueOverview } from "@/features/monthly-due/server/service";
import { istDateOf, rangeToInstants } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR, toPaise } from "@/lib/finance";
import { periodFromParams } from "@/lib/period-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

interface DashboardData {
  overview: DueOverview;
  debitPaise: number;
  creditPaise: number;
  count: number;
  shoppingPaise: number;
  shoppingCount: number;
  pendingShopping: number;
  portals: { id: string; name: string; totalPaise: number; usedPaise: number; cardInfoSaved: boolean }[];
}

const signed = (paise: number) => (paise < 0 ? `−${formatINR(-paise)}` : formatINR(paise));

/** One page of the figures that matter, all worked out from the same records as the other pages, for the chosen period. */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const today = istDateOf(new Date());
  const period = periodFromParams(await searchParams, today);

  let d: DashboardData;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    const bounds = rangeToInstants(period.from, period.to);
    const when = bounds.gte || bounds.lt ? { occurredAt: bounds } : {};
    const [overview, expense, income, purchases, portals] = await Promise.all([
      getDueOverview(db, user.id, { from: period.from, to: period.to }),
      db.transaction.aggregate({ where: { userId: user.id, quickPay: true, deletedAt: null, type: "EXPENSE", ...when }, _sum: { amount: true }, _count: { _all: true } }),
      db.transaction.aggregate({ where: { userId: user.id, quickPay: true, deletedAt: null, type: "INCOME", ...when }, _sum: { amount: true }, _count: { _all: true } }),
      db.shoppingPurchase.findMany({ where: { userId: user.id, deletedAt: null, platform: { deletedAt: null }, ...when }, select: { amount: true, detailsSaved: true, imageType: true, recipientIds: true } }),
      listPortals(db, user.id),
    ]);
    d = {
      overview,
      debitPaise: expense._sum.amount ? toPaise(expense._sum.amount.toString()) : 0,
      creditPaise: income._sum.amount ? toPaise(income._sum.amount.toString()) : 0,
      count: expense._count._all + income._count._all,
      shoppingPaise: purchases.reduce((s, p) => s + toPaise(p.amount.toString()), 0),
      shoppingCount: purchases.length,
      pendingShopping: purchases.filter((p) => !p.detailsSaved || !p.imageType || p.recipientIds.length === 0).length,
      portals,
    };
  } catch (error) {
    console.error("[dashboard] could not load", error);
    return (
      <>
        <PageHeader title="Dashboard" />
        <DatabaseUnavailable />
      </>
    );
  }

  const o = d.overview;
  const carry = new URLSearchParams(period.custom ? { from: period.from, to: period.to } : { month: period.month }).toString();
  const q = `?${carry}`;
  const tiles: { label: string; value: string; note?: string; href: string; tone?: string }[] = [
    { label: "Spent (debits)", value: formatINR(d.debitPaise), note: `${d.count} transactions`, href: `/quick-pay/transactions${q}` },
    { label: "Money in (credits)", value: formatINR(d.creditPaise), href: `/quick-pay/transactions${q}`, tone: "text-success" },
    { label: "Food", value: formatINR(o.food.totalPaise), note: `${o.food.days.length} days with meals`, href: `/food${q}` },
    { label: "Shopping", value: formatINR(d.shoppingPaise), note: `${d.shoppingCount} purchases${d.pendingShopping ? ` · ${d.pendingShopping} pending` : ""}`, href: "/shopping" },
    { label: "Total debt", value: formatINR(o.debt.totalPaise), note: `${formatINR(o.debt.paidPaise)} paid · ${signed(o.debt.remainingPaise)} remaining`, href: `/debt${q}` },
    { label: "My Due", value: formatINR(o.myDuePaise), href: `/monthly-due${q}` },
    { label: "My Balance", value: signed(o.myBalancePaise), href: `/monthly-due${q}`, tone: o.myBalancePaise < 0 ? "text-destructive" : undefined },
        { label: "New Balance", value: signed(o.newBalancePaise), href: `/monthly-due${q}`, tone: o.newBalancePaise < 0 ? "text-destructive" : undefined },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="The whole picture for the period, from the same records as every other page. It changes the moment anything is added, edited, deleted or settled." />
      <div className="space-y-6">
        <PeriodFilter today={today} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="rounded-xl border bg-card px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className={cn("text-xl font-semibold tabular-nums", t.tone)}>{t.value}</p>
              {t.note ? <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{t.note}</p> : null}
            </Link>
          ))}
        </div>

        <section className="space-y-3" aria-labelledby="util">
          <h2 id="util" className="text-sm font-semibold">
            Credit utilization
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.portals.map((p) => {
              const used = p.totalPaise > 0 ? Math.min(100, Math.round((p.usedPaise / p.totalPaise) * 100)) : 0;
              return (
                <li key={p.id} className="space-y-2 rounded-xl border bg-card p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/credit-cards?portal=${p.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">{p.cardInfoSaved ? `${formatINR(p.usedPaise)} of ${formatINR(p.totalPaise)}` : "Card information not entered"}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-emerald-100" role="img" aria-label={p.cardInfoSaved ? `${used}% used` : "No card information"}>
                    <div className="h-full bg-amber-500" style={{ width: `${p.cardInfoSaved ? used : 0}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
