"use client";

import { Loader2, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AddOptionDialog, ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/finance";
import type { UserActions } from "../actions";
import type { PersonRow } from "../types";

/**
 * The people you assign expenses to ("To" and Split in Quick Entry): add, rename, remove.
 * Removing hides a person from the choices; their past expenses keep the name.
 */
export function PeopleManager({
  initialPeople,
  actions,
}: {
  initialPeople: PersonRow[];
  actions: Pick<UserActions, "addPerson" | "renamePerson" | "removePerson">;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<PersonRow | null>(null);
  const [removing, setRemoving] = useState<PersonRow | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (adding) return;
    if (!name.trim()) {
      setAddError("Enter a name.");
      return;
    }
    setAdding(true);
    setAddError(null);
    let result: Awaited<ReturnType<UserActions["addPerson"]>>;
    try {
      result = await actions.addPerson({ name });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was added." };
    }
    setAdding(false);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setPeople(result.people);
    setName("");
    toast.success("User added. They now appear in Quick Entry.");
  }

  async function rename(newName: string): Promise<string | null> {
    if (!renaming) return null;
    const result = await actions.renamePerson({ id: renaming.id, name: newName });
    if (!result.ok) return result.error;
    setPeople(result.people);
    toast.success("Name updated.");
    return null;
  }

  async function remove(): Promise<string | null> {
    if (!removing) return null;
    const result = await actions.removePerson({ id: removing.id });
    if (!result.ok) return result.error;
    setPeople(result.people);
    toast.success(`${removing.name} removed.`);
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>
          The users you can choose in Quick Entry, under To and Split. Add, rename or remove them here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={add} noValidate method="post" className="space-y-1.5">
          <Label htmlFor="new-person">Add a user</Label>
          <div className="flex gap-2">
            <Input
              id="new-person"
              autoComplete="off"
              maxLength={60}
              placeholder="Name, for example Raju"
              value={name}
              aria-invalid={!!addError}
              aria-describedby={addError ? "new-person-error" : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setAddError(null);
              }}
            />
            <Button type="submit" disabled={adding} className="shrink-0">
              {adding ? <Loader2 className="animate-spin" /> : <Plus />}
              Add
            </Button>
          </div>
          {addError ? (
            <p id="new-person-error" role="alert" className="text-xs text-destructive">
              {addError}
            </p>
          ) : null}
        </form>

        {people.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
            <UsersRound className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No users yet</p>
            <p className="max-w-[16rem] text-xs text-muted-foreground">Add one above and it will show up in Quick Entry.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="People">
            {people.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                >
                  {person.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{person.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {person.expenseCount === 0
                      ? "No expenses yet"
                      : `${person.expenseCount} expense${person.expenseCount === 1 ? "" : "s"} · ${formatINR(person.totalPaise)}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Rename ${person.name}`} onClick={() => setRenaming(person)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${person.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setRemoving(person)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AddOptionDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title={`Rename ${renaming?.name ?? ""}`}
        description="Past expenses will show the new name too."
        initialValue={renaming?.name ?? ""}
        saveLabel="Save name"
        onSave={rename}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove "${removing?.name ?? ""}"?`}
        description="They disappear from Quick Entry. Expenses already saved keep their name and amounts."
        onConfirm={remove}
      />
    </Card>
  );
}
