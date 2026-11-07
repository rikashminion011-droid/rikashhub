/**
 * A real PostgreSQL in memory (PGlite) that the real Prisma client talks to over a local socket,
 * with the project's SQL migrations applied. Lets tests exercise the data layer end to end
 * without any external database.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations/", import.meta.url));

export interface TestDatabase {
  prisma: PrismaClient;
  /** Direct SQL access to the same database, for assertions. */
  pg: PGlite;
  close: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const pg = new PGlite();
  const folders = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const folder of folders) await pg.exec(await readFile(`${MIGRATIONS_DIR}${folder}/migration.sql`, "utf8"));

  const port = 54_000 + Math.floor(Math.random() * 5_000);
  const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
  await server.start();

  // PGlite serves one connection at a time, so the pool is limited to one.
  const adapter = new PrismaPg({
    connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
    ssl: false,
    max: 1,
  });
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    pg,
    close: async () => {
      await prisma.$disconnect();
      await server.stop();
      await pg.close();
    },
  };
}
