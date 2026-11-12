import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersRound } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { changePasswordAction } from "@/features/users/actions";
import { AccountDetails } from "@/features/users/components/account-details";
import { ChangePasswordForm } from "@/features/users/components/change-password-form";
import { listPeople } from "@/features/users/server/service";
import type { PersonRow } from "@/features/users/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "User" };

export default async function UserPage() {
  const user = await requireUser();

  // The account and password parts do not need the database, so they still work if it is unreachable.
  let people: PersonRow[] | null = null;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    people = await listPeople(db, user.id);
  } catch (error) {
    console.error("[user] could not load people from the database", error);
  }

  return (
    <>
      <PageHeader title="User" description="Your account, your password, and the people you add expenses for." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <AccountDetails user={user} />
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Enter your current password, then choose a new one.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm changePassword={changePasswordAction} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
            <CardDescription>The people you split expenses with are managed in Customized Settings, next to banks, categories and Split settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{people ? `${people.length} ${people.length === 1 ? "person" : "people"} added.` : "Can't reach the database right now."}</p>
            <Link href="/quick-pay/settings?tab=users" className={cn(buttonVariants({ variant: "outline" }))}>
              <UsersRound /> Manage users
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
