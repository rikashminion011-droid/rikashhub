import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws when imported outside a React Server Component build; stub it for unit tests.
vi.mock("server-only", () => ({}));

import { getPrisma } from "@/lib/db/prisma";

const globals = globalThis as unknown as { __prisma?: unknown };

describe("getPrisma", () => {
  beforeEach(() => {
    delete globals.__prisma;
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/app");
  });

  afterEach(() => {
    delete globals.__prisma;
    vi.unstubAllEnvs();
  });

  it("returns the same client every time in production, so connections are reused", () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = getPrisma();
    expect(getPrisma()).toBe(first);
    expect(getPrisma()).toBe(first);
  });

  it("returns the same client in development too", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getPrisma()).toBe(getPrisma());
  });

  it("explains what is missing when DATABASE_URL is not set", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getPrisma()).toThrow("DATABASE_URL is not set");
  });
});
