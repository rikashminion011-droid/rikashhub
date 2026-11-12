import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { saveFoodBulkAction } from "@/features/food/actions";
import { FoodBulkEntry } from "@/features/food/components/food-bulk-entry";
import { getFoodPricing } from "@/features/food/server/service";
import type { FoodPricing } from "@/features/food/types";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Add Bulk Meals" };

export default async function FoodBulkPage() {
  const user = await requireUser();

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
  return (
    <>
      <PageHeader title="Add Bulk Meals" description="Enter many meals at once. Each row is saved as its own entry under its own date and time, priced from your Customize list." />
      <FoodBulkEntry pricing={pricing} today={istDateOf(now)} nowTime={istTimeOf(now)} saveBulk={saveFoodBulkAction} />
    </>
  );
}
