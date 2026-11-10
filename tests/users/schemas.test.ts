import { describe, expect, it } from "vitest";
import { ACCOUNT_ITEM, NAV_ITEMS, findNavItem } from "@/config/navigation";
import { addPersonSchema, changePasswordSchema, renamePersonSchema } from "@/features/users/schemas";

const valid = { currentPassword: "old-password-1", newPassword: "brand-new-pass-2", confirmPassword: "brand-new-pass-2" };
const messages = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe("changePasswordSchema", () => {
  it("accepts a valid change", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("needs the current password", () => {
    expect(messages(changePasswordSchema.safeParse({ ...valid, currentPassword: "" }))).toContain("Enter your current password");
  });

  it.each([
    ["too short", "abc1", "Use at least 10 characters"],
    ["no number", "abcdefghijkl", "Include at least one number"],
    ["no letter", "1234567890123", "Include at least one letter"],
  ])("applies the sign-up rules: password %s", (_label, newPassword, message) => {
    expect(messages(changePasswordSchema.safeParse({ ...valid, newPassword, confirmPassword: newPassword }))).toContain(message);
  });

  it("requires the confirmation to match, reported on that field", () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirmPassword: "something-else-9" });
    expect(result.error?.issues[0]).toMatchObject({ message: "Passwords do not match", path: ["confirmPassword"] });
  });

  it("refuses to reuse the current password", () => {
    const same = { currentPassword: "old-password-1", newPassword: "old-password-1", confirmPassword: "old-password-1" };
    const result = changePasswordSchema.safeParse(same);
    expect(result.error?.issues[0]).toMatchObject({ message: "Choose a password different from your current one", path: ["newPassword"] });
  });
});

describe("person name schemas", () => {
  it("trims and accepts a normal name", () => {
    expect(addPersonSchema.parse({ name: "  Raju  " }).name).toBe("Raju");
  });

  it("rejects empty and over-long names", () => {
    expect(addPersonSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(addPersonSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });

  it("needs a real id to rename", () => {
    expect(renamePersonSchema.safeParse({ id: "not-a-uuid", name: "A" }).success).toBe(false);
    expect(renamePersonSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", name: "A" }).success).toBe(true);
  });
});

describe("sidebar navigation", () => {
  it("keeps the eight modules and puts User separately under Account", () => {
    expect(NAV_ITEMS).toHaveLength(8);
    expect(NAV_ITEMS.map((i) => i.href)).not.toContain("/user");
    expect(ACCOUNT_ITEM).toMatchObject({ title: "User", href: "/user" });
  });

  it("finds the User page for the top bar title", () => {
    expect(findNavItem("/user")?.title).toBe("User");
    expect(findNavItem("/quick-pay")?.title).toBe("Quick Entry");
    expect(findNavItem("/nope")).toBeUndefined();
  });
});
