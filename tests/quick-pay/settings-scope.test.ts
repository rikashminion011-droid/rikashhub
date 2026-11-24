import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { getSettings, resetSettingsSection, saveSettingsSection } from "@/features/quick-pay/server/prefs";
import { DEFAULT_SETTINGS } from "@/features/quick-pay/settings-model";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "scope-me@example.com", name: "Me" };

let database: TestDatabase;
let db: TestDatabase["prisma"];

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
}, 180_000);
afterAll(async () => database?.close());

describe("settings for Transaction History", () => {
  it("follows Quick Entry until something is set for it", async () => {
    await saveSettingsSection(db, ME.id, "debt", { ...DEFAULT_SETTINGS.debt, hideSettled: true });
    expect((await getSettings(db, ME.id, "gpay")).debt.hideSettled).toBe(true);
  });

  it("keeps its own section without touching Quick Entry, and the other sections still follow", async () => {
    const own = { ...DEFAULT_SETTINGS.switch, bank: { ...DEFAULT_SETTINGS.switch.bank, enabled: false } };
    const saved = await saveSettingsSection(db, ME.id, "switch", own, "gpay");
    expect(saved.switch.bank.enabled).toBe(false);
    expect((await getSettings(db, ME.id)).switch.bank.enabled).toBe(true);
    // Quick Entry changes another section later: Transaction History sees it because it has not set that one.
    await saveSettingsSection(db, ME.id, "debt", { ...DEFAULT_SETTINGS.debt, hideSettled: false });
    expect((await getSettings(db, ME.id, "gpay")).debt.hideSettled).toBe(false);
    // And changing Quick Entry's switch does not undo Transaction History' own.
    await saveSettingsSection(db, ME.id, "switch", { ...DEFAULT_SETTINGS.switch, bank: { ...DEFAULT_SETTINGS.switch.bank, enabled: true, mode: "CUSTOM" as const } });
    expect((await getSettings(db, ME.id, "gpay")).switch.bank.enabled).toBe(false);
  });

  it("resets a section to the defaults for Transaction History only", async () => {
    const reset = await resetSettingsSection(db, ME.id, "switch", "gpay");
    expect(reset.switch.bank).toEqual(DEFAULT_SETTINGS.switch.bank);
    expect((await getSettings(db, ME.id)).switch.bank.mode).toBe("CUSTOM");
  });
});
