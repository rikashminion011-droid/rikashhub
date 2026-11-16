"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { DueActions } from "../actions";

/** Which person is "me". Everything recorded for them (food, shopping, credit portal, splits) is counted in My Due. */
export function PersonalPicker({ people, value, setPersonal }: { people: { id: string; name: string }[]; value: string | null; setPersonal: DueActions["setPersonal"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-1">
      <label htmlFor="personal" className="text-xs font-medium text-muted-foreground">
        My name in the recipient list
      </label>
      <select
        id="personal"
        value={value ?? ""}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          const r = await setPersonal({ partyId: e.target.value || null });
          setBusy(false);
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        }}
        className="h-10 min-w-48 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
      >
        <option value="">Not chosen</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
