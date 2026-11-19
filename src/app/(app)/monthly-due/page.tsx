import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { formatMonth } from "@/features/food/format";
import { saveMonthlyExpensesAction, setPersonalPartyAction } from "@/features/monthly-due/actions";
import { DueSummary } from "@/features/monthly-due/components/due-summary";
import { MonthlyExpensesEditor } from "@/features/monthly-due/components/monthly-expenses-editor";
import { PersonalPicker } from "@/features/monthly-due/components/personal-picker";
import { UpdateBalance } from "@/features/monthly-due/components/update-balance";
import { setOpeningBalanceAction } from "@/features/quick-pay/actions";
import { getDueOverview, type DueOverview } from "@/features/monthly-due/server/service";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
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

  const editing = overview.expenses.months.find((m) => m.month === period.month) ?? overview.expenses.months[0];

  return (
    <>
      <PageHeader title="Monthly Due" description="Update your balances, your monthly expenses, what is yours (My Due), what the chosen recipients owe (Debt Amount) and the balances that follow. Press any figure to see what it is made of." />
      <div className="space-y-5">
        <PeriodFilter today={today} afterDates={<UpdateBalance key={overview.updateBalance.rows.map((r) => `${r.id}:${r.amountPaise}`).join(",")} rows={overview.updateBalance.rows} today={today} nowTime={istTimeOf(now)} setOpeningBalance={setOpeningBalanceAction} />}>
          <PersonalPicker people={people} value={overview.personalPartyId} setPersonal={setPersonalPartyAction} />
        </PeriodFilter>
        <HdfcPeriodFilter today={today} cycle={hdfcFromParams({}, today)} />
        {editing ? <MonthlyExpensesEditor key={`${editing.month}-${editing.rows.map((r) => `${r.id}:${r.amountPaise}`).join(",")}`} month={editing.month} monthLabel={formatMonth(editing.month)} rows={editing.rows} saveExpenses={saveMonthlyExpensesAction} /> : null}
        <DueSummary o={overview} periodQuery={periodQuery} />
      </div>
    </>
  );
}
