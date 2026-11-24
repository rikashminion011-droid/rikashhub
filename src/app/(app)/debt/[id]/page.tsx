import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { RecipientTransactions } from "@/features/debt/components/recipient-transactions";
import { getRecipientColumns } from "@/features/debt/server/prefs";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import { addCategoryAction, getEntryAction, getOptionsAction, getRecentCreditsAction, saveEntryAction } from "@/features/quick-pay/actions";
import { addPersonAction } from "@/features/users/actions";
import { resetRecipientColumnsAction, saveRecipientColumnsAction } from "@/features/debt/actions";
import type { ColumnPrefs } from "@/features/debt/recipient-view";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { getDebtHistory } from "@/features/debt/server/service";
import type { DebtHistory } from "@/features/debt/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { hdfcFromParams, periodFromParams } from "@/lib/period-params";
import { addDebtEntriesAction } from "@/features/debt/actions";
import { AddDebtDialog } from "@/features/debt/components/add-debt-dialog";
import { HdfcPeriodFilter } from "@/features/debt/components/hdfc-period-filter";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Recipient · Debt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person: what they owe from each source, what they paid, the balance, and every transaction behind it. */
export default async function RecipientDebtPage({ params, searchParams }: PageProps<"/debt/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const today = istDateOf(new Date());
  const sp = await searchParams;
  const period = periodFromParams(sp, today);
  const hdfc = hdfcFromParams(sp, today);

  let history: DebtHistory;
  let columns: ColumnPrefs;
  let options: QuickPayOptions;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [history, columns, options] = await Promise.all([getDebtHistory(db, user.id, id, { from: period.from, to: period.to, hdfc: { from: hdfc.from, to: hdfc.to } }), getRecipientColumns(db, user.id, id), getQuickPayOptions(db, user.id)]);
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
  // The export covers the same period and HDFC statement date as this page.
  const exportParams = new URLSearchParams();
  if (period.custom) {
    exportParams.set("from", period.from);
    exportParams.set("to", period.to);
  } else exportParams.set("month", period.month);
  if (hdfc.custom) {
    exportParams.set("hfrom", hdfc.from);
    exportParams.set("hto", hdfc.to);
  }
  const exportQuery = exportParams.toString();
  const splitOnly = row.totalSplitPaise - row.directPaise;
  // A plain list of the totals: no boxes.
  const totals: { label: string; value: number; strong?: boolean; tone?: "good" | "bad" }[] = [
    { label: "Total split amount", value: splitOnly },
    { label: "Total direct debt", value: row.directPaise },
    { label: "Total shopping amount", value: row.shoppingPaise },
    { label: "Total credit portal amount", value: row.portalPaise },
    { label: "Total added debt", value: row.manualPaise },
    { label: "Total debt", value: row.totalDebtPaise, strong: true },
    { label: "Total paid / credited", value: row.paidPaise, tone: "good" },
    { label: row.remainingPaise < 0 ? "Paid ahead" : "Outstanding balance", value: Math.abs(row.remainingPaise), strong: true, tone: row.remainingPaise > 0 ? "bad" : "good" },
  ];

  return (
    <>
      <PageHeader
        title={row.name}
        description="Everything recorded for this person in the chosen period, and every payment or credit from them, traceable to the original entry."
        actions={
          <div className="flex gap-2">
            <AddDebtDialog partyId={row.partyId} name={row.name} add={addDebtEntriesAction} />
          <Link href="/debt" className={cn(buttonVariants({ variant: "outline" }))}>
            <ChevronLeft /> Back
          </Link>
          </div>
        }
      />
      <div className="space-y-6">
        <PeriodFilter today={today} />
        <HdfcPeriodFilter today={today} cycle={hdfcFromParams({}, today)} />
        <dl className="max-w-md divide-y border-y text-sm">
          {totals.map((t) => (
            <div key={t.label} className="flex items-center justify-between gap-4 py-2">
              <dt className={cn("text-muted-foreground", t.strong && "font-semibold text-foreground")}>{t.label}</dt>
              <dd className={cn("tabular-nums", t.strong ? "text-base font-semibold" : "font-medium", t.tone === "good" && "text-success", t.tone === "bad" && "text-destructive")}>{formatINR(t.value)}</dd>
            </div>
          ))}
        </dl>
        <section className="space-y-2" aria-labelledby="owed">
          <h2 id="owed" className="text-sm font-semibold">
            Transactions
          </h2>
          <RecipientTransactions
            partyId={row.partyId}
            items={history.items}
            columns={columns}
            exportBase={exportQuery}
            options={options}
            editActions={{ saveEntry: saveEntryAction, getEntry: getEntryAction, getRecentCredits: getRecentCreditsAction, getOptions: getOptionsAction, addCategory: addCategoryAction, addPerson: addPersonAction }}
            saveColumns={saveRecipientColumnsAction}
            resetColumns={resetRecipientColumnsAction}
          />
        </section>
      </div>
    </>
  );
}
