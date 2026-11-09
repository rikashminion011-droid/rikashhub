import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addPersonAction,
  changePasswordAction,
  removePersonAction,
  renamePersonAction,
} from "@/features/users/actions";
import { AccountDetails } from "@/features/users/components/account-details";
import { ChangePasswordForm } from "@/features/users/components/change-password-form";
import { PeopleManager } from "@/features/users/components/people-manager";
import { listPeople } from "@/features/users/server/service";
import type { PersonRow } from "@/features/users/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

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

        {people ? (
          <PeopleManager
            initialPeople={people}
            actions={{ addPerson: addPersonAction, renamePerson: renamePersonAction, removePerson: removePersonAction }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
              <CardDescription>Can&apos;t reach the database right now, so this list is hidden.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Check <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> and reload. Your account and password
              settings on the left still work.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
