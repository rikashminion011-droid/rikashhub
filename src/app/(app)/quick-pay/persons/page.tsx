import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { addPersonAction, removePersonAction, renamePersonAction } from "@/features/users/actions";
import { PeopleManager } from "@/features/users/components/people-manager";
import { listPeople } from "@/features/users/server/service";
import type { PersonRow } from "@/features/users/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Person Management" };

export default async function PersonsPage() {
  const user = await requireUser();

  let people: PersonRow[];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    people = await listPeople(db, user.id);
  } catch (error) {
    console.error("[quick-pay] could not load people", error);
    return (
      <>
        <PageHeader title="Person Management" />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Person Management"
        description="The people you can choose when you tick Split. Add, rename or remove them."
        actions={
          <Link href="/quick-pay" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <ArrowLeft className="size-3.5" /> Back to Quick Entry
          </Link>
        }
      />
      <div className="max-w-xl">
        <PeopleManager initialPeople={people} actions={{ addPerson: addPersonAction, renamePerson: renamePersonAction, removePerson: removePersonAction }} />
      </div>
    </>
  );
}
