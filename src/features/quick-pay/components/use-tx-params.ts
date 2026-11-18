"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** A comma-separated address value ("a,b,c") as a list. */
export const listOf = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

/**
 * The Transaction History address as a state: read a value, change some (an empty value removes it), and every change starts
 * again from the first page. The address is the one source of truth, so a filtered view can be shared or refreshed.
 */
export function useTxParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(changes: Record<string, string>, options: { keepPage?: boolean } = {}) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!options.keepPage) next.delete("page");
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return { params, go, pending, refresh: () => startTransition(() => router.refresh()) };
}
