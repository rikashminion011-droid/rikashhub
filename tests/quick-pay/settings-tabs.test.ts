import { describe, expect, it } from "vitest";
import { isSettingsPage, readSettingsTab } from "@/features/quick-pay/settings-tabs";

describe("settings sections", () => {
  it("reads a section, and sends the earlier names to the section that holds them now", () => {
    expect(readSettingsTab("switch")).toBe("switch");
    expect(readSettingsTab("users")).toBe("split");
    expect(readSettingsTab("fields")).toBe("general");
    expect(readSettingsTab("credits")).toBe("general");
    expect(readSettingsTab("nonsense")).toBe("categories");
    expect(readSettingsTab(undefined)).toBe("categories");
  });
  it("knows the four pages", () => {
    expect(["quick-entry", "gpay", "food", "dashboard"].every(isSettingsPage)).toBe(true);
    expect(isSettingsPage("other")).toBe(false);
  });
});
