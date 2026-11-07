import { readFileSync } from "node:fs";

/**
 * Environment variables read here (pass process.env):
 * - DATABASE_URL
 * - DATABASE_CA_CERT: PEM text of the CA that signed the database certificate ("\n" sequences accepted)
 * - DATABASE_CA_CERT_FILE: path to a PEM file with that CA (e.g. Supabase's downloaded CA certificate)
 * - DATABASE_SSL_NO_VERIFY: "true" turns certificate checking off (encrypted, not verified: development only)
 */
export type SslEnv = Readonly<Record<string, string | undefined>>;

export type SslConfig = false | true | { rejectUnauthorized: boolean; ca?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).hostname;
  } catch {
    return null;
  }
}

/**
 * How the app should connect to Postgres over TLS.
 * - local database: no TLS
 * - a CA is supplied: verify against it (what you want for Supabase)
 * - DATABASE_SSL_NO_VERIFY=true: encrypt without verifying (development only)
 * - otherwise: TLS verified against the operating system's trusted CAs
 */
export function resolveSsl(env: SslEnv, readFile: (path: string) => string = (p) => readFileSync(p, "utf8")): SslConfig {
  const host = hostOf(env.DATABASE_URL);
  if (host && LOCAL_HOSTS.has(host)) return false;

  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim() || (env.DATABASE_CA_CERT_FILE ? readFile(env.DATABASE_CA_CERT_FILE) : "");
  if (ca) return { rejectUnauthorized: true, ca };

  if (env.DATABASE_SSL_NO_VERIFY === "true") return { rejectUnauthorized: false };
  return true;
}
