import Link from "next/link";
import { FilePlus2, Settings2 } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter } from "@/features/credit-portal/components/period-filter";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istDateOf, monthBounds } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";
import { deleteFoodEntryAction, updateFoodEntryAction } from "../actions";
import { buildGrid, formatRupeesPlain, mealRecords } from "../grid";
import { listFoodEntriesRange } from "../server/service";
import type { FoodEntriesData } from "../types";
import { FoodExportMenu } from "./food-export-menu";
import { FoodGrid } from "./food-grid";
import { OrderSelect } from "./order-select";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/**
 * The page behind both Monthly Food Tracking and Food Rent: the same records in the same table (Date | Tiffin | Lunch | Dinner |
 * Total), so they can never disagree. The current month is shown to begin with; any month or From and To dates can be chosen.
 */
export async function FoodGridPage({ title, description, params }: { title: string; description: string; params: Record<string, string | string[] | undefined> }) {
  const user = await requireUser();
  const today = istDateOf(new Date());

  let from: string;
  let to: string;
  if (isDate(one(params.from)) || isDate(one(params.to))) {
    from = isDate(one(params.from)) ? one(params.from) : one(params.to);
    to = isDate(one(params.to)) ? one(params.to) : from;
  } else {
    const b = monthBounds(isMonth(one(params.month)) ? one(params.month) : today.slice(0, 7))!;
    from = b.from;
    to = b.to;
  }
  if (from > to) [from, to] = [to, from];
  const order = one(params.order) === "desc" ? "desc" : "asc";

  let data: FoodEntriesData;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    data = await listFoodEntriesRange(db, user.id, from, to);
  } catch (error) {
    console.error("[food] could not load entries", error);
    return (
      <>
        <PageHeader title={title} />
        <DatabaseUnavailable />
      </>
    );
  }

  const days = buildGrid(data.rows, order);
  const records = mealRecords(from, to, data.rows);
  const exportMonthFrom = from.slice(0, 7);
  const exportMonthTo = to.slice(0, 7);
  const bulkMonth = isMonth(one(params.month)) ? one(params.month) : from.slice(0, 7);
  const back = title === "Food Rent" ? "food-rent" : "food";

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Link href={`/food/bulk?month=${bulkMonth}&back=${back}`} className={cn(buttonVariants({ variant: "outline" }))}>
              <FilePlus2 /> <span className="hidden sm:inline">Add Bulk</span>
            </Link>
            <FoodExportMenu from={exportMonthFrom} to={exportMonthTo} disabled={data.rows.length === 0} />
            <Link href="/food/settings" aria-label="Customize food items and prices" title="Customize" className={cn(buttonVariants({ variant: "outline" }))}>
              <Settings2 /> <span className="hidden sm:inline">Customize</span>
            </Link>
          </>
        }
      />

      <div className="space-y-5">
        <PeriodFilter today={today}>
          <OrderSelect value={order} />
        </PeriodFilter>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total amount</p>
              <p className="text-2xl font-semibold tabular-nums">{formatRupeesPlain(data.totalPaise)}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Meal Records (Sundays left out)</p>
              <p className="text-2xl font-semibold tabular-nums" aria-label={`${records.recorded} of ${records.expected} meals recorded`}>
                {records.recorded}/{records.expected}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                Expected {records.expected} · Recorded {records.recorded} · Nil {records.nil} · Not recorded {records.missing}
              </p>
            </CardContent>
          </Card>
        </div>

        <FoodGrid days={days} totalPaise={data.totalPaise} actions={{ updateEntry: updateFoodEntryAction, deleteEntry: deleteFoodEntryAction }} />
      </div>
    </>
  );
}
