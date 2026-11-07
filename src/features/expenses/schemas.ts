import { z } from "zod";
import { METHOD_KINDS } from "./types";

/** Shape checks at the server-action boundary. Business rules live in validation.ts. */

const id = z.uuid();
const optionName = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(60, "Use at most 60 characters.");

export const createExpenseSchema = z.object({
  requestId: id,
  amount: z.string().max(20),
  notes: z.string().max(1000),
  date: z.string().max(10),
  methodId: id.nullable(),
  accountId: id.nullable(),
  categoryId: id.nullable(),
  partyId: id.nullable(),
  split: z.object({
    enabled: z.boolean(),
    mode: z.enum(["EQUAL", "MANUAL"]),
    selected: z.array(z.object({ partyId: id, amount: z.string().max(20) })).max(50),
  }),
});

export const addMethodSchema = z.object({
  name: optionName,
  kind: z.enum(METHOD_KINDS.map((k) => k.value) as [string, ...string[]]),
});

export const addAccountSchema = z.object({ methodId: id, name: optionName });
export const addNamedSchema = z.object({ name: optionName });
export const archiveSchema = z.object({
  kind: z.enum(["method", "account", "party", "category"]),
  id,
});

export type CreateExpensePayload = z.infer<typeof createExpenseSchema>;
