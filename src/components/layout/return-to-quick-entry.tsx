"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "hub:lastActive";
/** How long the app must have been left alone before opening it again lands on Quick Entry. */
const AWAY_MS = 30 * 60 * 1000;
const PHONE = "(max-width: 767px)";

const read = () => {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};
const stamp = () => {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode: the app still works, it just cannot remember when you left */
  }
};

/**
 * On a phone: if the app is opened again after a long time (30 minutes or more) away, it opens on Quick Entry instead of the
 * page that was left open. Coming back after a short break leaves you where you were. Nothing signs you out.
 */
export function ReturnToQuickEntry() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const check = () => {
      const last = read();
      if (last && Date.now() - last >= AWAY_MS && window.matchMedia(PHONE).matches && pathname !== "/quick-pay") router.replace("/quick-pay");
      stamp();
    };
    check();
    const onVisibility = () => (document.visibilityState === "visible" ? check() : stamp());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stamp);
    // While the app is open the time keeps moving forward, so only a real absence counts as being away.
    const beat = window.setInterval(() => document.visibilityState === "visible" && stamp(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stamp);
      window.clearInterval(beat);
    };
    // The path is read once per mount; a later navigation by the user must not be undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
