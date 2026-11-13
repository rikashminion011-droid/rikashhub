/** The sections of Customized Settings. Kept out of the client component so server code (the page) can read the list. */
export const SETTINGS_TABS = ["users", "banks", "categories", "fields", "split", "credits"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const isSettingsTab = (value: unknown): value is SettingsTab => typeof value === "string" && (SETTINGS_TABS as readonly string[]).includes(value);
