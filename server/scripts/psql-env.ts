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
import { execFileSync, spawnSync } from "node:child_process";

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

/** A failed psql call, message already masked. Readers whose result steers
 *  decisions throw this instead of treating a failure as "no rows". */
export class PsqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PsqlError";
  }
}

export interface PsqlQueryOptions {
  /** `-F <sep>` field separator for unaligned output. */
  fieldSeparator?: string;
  /** `-t -A` (tuples only, unaligned); default true. */
  tuplesOnly?: boolean;
  /** Output limit; default 1 GiB (full-corpus reads). */
  maxBuffer?: number;
}

/** Runs one SQL command (`psql -c`) against `url` — credentials via env, never argv, no shell. */
export function runPsqlQuery(
  sql: string,
  url: string,
  opts: PsqlQueryOptions = {},
  exec: typeof execFileSync = execFileSync
): PsqlResult {
  const args = ["-X", "-q", "-v", "ON_ERROR_STOP=1"];
  if (opts.tuplesOnly !== false) args.push("-t", "-A");
  if (opts.fieldSeparator !== undefined) args.push("-F", opts.fieldSeparator);
  args.push("-c", sql);
  try {
    const env = { ...process.env, ...pgEnvFromUrl(url) };
    const out = exec("psql", args, {
      encoding: "utf-8",
      maxBuffer: opts.maxBuffer ?? 1024 * 1024 * 1024,
      env,
    }) as unknown as string;
    return { ok: true, out: String(out).replace(/\n+$/, "") };
  } catch (err) {
    const e = err as Error & { stderr?: unknown };
    const stderr = typeof e.stderr === "string" ? e.stderr : "";
    const first = (stderr.trim() || e.message || "psql fehlgeschlagen").split("\n")[0]!;
    return { ok: false, out: "", error: maskDbSecrets(first) };
  }
}

/**
 * Like runPsqlQuery, but a failure throws a PsqlError (masked) — an empty
 * string then really means "no rows", never "the query failed".
 */
export function psqlQueryOrThrow(
  sql: string,
  url: string,
  opts: PsqlQueryOptions = {},
  exec: typeof execFileSync = execFileSync
): string {
  const r = runPsqlQuery(sql, url, opts, exec);
  if (!r.ok) throw new PsqlError(`psql fehlgeschlagen: ${r.error}`);
  return r.out;
}

/**
 * CLI for shell scripts: `bun server/scripts/psql-env.ts [psql args…]` runs
 * psql with the connection from $DATABASE_URL passed as libpq environment,
 * so the URL never appears on a command line. Exit code is psql's.
 */
export function runPsqlCli(argv: string[], env: NodeJS.ProcessEnv = process.env): number {
  const url = env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt");
    return 2;
  }
  let pgEnv: Record<string, string>;
  try {
    pgEnv = pgEnvFromUrl(url);
  } catch (e) {
    console.error(maskDbSecrets(e instanceof Error ? e.message : String(e)));
    return 2;
  }
  const { DATABASE_URL: _omit, ...rest } = env;
  const r = spawnSync("psql", argv, { stdio: "inherit", env: { ...rest, ...pgEnv } });
  if (r.error) {
    console.error(maskDbSecrets(r.error.message));
    return 1;
  }
  return r.status ?? 1;
}

if (import.meta.main) process.exit(runPsqlCli(process.argv.slice(2)));

/**
 * Rows of a `SELECT json_agg(t) FROM (…) t` read. json_agg over zero rows is
 * NULL (psql prints nothing) → []. A failed query or output that is not a
 * JSON array throws — "no rows" and "could not read" must not look alike.
 */
export function jsonAggRows<T>(r: PsqlResult): T[] {
  if (!r.ok) throw new PsqlError(`psql fehlgeschlagen: ${r.error}`);
  const raw = r.out.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PsqlError("psql lieferte kein JSON");
  }
  if (!Array.isArray(parsed)) throw new PsqlError("psql lieferte kein JSON-Array");
  return parsed as T[];
}
