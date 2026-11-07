import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { resolveSsl } from "./ssl";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

/** One shared Prisma client per server process (reused across hot reloads in development). */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  const adapter = new PrismaPg({ connectionString, ssl: resolveSsl(process.env), max: 5 });
  const client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = client;
  return client;
}
