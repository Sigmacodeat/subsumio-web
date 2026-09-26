import { describe, expect, test } from "bun:test";
import { maskDbSecrets, pgEnvFromUrl, runPsqlFile } from "../scripts/psql-env.ts";

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
