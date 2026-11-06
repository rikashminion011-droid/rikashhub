import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Verified with Supabase on the server for every request to a protected page.
  const user = await requireUser();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
