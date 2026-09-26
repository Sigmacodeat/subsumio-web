import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PsqlError,
  jsonAggRows,
  maskDbSecrets,
  pgEnvFromUrl,
  psqlQueryOrThrow,
  runPsqlCli,
  runPsqlFile,
  runPsqlQuery,
} from "../scripts/psql-env.ts";

const URL_ = "postgres://subsumio:geheim%21pw@db:5432/subsumio?sslmode=disable";

describe("psql-env", () => {
  test("URL becomes libpq env, password decoded", () => {
    expect(pgEnvFromUrl(URL_)).toEqual({
      PGHOST: "db",
      PGPORT: "5432",
      PGUSER: "subsumio",
      PGPASSWORD: "geheim!pw",
      PGDATABASE: "subsumio",
      PGSSLMODE: "disable",
    });
  });

  test("psql gets no credentials on the command line", () => {
    let seenArgs: string[] = [];
    let seenEnv: Record<string, string | undefined> = {};
    const fake = ((_cmd: string, args: string[], opts: { env: Record<string, string> }) => {
      seenArgs = args;
      seenEnv = opts.env;
      return "ok\n";
    }) as never;
    const r = runPsqlFile("/tmp/q.sql", URL_, fake);
    expect(r).toEqual({ ok: true, out: "ok" });
    expect(seenArgs.join(" ")).not.toContain("geheim");
    expect(seenArgs.join(" ")).not.toContain("postgres://");
    expect(seenEnv.PGPASSWORD).toBe("geheim!pw");
  });

  test("a failing command never logs the password", () => {
    const fake = (() => {
      const e = new Error(
        "Command failed: psql postgres://u:geheim@h/db -q -t -A -f /tmp/x.sql\nmore"
      ) as Error & { stderr?: string };
      e.stderr = "";
      throw e;
    }) as never;
    const r = runPsqlFile("/tmp/q.sql", "postgres://u:geheim@h/db", fake);
    expect(r.ok).toBe(false);
    expect(r.error).not.toContain("geheim");
    expect(maskDbSecrets("PGPASSWORD=geheim psql postgres://u:geheim@h/db")).not.toContain(
      "geheim"
    );
  });
});

describe("psql-env queries", () => {
  function recorder(out = "a\x1fb\n") {
    const seen: { args: string[]; env: Record<string, string | undefined> } = { args: [], env: {} };
    const fake = ((_cmd: string, args: string[], opts: { env: Record<string, string> }) => {
      seen.args = args;
      seen.env = opts.env;
      return out;
    }) as never;
    return { seen, fake };
  }

  test("a query passes SQL and separator as arguments, credentials only via env", () => {
    const { seen, fake } = recorder();
    const out = psqlQueryOrThrow("select 1", URL_, { fieldSeparator: "\x1f" }, fake);
    expect(out).toBe("a\x1fb");
    expect(seen.args).toEqual([
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-F",
      "\x1f",
      "-c",
      "select 1",
    ]);
    expect(seen.args.join(" ")).not.toContain("geheim");
    expect(seen.args.join(" ")).not.toContain("postgres://");
    expect(seen.env.PGPASSWORD).toBe("geheim!pw");
  });

  test("a failed query throws a masked error instead of returning an empty result", () => {
    const fake = (() => {
      const e = new Error("Command failed: psql postgres://u:geheim@h/db") as Error & {
        stderr?: string;
      };
      e.stderr = 'psql: error: connection to "postgres://u:geheim@h/db" failed\n';
      throw e;
    }) as never;
    expect(runPsqlQuery("select 1", "postgres://u:geheim@h/db", {}, fake).ok).toBe(false);
    let thrown: unknown;
    try {
      psqlQueryOrThrow("select 1", "postgres://u:geheim@h/db", {}, fake);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PsqlError);
    expect(String((thrown as Error).message)).not.toContain("geheim");
    // An empty result is still a valid "no rows".
    expect(psqlQueryOrThrow("select 1", URL_, {}, recorder("").fake)).toBe("");
  });

  test("a missing or foreign database URL fails instead of using psql defaults", () => {
    expect(() => psqlQueryOrThrow("select 1", "", {}, recorder().fake)).toThrow(PsqlError);
    expect(() => psqlQueryOrThrow("select 1", "mysql://x@y/z", {}, recorder().fake)).toThrow(
      PsqlError
    );
  });

  test("json_agg reads tell 'no rows' apart from 'could not read'", () => {
    expect(jsonAggRows({ ok: true, out: "" })).toEqual([]);
    expect(jsonAggRows({ ok: true, out: '[{"a":1}]' })).toEqual([{ a: 1 }]);
    expect(() => jsonAggRows({ ok: false, out: "", error: "timeout" })).toThrow(PsqlError);
    expect(() => jsonAggRows({ ok: true, out: "2026-09-22 02:40:00+00" })).toThrow(PsqlError);
    expect(() => jsonAggRows({ ok: true, out: '{"a":1}' })).toThrow(PsqlError);
  });
});

describe("psql-env CLI for shell scripts", () => {
  test("runs psql with the connection from DATABASE_URL in env, not in argv", () => {
    const dir = mkdtempSync(join(tmpdir(), "psql-cli-"));
    const log = join(dir, "log");
    writeFileSync(
      join(dir, "psql"),
      `#!/bin/sh\necho "ARGS:$*" > "${log}"\necho "PGPASSWORD=$PGPASSWORD DATABASE_URL=$DATABASE_URL" >> "${log}"\nexit 3\n`
    );
    chmodSync(join(dir, "psql"), 0o755);
    const code = runPsqlCli(["-At", "-c", "select 1"], {
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      DATABASE_URL: URL_,
    });
    const out = readFileSync(log, "utf8");
    expect(code).toBe(3);
    expect(out).toContain("ARGS:-At -c select 1");
    expect(out).toContain("PGPASSWORD=geheim!pw");
    expect(out).toMatch(/DATABASE_URL=$/m);
    expect(out.split("\n")[0]).not.toContain("geheim");
    expect(runPsqlCli(["-c", "select 1"], { PATH: dir })).toBe(2);
  });
});

describe("server/scripts never put a database URL on the psql command line", () => {
  test("no psql call takes a URL argument", () => {
    const dir = join(import.meta.dir, "..", "scripts");
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!/\.(ts|sh)$/.test(f) || f === "psql-env.ts" || f.endsWith(".test.ts")) continue;
      const src = readFileSync(join(dir, f), "utf8");
      // `psql ${url}` in a Bun shell/exec template, or `psql "$DATABASE_URL"` in shell.
      if (/psql\s+"?\$\{?[A-Za-z_]*(url|URL|base|target)[A-Za-z_]*\}?"?/.test(src))
        offenders.push(f);
      if (/psql \$\{JSON\.stringify\(dbUrl\(\)\)\}/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
