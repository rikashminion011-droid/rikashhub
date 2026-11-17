import { describe, expect, it } from "vitest";
import { loginNotice } from "@/features/auth/notices";

describe("loginNotice", () => {
  it("explains the email-link errors", () => {
    expect(loginNotice("confirm")).toContain("confirmation link");
    expect(loginNotice("expired")).toContain("expired");
  });

  it("shows nothing when there is no error code", () => {
    expect(loginNotice(null)).toBeUndefined();
    expect(loginNotice(undefined)).toBeUndefined();
    expect(loginNotice("")).toBeUndefined();
  });

  it("shows nothing for an unknown code", () => {
    expect(loginNotice("something-else")).toBeUndefined();
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"])(
    "never returns a built-in object property for ?error=%s",
    (code) => {
      expect(loginNotice(code)).toBeUndefined();
    },
  );
});
