"use client";

import { FileClock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { localDraftCount } from "../bulk-draft";

/** "Draft": goes back to the Add Bulk sheet exactly where it was left. Shows how many rows are waiting in it. */
export function DraftLink({ savedCount = 0 }: { /** Rows waiting in the draft saved on the server. */ savedCount?: number }) {
  const [localCount, setLocal] = useState(0);
  const count = Math.max(savedCount, localCount);
  useEffect(() => {
    // The draft lives in this browser, so it can only be counted once the page is shown.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(localDraftCount());
    const onShow = () => setLocal(localDraftCount());
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  return (
    <Link href="/quick-pay/transactions/bulk" className={cn(buttonVariants({ variant: "outline" }))} aria-label={count > 0 ? `Draft, ${count} unsaved row${count === 1 ? "" : "s"}` : "Draft"}>
      <FileClock /> Draft
      {count > 0 ? <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white tabular-nums">{count}</span> : null}
    </Link>
  );
}
