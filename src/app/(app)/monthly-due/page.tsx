import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { saveMonthlyItemsAction, setPersonalPartyAction } from "@/features/monthly-due/actions";
import { DueSummary } from "@/features/monthly-due/components/due-summary";
import { MonthlyItemsEditor } from "@/features/monthly-due/components/monthly-items-editor";
import { PersonalPicker } from "@/features/monthly-due/components/personal-picker";
import { UpdateBalance } from "@/features/monthly-due/components/update-balance";
import { setOpeningBalanceAction } from "@/features/quick-pay/actions";
import { monthsOfRange } from "@/features/monthly-due/model";
import { getDueOverview, type DueOverview } from "@/features/monthly-due/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { HdfcPeriodFilter } from "@/features/debt/components/hdfc-period-filter";
import { hdfcFromParams, periodFromParams } from "@/lib/period-params";

export const metadata: Metadata = { title: "Monthly Due" };

export default async function MonthlyDuePage({ searchParams }: PageProps<"/monthly-due">) {
  const user = await requireUser();
  const now = new Date();
  const today = istDateOf(now);
  const params = await searchParams;
  const period = periodFromParams(params, today);
  const hdfc = hdfcFromParams(params, today);

  let overview: DueOverview;
  let people: { id: string; name: string }[];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    const [o, parties] = await Promise.all([getDueOverview(db, user.id, { from: period.from, to: period.to }, { from: hdfc.from, to: hdfc.to }), db.expenseParty.findMany({ where: { userId: user.id, deletedAt: null, nameKey: { not: "personal" } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })]);
    overview = o;
    people = parties;
  } catch (error) {
    console.error("[monthly-due] could not load", error);
    return (
      <>
        <PageHeader title="Monthly Due" />
        <DatabaseUnavailable />
      </>
    );
  }

  // The same period is carried into the pages the figures open.
  const carry = new URLSearchParams();
  if (period.custom) {
    carry.set("from", period.from);
    carry.set("to", period.to);
  } else carry.set("month", period.month);
  if (hdfc.custom) {
    carry.set("hfrom", hdfc.from);
    carry.set("hto", hdfc.to);
  }
  const periodQuery = `?${carry.toString()}`;

  // The months the date filter covers: only rows of these months show, and each row names its own month.
  const scope = monthsOfRange(period.from, period.to);
  const rowKey = (rows: { id: string; amountPaise: number; month: string }[]) => rows.map((r) => `${r.id}:${r.amountPaise}:${r.month}`).join(",");

  return (
    <>
      <PageHeader title="Monthly Due" description="Update your balances, your monthly expenses, what is yours (My Due), what the chosen recipients owe (Debt Amount) and the balances that follow. Press any figure to see what it is made of." />
      <div className="space-y-5">
        <PeriodFilter today={today} afterDates={<UpdateBalance key={overview.updateBalance.rows.map((r) => `${r.id}:${r.amountPaise}`).join(",")} rows={overview.updateBalance.rows} setOpeningBalance={setOpeningBalanceAction} />}>
          <PersonalPicker people={people} value={overview.personalPartyId} setPersonal={setPersonalPartyAction} />
        </PeriodFilter>
        <HdfcPeriodFilter today={today} cycle={hdfcFromParams({}, today)} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <MonthlyItemsEditor key={`other-${rowKey(overview.expenses.rows)}`} kind="OTHER" title="My other expenses" rows={overview.expenses.rows} scope={scope} defaultMonth={period.month} saveItems={saveMonthlyItemsAction} />
          <MonthlyItemsEditor key={`bill-${rowKey(overview.bills.rows)}`} kind="BILL" title="My monthly bills" rows={overview.bills.rows} scope={scope} defaultMonth={period.month} saveItems={saveMonthlyItemsAction} />
        </div>
        <DueSummary o={overview} periodQuery={periodQuery} />
      </div>
    </>
  );
}
