import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: [".env.local", ".env"], quiet: true });

// Migrations need the direct (non-pooled) connection. The placeholder only lets
// `prisma validate` / `prisma generate` run on a machine with no database configured;
// `prisma migrate` will fail loudly with a connection error if DIRECT_URL is missing.
const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
