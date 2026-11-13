import { AppShell } from "@/components/layout/app-shell";
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

  return (
    <AppShell user={{ name: user.name, email: user.email }} navLayout={navLayout} navActions={{ save: saveNavLayoutAction, reset: resetNavLayoutAction }}>
      {children}
    </AppShell>
  );
}
