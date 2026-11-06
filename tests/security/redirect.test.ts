import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/security/redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths, including the query string", () => {
    expect(safeNextPath("/savings")).toBe("/savings");
    expect(safeNextPath("/monthly-due?view=calendar")).toBe("/monthly-due?view=calendar");
  });

  it("falls back when empty", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath(null, "/x")).toBe("/x");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "evil.example/path",
    "http://localhost:3000/dashboard",
  ])("rejects an off-site redirect: %s", (value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });

  it("never redirects back to the sign-in pages (avoids loops)", () => {
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath("/signup?x=1")).toBe("/dashboard");
  });
});
