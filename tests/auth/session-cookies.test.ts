import { describe, expect, it } from "vitest";
import { applySessionPreference } from "@/lib/supabase/session-cookies";

const longLived = { path: "/", sameSite: "lax" as const, maxAge: 34_560_000, expires: new Date("2027-01-01") };

describe("applySessionPreference", () => {
  it("leaves cookies untouched when the user chose to be remembered", () => {
    expect(applySessionPreference("token", longLived, false)).toBe(longLived);
  });

  it("strips the expiry so the cookie ends with the browser session", () => {
    const result = applySessionPreference("token", longLived, true);
    expect(result).toEqual({ path: "/", sameSite: "lax" });
    expect("maxAge" in result).toBe(false);
    expect("expires" in result).toBe(false);
  });

  it("does not mutate the original options", () => {
    applySessionPreference("token", longLived, true);
    expect(longLived.maxAge).toBe(34_560_000);
  });

  it("never turns a deletion into a session cookie (sign-out must still clear it)", () => {
    const removal = { path: "/", maxAge: 0 };
    expect(applySessionPreference("", removal, true)).toBe(removal);
    expect(applySessionPreference("stale", { path: "/", maxAge: 0 }, true)).toEqual({ path: "/", maxAge: 0 });
    const emptyValue = { path: "/", maxAge: 400 };
    expect(applySessionPreference("", emptyValue, true)).toBe(emptyValue);
  });

  it("handles cookies with no lifetime at all", () => {
    const plain: { path: string; maxAge?: number } = { path: "/" };
    expect(applySessionPreference("token", plain, true)).toEqual({ path: "/" });
  });
});
