import { z } from "zod";
import { DEFAULT_PERCENT_OPTIONS } from "./split";

/**
 * Everything Customized Settings keeps besides banks, categories and people: field labels and defaults,
 * Split settings, and Credits Added settings. One validated JSON document per user, with these defaults
 * filling in anything not set yet.
 */

export const FIELD_KEYS = ["amount", "reason", "category", "bank", "split", "creditsAdded"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const DEFAULT_LABELS: Record<FieldKey, string> = {
  amount: "Amount",
  reason: "Reason",
  category: "Category",
  bank: "Bank Through",
  split: "Split",
  creditsAdded: "Credits Added",
};

export const CREDIT_SOURCES = ["recent_credits", "recent_transactions", "credit_values", "last_transaction"] as const;
export type CreditSource = (typeof CREDIT_SOURCES)[number];

export const CREDIT_SOURCE_LABEL: Record<CreditSource, string> = {
  recent_credits: "Recent Credits",
  recent_transactions: "Recent Transactions",
  credit_values: "Credit Transaction Values",
  last_transaction: "Last Transaction",
};

export const CREDIT_SELECTIONS = ["none", "latest", "custom"] as const;
export type CreditSelection = (typeof CREDIT_SELECTIONS)[number];

const uuid = z.uuid();
const percent = z.number().gt(0).lte(100).multipleOf(0.01);

export const fieldsSchema = z.object({
  labels: z.object(Object.fromEntries(FIELD_KEYS.map((k) => [k, z.string().trim().min(1, "Enter a label.").max(30, "Use at most 30 characters.")])) as Record<FieldKey, z.ZodString>),
  defaults: z.object({
    /** Which of Debit or Credit is selected when Quick Entry opens. */
    type: z.enum(["DEBIT", "CREDIT"]),
    /** A bank selected when Quick Entry opens, or null to leave it empty. */
    bankId: uuid.nullable(),
    /** A category selected when Quick Entry opens, or null to leave it empty. */
    categoryId: uuid.nullable(),
  }),
});

export const splitSchema = z.object({
  /** Whether the Split box is ticked when Quick Entry opens. */
  enabledByDefault: z.boolean(),
  /** PERCENT: a person's share is a percentage of the amount. FIXED: you type the share as an amount. */
  method: z.enum(["PERCENT", "FIXED"]),
  defaultPercent: percent,
  /** The percentages offered in the Split dropdown (custom values can still be typed). */
  percentOptions: z.array(percent).min(1, "Add at least one percentage.").max(20, "At most 20 percentages."),
  defaultPartyId: uuid.nullable(),
  /** The share filled in for the FIXED method, in paise. 0 leaves it empty. */
  defaultFixedPaise: z.number().int().min(0).max(99_999_999_99),
});

export const creditsSchema = z.object({
  source: z.enum(CREDIT_SOURCES),
  /** How many rows to show. */
  listSize: z.number().int().min(1).max(50),
  defaultSelection: z.enum(CREDIT_SELECTIONS),
  /** For "custom": how many of the newest rows are selected automatically. */
  customCount: z.number().int().min(1).max(50),
});

export const settingsSchema = z.object({ fields: fieldsSchema, split: splitSchema, credits: creditsSchema });

export type FieldsSettings = z.infer<typeof fieldsSchema>;
export type SplitSettings = z.infer<typeof splitSchema>;
export type CreditsSettings = z.infer<typeof creditsSchema>;
export type QuickPaySettingsData = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof QuickPaySettingsData;

export const SECTION_SCHEMAS = { fields: fieldsSchema, split: splitSchema, credits: creditsSchema } as const;

export const DEFAULT_SETTINGS: QuickPaySettingsData = {
  fields: { labels: { ...DEFAULT_LABELS }, defaults: { type: "DEBIT", bankId: null, categoryId: null } },
  split: { enabledByDefault: false, method: "PERCENT", defaultPercent: 50, percentOptions: [...DEFAULT_PERCENT_OPTIONS], defaultPartyId: null, defaultFixedPaise: 0 },
  credits: { source: "recent_credits", listSize: 10, defaultSelection: "none", customCount: 1 },
};

/** Percentages sorted, without repeats. */
export const tidyPercents = (values: readonly number[]) => [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

/**
 * Reads saved settings. Each section is checked on its own; one that is missing or no longer valid is replaced by
 * its defaults, so a bad value can never stop Quick Entry from opening.
 */
export function parseSettings(stored: unknown): QuickPaySettingsData {
  const raw = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const read = <K extends SettingsSection>(key: K): QuickPaySettingsData[K] => {
    const parsed = SECTION_SCHEMAS[key].safeParse(raw[key]);
    return (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as QuickPaySettingsData[K];
  };
  return { fields: read("fields"), split: read("split"), credits: read("credits") };
}
