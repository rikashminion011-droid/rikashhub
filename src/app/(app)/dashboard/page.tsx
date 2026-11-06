import type { Metadata } from "next";
import { ModuleStatus } from "@/components/shared/module-status";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name?.split(/\s+/)[0];

  return (
    <>
      <p className="mb-1 text-sm text-muted-foreground">
        {firstName ? `Welcome, ${firstName}` : "Welcome"}
      </p>
      <ModuleStatus href="/dashboard" />
    </>
  );
}
