import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { resolveSsl } from "./ssl";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

/**
 * One shared Prisma client per server process, in every environment.
 *
 * Creating a client opens a new connection pool, and every new connection costs several network
 * round trips (TCP, TLS, login) before the first query. Returning the same client for the life of
 * the process means a warm server reuses open connections instead of reconnecting on every request.
 * Keeping it on globalThis also survives hot reloads in development.
 *
 * The pool is small on purpose: this runs on short-lived serverless instances in front of
 * Supabase's connection pooler, so many instances each holding many connections would exhaust it.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  const adapter = new PrismaPg({
    connectionString,
    ssl: resolveSsl(process.env),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  globalForPrisma.__prisma = new PrismaClient({ adapter });
  return globalForPrisma.__prisma;
}
