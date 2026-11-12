import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Each database test file starts its own in-memory Postgres and applies every migration; give that time when many run at once.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
