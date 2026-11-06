import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/features/auth/schemas";

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
    const parsed = loginSchema.parse({ email: "  Rikash@Example.COM ", password: "x", remember: false });
    expect(parsed.email).toBe("rikash@example.com");
    expect(parsed.remember).toBe(false);
  });

  it("carries the Remember me choice through", () => {
    expect(loginSchema.parse({ email: "a@b.co", password: "x", remember: true }).remember).toBe(true);
  });

  it("requires the Remember me flag to be a real boolean", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x", remember: "yes" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(false);
  });

  it("does not apply strength rules to an existing password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short", remember: false }).success).toBe(true);
  });

  it("rejects a bad email and an empty password", () => {
    expect(messages(loginSchema.safeParse({ email: "nope", password: "x", remember: false }))).toContain(
      "Enter a valid email address",
    );
    expect(messages(loginSchema.safeParse({ email: "a@b.co", password: "", remember: false }))).toContain(
      "Enter your password",
    );
  });

  it("rejects a password longer than the 72 character limit", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(73), remember: false }).success).toBe(false);
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

describe("forgotPasswordSchema", () => {
  it("accepts an email and normalises it", () => {
    expect(forgotPasswordSchema.parse({ email: " Me@Example.com " }).email).toBe("me@example.com");
  });

  it("rejects something that is not an email (usernames are not supported)", () => {
    expect(forgotPasswordSchema.safeParse({ email: "rikash" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a strong matching password", () => {
    expect(resetPasswordSchema.safeParse({ password: "new-secret-42", confirmPassword: "new-secret-42" }).success).toBe(true);
  });

  it("applies the same strength rules as sign-up", () => {
    expect(messages(resetPasswordSchema.safeParse({ password: "short1", confirmPassword: "short1" }))).toContain(
      "Use at least 10 characters",
    );
  });

  it("requires the two passwords to match", () => {
    const result = resetPasswordSchema.safeParse({ password: "new-secret-42", confirmPassword: "new-secret-43" });
    expect(result.error?.issues[0]).toMatchObject({ message: "Passwords do not match", path: ["confirmPassword"] });
  });
});
