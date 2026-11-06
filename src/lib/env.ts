import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or too short"),
});

/**
 * Public Supabase settings (safe for the browser). The values are read with literal
 * `process.env.NEXT_PUBLIC_*` references so Next.js can inline them into client bundles.
 */
export function getPublicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid environment: ${problems}. Copy .env.example to .env.local and fill it in.`);
  }
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}
