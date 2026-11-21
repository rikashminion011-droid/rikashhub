import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { addDebtEntriesAction, addPaymentAction, deletePaymentAction, getDebtHistoryAction } from "@/features/debt/actions";
import { AddDebtDialog } from "@/features/debt/components/add-debt-dialog";
import { HdfcPeriodFilter } from "@/features/debt/components/hdfc-period-filter";
import { DebtTable } from "@/features/debt/components/debt-table";
import { RecipientFilter } from "@/features/debt/components/recipient-filter";
import { getDebtSummary } from "@/features/debt/server/service";
import type { DebtSummary } from "@/features/debt/types";
import { totals } from "@/features/debt/view";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { setDebtRecipientsAction } from "@/features/monthly-due/actions";
import { getDebtRecipients, getPersonalPartyId } from "@/features/monthly-due/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { getSettings } from "@/features/quick-pay/server/prefs";
import type { DebtSettings } from "@/features/quick-pay/settings-model";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { hdfcFromParams, periodFromParams } from "@/lib/period-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Debt Management" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function DebtPage({ searchParams }: PageProps<"/debt">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = istDateOf(new Date());
  const period = periodFromParams(params, today);
  const hdfc = hdfcFromParams(params, today);
  // An address can still name recipients; otherwise the ones chosen last time are used.
  const fromAddress = one(params.people).split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  let summary: DebtSummary;
  let settings: DebtSettings;
  let everyone: { id: string; name: string }[];
  let picked: string[] = fromAddress;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    const personal = await getPersonalPartyId(db, user.id);
    if (fromAddress.length === 0) picked = await getDebtRecipients(db, user.id);
    const [full, s] = await Promise.all([getDebtSummary(db, user.id, { from: period.from, to: period.to, hdfc: { from: hdfc.from, to: hdfc.to }, excludePartyIds: personal ? [personal] : [] }), getSettings(db, user.id).then((x) => x.debt)]);
    settings = s;
    everyone = full.rows.map((r) => ({ id: r.partyId, name: r.name }));
    summary = picked.length > 0 ? totals(full.rows.filter((r) => picked.includes(r.partyId))) : full;
  } catch (error) {
    console.error("[debt] could not load", error);
    return (
      <>
        <PageHeader title="Debt Management" />
        <DatabaseUnavailable />
      </>
    );
  }

  // A recipient whose total debt is 0.00 is not listed in the table, even when chosen in the Recipients list.
  const listed = totals(summary.rows.filter((r) => r.totalDebtPaise !== 0));

  // One recipient chosen: Add Debt appears at the top for that person.
  const chosenOne = picked.length === 1 ? (everyone.find((p) => p.id === picked[0]) ?? null) : null;

  // The same period and recipients are carried into a person's page.
  const carry = new URLSearchParams();
  if (period.custom) {
    carry.set("from", period.from);
    carry.set("to", period.to);
  } else if (one(params.month)) carry.set("month", period.month);
  if (hdfc.custom) {
    carry.set("hfrom", hdfc.from);
    carry.set("hto", hdfc.to);
  }
  const query = carry.toString() ? `?${carry.toString()}` : "";

  return (
    <>
      <PageHeader
        title="Debt Management"
        description="What each person owes from splits, debts, shopping and credit portals, what they have paid, and what remains. It updates by itself whenever anything is added, changed, removed or settled."
        actions={
          <Link href="/quick-pay/settings?tab=debt" className={cn(buttonVariants({ variant: "outline" }))}>
            <Settings2 /> <span className="hidden sm:inline">Customize</span>
          </Link>
        }
      />
      <div className="space-y-5">
        {chosenOne ? <AddDebtDialog partyId={chosenOne.id} name={chosenOne.name} add={addDebtEntriesAction} /> : null}
        <PeriodFilter today={today}>
          <RecipientFilter key={picked.join(",")} people={everyone} selected={picked} save={setDebtRecipientsAction} />
        </PeriodFilter>
        <HdfcPeriodFilter today={today} cycle={hdfcFromParams({}, today)} />

        {settings.showTotals ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="gap-1 py-4">
              <CardContent className="space-y-1">
                <p className="text-xs text-muted-foreground">Total value (debt)</p>
                <p className="text-2xl font-semibold tabular-nums">{formatINR(summary.totalDebtPaise)}</p>
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="space-y-1">
                <p className="text-xs text-muted-foreground">Total paid</p>
                <p className="text-2xl font-semibold text-success tabular-nums">{formatINR(summary.totalPaidPaise)}</p>
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="space-y-1">
                <p className="text-xs text-muted-foreground">Total remaining</p>
                <p className={cn("text-2xl font-semibold tabular-nums", summary.totalRemainingPaise > 0 && "text-destructive")}>{formatINR(summary.totalRemainingPaise)}</p>
              </CardContent>
            </Card>
          </div>
        ) : null}
        <DebtTable settings={settings} summary={listed} range={{ from: period.from, to: period.to, hdfc: { from: hdfc.from, to: hdfc.to } }} query={query} actions={{ getHistory: getDebtHistoryAction, addPayment: addPaymentAction, deletePayment: deletePaymentAction }} />
      </div>
    </>
  );
}
