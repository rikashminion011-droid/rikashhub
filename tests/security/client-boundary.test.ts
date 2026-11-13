import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Next.js turns everything exported from a "use client" file into a reference when server code imports it, so a constant or
 * function imported that way is not the real value (a list has no .includes, a function cannot be called). Components may be
 * rendered from the server; anything else must live in a plain module. This test finds the mistake before the browser does.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = walk(SRC);
const isClient = (file: string) => readFileSync(file, "utf8").slice(0, 300).trimStart().startsWith('"use client"');
const clientFiles = new Set(files.filter(isClient));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null;
  if (!base) return null;
  for (const ext of [".tsx", ".ts", `${sep}index.tsx`, `${sep}index.ts`]) if (clientFiles.has(base + ext)) return base + ext;
  return null;
}

describe("server code and client modules", () => {
  it("never imports a plain value from a use client file (only components, which render fine)", () => {
    const problems: string[] = [];
    for (const file of files) {
      if (clientFiles.has(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
        if (match[1]) continue; // import type
        const target = resolveImport(file, match[3]!);
        if (!target) continue;
        const values = match[2]!
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n && !n.startsWith("type "))
          // A component is PascalCase; constants (ALL_CAPS) and helpers (camelCase) are plain values.
          .filter((n) => !/^[A-Z][a-z]/.test(n));
        if (values.length > 0) problems.push(`${file.slice(ROOT.length + 1)} imports ${values.join(", ")} from ${target.slice(ROOT.length + 1)}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
