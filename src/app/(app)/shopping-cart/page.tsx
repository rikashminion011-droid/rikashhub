import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { addCartItemAction, deleteCartItemAction, updateCartItemAction } from "@/features/shopping-cart/actions";
import { CartView } from "@/features/shopping-cart/components/cart-view";
import { listCartCategories, listCartItems, type CartCategory, type CartItem } from "@/features/shopping-cart/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Shopping Cart" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ShoppingCartPage({ searchParams }: PageProps<"/shopping-cart">) {
  const user = await requireUser();
  const params = await searchParams;
  const currentMonth = istDateOf(new Date()).slice(0, 7);
  // The current month to begin with; "all" is every month. The category is its own choice.
  const rawMonth = one(params.month);
  const month = rawMonth === "all" ? null : /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : currentMonth;
  const categoryId = UUID.test(one(params.cat)) ? one(params.cat) : null;

  let items: CartItem[];
  let categories: CartCategory[];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [items, categories] = await Promise.all([listCartItems(db, user.id, { month, categoryId }), listCartCategories(db, user.id)]);
  } catch (error) {
    console.error("[shopping-cart] could not load", error);
    return (
      <>
        <PageHeader title="Shopping Cart" />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Shopping Cart" />
      <CartView items={items} categories={categories} month={month} categoryId={categories.some((c) => c.id === categoryId) ? categoryId : null} currentMonth={currentMonth} actions={{ add: addCartItemAction, update: updateCartItemAction, remove: deleteCartItemAction }} />
    </>
  );
}
