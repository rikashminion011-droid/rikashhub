"use client";

import { useSearchParams } from "next/navigation";
import { loginNotice } from "../notices";

/**
 * The "that link has expired" banner. It reads the address in the browser, so the login page itself
 * does not depend on the request and can be built once and served from the cache. Render it inside
 * <Suspense>: the cached page simply has no banner until the browser fills it in.
 */
export function LoginNotice() {
  const notice = loginNotice(useSearchParams().get("error"));
  if (!notice) return null;
  return (
    <p role="status" className="rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm text-neutral-700">
      {notice}
    </p>
  );
}
