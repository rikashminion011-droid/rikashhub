import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import {
  addBankAction,
  addCategoryAction,
  addSubBankAction,
  addSubCategoryAction,
  removeBankAction,
  removeCategoryAction,
  renameBankAction,
  renameCategoryAction,
  resetSettingsAction,
  saveSettingsAction,
  setKeywordsAction,
} from "@/features/quick-pay/actions";
import { SettingsCenter } from "@/features/quick-pay/components/settings-center";
import { readSettingsTab, type SettingsTab } from "@/features/quick-pay/settings-tabs";
import { addFoodItemAction, deleteFoodItemAction, setMealPriceAction, updateFoodItemAction } from "@/features/food/actions";
import { getFoodPricing } from "@/features/food/server/service";
import type { FoodPricing } from "@/features/food/types";
import { getBankTree, getCategoryTree, getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { BankTreeNode, CategoryTreeNode, QuickPayOptions } from "@/features/quick-pay/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { addPersonAction, removePersonAction, renamePersonAction } from "@/features/users/actions";
import { listPeople } from "@/features/users/server/service";
import type { PersonRow } from "@/features/users/types";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Customized Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/quick-pay/settings">) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: SettingsTab = readSettingsTab(params.tab);

  let banks: BankTreeNode[];
  let categories: CategoryTreeNode[];
  let people: PersonRow[];
  let options: QuickPayOptions;
  let food: FoodPricing;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [banks, categories, people, options, food] = await Promise.all([getBankTree(db, user.id), getCategoryTree(db, user.id), listPeople(db, user.id), getQuickPayOptions(db, user.id), getFoodPricing(db, user.id)]);
  } catch (error) {
    console.error("[quick-pay] could not load settings", error);
    return (
      <>
        <PageHeader title="Customized Settings" />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Customized Settings"
        description="Choose a page, then set it up section by section. Changes apply across the whole app as soon as you save."
        actions={
          <Link href="/quick-pay" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <ArrowLeft className="size-3.5" /> Back to Quick Entry
          </Link>
        }
      />
      <SettingsCenter
        initialTab={tab}
        banks={banks}
        categories={categories}
        people={people}
        options={options}
        food={food}
        actions={{
          addBank: addBankAction,
          addSubBank: addSubBankAction,
          renameBank: renameBankAction,
          removeBank: removeBankAction,
          addCategory: addCategoryAction,
          addSubCategory: addSubCategoryAction,
          renameCategory: renameCategoryAction,
          removeCategory: removeCategoryAction,
          setKeywords: setKeywordsAction,
          save: saveSettingsAction,
          reset: resetSettingsAction,
          people: { addPerson: addPersonAction, renamePerson: renamePersonAction, removePerson: removePersonAction },
          food: { addItem: addFoodItemAction, updateItem: updateFoodItemAction, deleteItem: deleteFoodItemAction, setMealPrice: setMealPriceAction },
        }}
      />
    </>
  );
}
