/**
 * psql without credentials on the command line.
 *
 * The corpus scripts used to run `psql "postgres://user:password@host/db" …`:
 * the full URL was visible in the process list (/proc/<pid>/cmdline) and,
 * because execSync's error message starts with "Command failed: <command>",
 * ended up in the pipeline logs whenever a query failed. Here the URL is
 * turned into libpq environment variables for the child only, psql is called
 * without a shell, and every error text is masked before it is logged.
 */
import { execFileSync } from "node:child_process";

/** libpq environment for a postgres:// URL (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE). */
export function pgEnvFromUrl(url: string): Record<string, string> {
  const u = new URL(url);
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new Error("Keine postgres://-URL");
  }
  const env: Record<string, string> = {};
  if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname);
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const db = u.pathname.replace(/^\//, "");
  if (db) env.PGDATABASE = decodeURIComponent(db);
  const sslmode = u.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/** Masks passwords in connection URLs and PGPASSWORD assignments. */
export function maskDbSecrets(text: string): string {
  return text
    .replace(/(postgres(?:ql)?:\/\/[^:/@\s"']+:)[^@\s"']+@/gi, "$1***@")
    .replace(/(PGPASSWORD=)\S+/g, "$1***");
}

export interface PsqlResult {
  ok: boolean;
  out: string;
  /** Masked, first line only. */
  error?: string;
}

/** Runs `psql -q -t -A -f <file>` against `url` — credentials via env, never argv. */
export function runPsqlFile(
  file: string,
  url: string,
  exec: typeof execFileSync = execFileSync
): PsqlResult {
  try {
    const out = exec("psql", ["-q", "-t", "-A", "-f", file], {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...pgEnvFromUrl(url) },
    }) as unknown as string;
    return { ok: true, out: String(out).trim() };
  } catch (err) {
    const e = err as Error & { stderr?: unknown };
    const stderr = typeof e.stderr === "string" ? e.stderr : "";
    const first = (stderr.trim() || e.message || "psql fehlgeschlagen").split("\n")[0]!;
    return { ok: false, out: "", error: maskDbSecrets(first) };
  }
}
