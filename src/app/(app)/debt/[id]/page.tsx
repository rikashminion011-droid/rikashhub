import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { DebtItems } from "@/features/debt/components/debt-table";
import { getDebtHistory } from "@/features/debt/server/service";
import type { DebtHistory } from "@/features/debt/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { periodFromParams } from "@/lib/period-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Recipient · Debt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person: what they owe from each source, what they paid, the balance, and every transaction behind it. */
export default async function RecipientDebtPage({ params, searchParams }: PageProps<"/debt/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const today = istDateOf(new Date());
  const period = periodFromParams(await searchParams, today);

  let history: DebtHistory;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    history = await getDebtHistory(db, user.id, id, { from: period.from, to: period.to });
  } catch (error) {
    if (error instanceof Error && error.message === "That person no longer exists.") notFound();
    console.error("[debt] recipient could not load", error);
    return (
      <>
        <PageHeader title="Debt Management" />
        <DatabaseUnavailable />
      </>
    );
  }

  const { row } = history;
  const splitOnly = row.totalSplitPaise - row.directPaise;
  const cards: { label: string; value: number; tone?: "good" | "bad" }[] = [
    { label: "Total split amount", value: splitOnly },
    { label: "Total direct debt", value: row.directPaise },
    { label: "Total shopping amount", value: row.shoppingPaise },
    { label: "Total credit portal amount", value: row.portalPaise },
    { label: "Total paid", value: row.paidPaise, tone: "good" },
    { label: row.remainingPaise < 0 ? "Paid ahead" : "Outstanding balance", value: Math.abs(row.remainingPaise), tone: row.remainingPaise > 0 ? "bad" : "good" },
  ];

  return (
    <>
      <PageHeader
        title={row.name}
        description="Everything recorded for this person in the chosen period, traceable to the original entry."
        actions={
          <Link href="/debt" className={cn(buttonVariants({ variant: "outline" }))}>
            <ChevronLeft /> Back
          </Link>
        }
      />
      <div className="space-y-5">
        <PeriodFilter today={today} />
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className={cn("text-xl font-semibold tabular-nums", c.tone === "good" && "text-success", c.tone === "bad" && "text-destructive")}>{formatINR(c.value)}</dd>
            </div>
          ))}
        </dl>
        <section className="space-y-2" aria-labelledby="owed">
          <h2 id="owed" className="text-sm font-semibold">
            Transactions ({history.items.length})
          </h2>
          <DebtItems items={history.items} />
        </section>
      </div>
    </>
  );
}
