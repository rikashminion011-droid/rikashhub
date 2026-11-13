/** The pages Customized Settings can configure, and the sections of Quick Entry's settings. Kept out of the client component so server code (the page) can read them. */
export const SETTINGS_PAGES = [
  { id: "quick-entry", label: "Quick Entry" },
  { id: "gpay", label: "GPay Transactions" },
  { id: "food", label: "Monthly Food Tracking" },
  { id: "dashboard", label: "Dashboard" },
] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number]["id"];

export const SETTINGS_TABS = ["categories", "banks", "switch", "split", "debt", "food", "general"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const isSettingsTab = (value: unknown): value is SettingsTab => typeof value === "string" && (SETTINGS_TABS as readonly string[]).includes(value);
export const isSettingsPage = (value: unknown): value is SettingsPage => typeof value === "string" && SETTINGS_PAGES.some((p) => p.id === value);

/** Links from other places still use the earlier section names; they land on the section that now holds them. */
const LEGACY: Record<string, SettingsTab> = { users: "split", fields: "general", credits: "general" };

/** The section a `?tab=` value means, or the first section when it is missing or unknown. */
export function readSettingsTab(value: unknown): SettingsTab {
  if (isSettingsTab(value)) return value;
  return (typeof value === "string" ? LEGACY[value] : undefined) ?? "categories";
}
