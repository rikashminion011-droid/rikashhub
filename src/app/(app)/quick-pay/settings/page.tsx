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
} from "@/features/quick-pay/actions";
import { SettingsTabs } from "@/features/quick-pay/components/settings-tabs";
import { getBankTree, getCategoryTree } from "@/features/quick-pay/server/settings";
import type { BankTreeNode, CategoryTreeNode } from "@/features/quick-pay/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Customized Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/quick-pay/settings">) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = params.tab === "categories" ? "categories" : "banks";

  let banks: BankTreeNode[];
  let categories: CategoryTreeNode[];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [banks, categories] = await Promise.all([getBankTree(db, user.id), getCategoryTree(db, user.id)]);
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
        description="Set up the banks and categories used by Quick Entry and Add Bulk."
        actions={
          <Link href="/quick-pay" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <ArrowLeft className="size-3.5" /> Back to Quick Entry
          </Link>
        }
      />
      <div className="max-w-3xl">
        <SettingsTabs
          initialTab={tab}
          banks={banks}
          categories={categories}
          actions={{
            addBank: addBankAction,
            addSubBank: addSubBankAction,
            renameBank: renameBankAction,
            removeBank: removeBankAction,
            addCategory: addCategoryAction,
            addSubCategory: addSubCategoryAction,
            renameCategory: renameCategoryAction,
            removeCategory: removeCategoryAction,
          }}
        />
      </div>
    </>
  );
}
