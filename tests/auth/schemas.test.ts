import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "@/features/auth/schemas";

const validSignup = {
  fullName: "Rikash Kumar",
  email: "rikash@example.com",
  password: "correct-horse-9",
  confirmPassword: "correct-horse-9",
};

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe("loginSchema", () => {
  it("accepts a valid login and normalises the email", () => {
    const parsed = loginSchema.parse({ email: "  Rikash@Example.COM ", password: "x" });
    expect(parsed.email).toBe("rikash@example.com");
  });

  it("does not apply strength rules to an existing password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
  });

  it("rejects a bad email and an empty password", () => {
    expect(messages(loginSchema.safeParse({ email: "nope", password: "x" }))).toContain("Enter a valid email address");
    expect(messages(loginSchema.safeParse({ email: "a@b.co", password: "" }))).toContain("Enter your password");
  });

  it("rejects a password longer than the 72 character limit", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("accepts valid details", () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it("trims the name", () => {
    expect(signupSchema.parse({ ...validSignup, fullName: "  Rikash  " }).fullName).toBe("Rikash");
  });

  it("requires a real name", () => {
    expect(signupSchema.safeParse({ ...validSignup, fullName: " a " }).success).toBe(false);
  });

  it.each([
    ["too short", "abc1", "Use at least 10 characters"],
    ["no number", "abcdefghijkl", "Include at least one number"],
    ["no letter", "1234567890123", "Include at least one letter"],
    ["too long", "a1".repeat(40), "Use at most 72 characters"],
  ])("rejects a password that is %s", (_label, password, message) => {
    const result = signupSchema.safeParse({ ...validSignup, password, confirmPassword: password });
    expect(messages(result)).toContain(message);
  });

  it("requires both passwords to match, reported on the confirm field", () => {
    const result = signupSchema.safeParse({ ...validSignup, confirmPassword: "different-pass-1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ message: "Passwords do not match", path: ["confirmPassword"] });
  });
});
