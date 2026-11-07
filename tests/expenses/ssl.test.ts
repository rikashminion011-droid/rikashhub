import { describe, expect, it } from "vitest";
import { resolveSsl } from "@/lib/db/ssl";

const remote = "postgresql://u:p@aws-0-example-region.pooler.supabase.com:5432/postgres";

describe("resolveSsl", () => {
  it("does not use TLS for a local database", () => {
    expect(resolveSsl({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" })).toBe(false);
    expect(resolveSsl({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db" })).toBe(false);
  });

  it("verifies against the operating system's CAs by default for a remote database", () => {
    expect(resolveSsl({ DATABASE_URL: remote })).toBe(true);
  });

  it("verifies against a supplied CA certificate (text, with escaped newlines)", () => {
    const result = resolveSsl({ DATABASE_URL: remote, DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----" });
    expect(result).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----" });
  });

  it("verifies against a CA certificate file", () => {
    const result = resolveSsl({ DATABASE_URL: remote, DATABASE_CA_CERT_FILE: "C:/certs/supabase.crt" }, (path) => `PEM from ${path}`);
    expect(result).toEqual({ rejectUnauthorized: true, ca: "PEM from C:/certs/supabase.crt" });
  });

  it("prefers a supplied CA over turning verification off", () => {
    const result = resolveSsl({ DATABASE_URL: remote, DATABASE_CA_CERT: "PEM", DATABASE_SSL_NO_VERIFY: "true" });
    expect(result).toEqual({ rejectUnauthorized: true, ca: "PEM" });
  });

  it("only skips verification when explicitly asked to", () => {
    expect(resolveSsl({ DATABASE_URL: remote, DATABASE_SSL_NO_VERIFY: "true" })).toEqual({ rejectUnauthorized: false });
    expect(resolveSsl({ DATABASE_URL: remote, DATABASE_SSL_NO_VERIFY: "yes" })).toBe(true);
  });

  it("copes with a missing or malformed URL", () => {
    expect(resolveSsl({})).toBe(true);
    expect(resolveSsl({ DATABASE_URL: "not a url" })).toBe(true);
  });
});
