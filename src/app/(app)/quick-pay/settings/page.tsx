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
import { SETTINGS_TABS, SettingsCenter, type SettingsTab } from "@/features/quick-pay/components/settings-center";
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
  const tab: SettingsTab = (SETTINGS_TABS as readonly string[]).includes(String(params.tab)) ? (params.tab as SettingsTab) : "users";

  let banks: BankTreeNode[];
  let categories: CategoryTreeNode[];
  let people: PersonRow[];
  let options: QuickPayOptions;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [banks, categories, people, options] = await Promise.all([getBankTree(db, user.id), getCategoryTree(db, user.id), listPeople(db, user.id), getQuickPayOptions(db, user.id)]);
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
        description="Set up users, banks, categories, fields, Split and Credits Added in one place. Changes apply across the whole app as soon as you save."
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
        }}
      />
    </>
  );
}
