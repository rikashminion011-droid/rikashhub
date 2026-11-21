import { AppShell } from "@/components/layout/app-shell";
import { ReturnToQuickEntry } from "@/components/layout/return-to-quick-entry";
import { getUpdateBalances, type BalanceRow } from "@/features/monthly-due/server/service";
import { UpdateBalance } from "@/features/monthly-due/components/update-balance";
import { setOpeningBalanceAction } from "@/features/quick-pay/actions";
import { resetNavLayoutAction, saveNavLayoutAction } from "@/features/navigation/actions";
import { DEFAULT_LAYOUT, type NavLayout } from "@/features/navigation/model";
import { getNavLayout } from "@/features/navigation/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Verified with Supabase on the server for every request to a protected page.
  const user = await requireUser();

  // How this user arranged the side navigator. If it cannot be read the built-in layout is used, so the app always opens.
  let navLayout: NavLayout = DEFAULT_LAYOUT;
  try {
    navLayout = await getNavLayout(getPrisma(), user.id);
  } catch (error) {
    console.error("[navigation] could not load the layout", error);
  }

  // The money in each bank and Cash, for the Update Balance button in the header. The app opens without it if it cannot be read.
  let balances: BalanceRow[] = [];
  try {
    balances = (await getUpdateBalances(getPrisma(), user.id)).rows;
  } catch (error) {
    console.error("[update-balance] could not load", error);
  }

  return (
    <AppShell user={{ name: user.name, email: user.email }} navLayout={navLayout} navActions={{ save: saveNavLayoutAction, reset: resetNavLayoutAction }} headerExtra={balances.length > 0 ? <UpdateBalance key={balances.map((r) => `${r.id}:${r.amountPaise}`).join(",")} rows={balances} setOpeningBalance={setOpeningBalanceAction} /> : null}>
      <ReturnToQuickEntry />
      {children}
    </AppShell>
  );
}
