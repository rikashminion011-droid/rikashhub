import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { ensureUserSetup } from "@/features/expenses/server/service";
import {
  addPlatformAction,
  addShoppingRecipientAction,
  createPurchaseAction,
  deletePurchaseAction,
  removePlatformAction,
  renamePlatformAction,
  saveItemsAction,
  updatePurchaseAction,
} from "@/features/shopping/actions";
import { ShoppingView } from "@/features/shopping/components/shopping-view";
import { listPlatforms, listPurchases } from "@/features/shopping/server/service";
import { istDateOf, istTimeOf, monthBounds } from "@/features/quick-pay/datetime";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Shopping Records" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export default async function ShoppingPage({ searchParams }: PageProps<"/shopping">) {
  const user = await requireUser();
  const params = await searchParams;
  const nowDate = new Date();
  const today = istDateOf(nowDate);

  const rawFrom = one(params.from);
  const rawTo = one(params.to);
  const rawMonth = one(params.month);
  let range: { from: string | null; to: string | null };
  if (isDate(rawFrom) || isDate(rawTo)) range = { from: isDate(rawFrom) ? rawFrom : null, to: isDate(rawTo) ? rawTo : null };
  else {
    const b = monthBounds(isMonth(rawMonth) ? rawMonth : today.slice(0, 7));
    range = { from: b?.from ?? null, to: b?.to ?? null };
  }
  const pendingOnly = one(params.pending) === "1";

  let data;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    const [platforms, options] = await Promise.all([listPlatforms(db, user.id), getQuickPayOptions(db, user.id)]);
    const active = platforms.find((p) => p.id === one(params.platform)) ?? null;
    const list = await listPurchases(db, user.id, { platformId: active?.id ?? null, from: range.from, to: range.to, pendingOnly });
    data = { platforms, options, active, list };
  } catch (error) {
    console.error("[shopping] could not load", error);
    return (
      <>
        <PageHeader title="Shopping Records" />
        <DatabaseUnavailable />
      </>
    );
  }

  const { platforms, options, active, list } = data;
  return (
    <>
      <PageHeader title="Shopping Records" description="Purchases by platform, with the receipt image, recipients and the items bought." />
      <ShoppingView
        key={active?.id ?? "all"}
        platforms={platforms}
        activeId={active?.id ?? null}
        rows={list.rows}
        totalPaise={list.totalPaise}
        pendingCount={list.pendingCount}
        pendingOnly={pendingOnly}
        people={options.persons.map((p) => ({ id: p.id, name: p.name }))}
        actions={{ addPlatform: addPlatformAction, renamePlatform: renamePlatformAction, removePlatform: removePlatformAction, createPurchase: createPurchaseAction, updatePurchase: updatePurchaseAction, deletePurchase: deletePurchaseAction, saveItems: saveItemsAction }}
        addPerson={addShoppingRecipientAction}
        today={today}
        now={istTimeOf(nowDate)}
      />
    </>
  );
}
