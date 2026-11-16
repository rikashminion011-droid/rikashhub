import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { saveFoodBulkAction } from "@/features/food/actions";
import { FoodMonthSheet } from "@/features/food/components/food-month-sheet";
import { getFoodPricing } from "@/features/food/server/service";
import type { FoodPricing } from "@/features/food/types";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Add Bulk Meals" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function FoodBulkPage({ searchParams }: PageProps<"/food/bulk">) {
  const user = await requireUser();
  const params = await searchParams;

  let pricing: FoodPricing;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    pricing = await getFoodPricing(db, user.id);
  } catch (error) {
    console.error("[food] could not load prices for bulk entry", error);
    return (
      <>
        <PageHeader title="Add Bulk Meals" />
        <DatabaseUnavailable />
      </>
    );
  }

  const now = new Date();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(params.month)) ? one(params.month) : istDateOf(now).slice(0, 7);
  const back = "food" as const;
  return (
    <>
      <PageHeader title="Add Bulk Meals" description="Pick a month and fill in its days. The total of each day is worked out for you. Nothing is saved until you press Save." />
      <FoodMonthSheet pricing={pricing} today={istDateOf(now)} nowTime={istTimeOf(now)} initialMonth={month} back={back} saveBulk={saveFoodBulkAction} />
    </>
  );
}
