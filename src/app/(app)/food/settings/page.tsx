import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { addFoodItemAction, deleteFoodItemAction, setMealPriceAction, updateFoodItemAction } from "@/features/food/actions";
import { FoodSettings } from "@/features/food/components/food-settings";
import { getFoodPricing } from "@/features/food/server/service";
import type { FoodPricing } from "@/features/food/types";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Customize Food" };

export default async function FoodSettingsPage() {
  const user = await requireUser();

  let pricing: FoodPricing;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    pricing = await getFoodPricing(db, user.id);
  } catch (error) {
    console.error("[food] could not load settings", error);
    return (
      <>
        <PageHeader title="Customize Food" />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Customize Food"
        description="Add food items and their prices for each meal. Food Entry uses these prices automatically."
        actions={
          <Link href="/food" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <ArrowLeft className="size-3.5" /> Back to Monthly Food Tracking
          </Link>
        }
      />
      <div className="max-w-3xl">
        <FoodSettings
          initial={pricing}
          actions={{ addItem: addFoodItemAction, updateItem: updateFoodItemAction, deleteItem: deleteFoodItemAction, setMealPrice: setMealPriceAction }}
        />
      </div>
    </>
  );
}
