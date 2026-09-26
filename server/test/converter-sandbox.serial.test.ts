/**
 * External converters (LibreOffice, qpdf, readpst) parse untrusted uploads.
 * They must not inherit the engine's secrets and run under resource limits
 * when `prlimit` is available. Serial: mutates process.env (PATH + a fake
 * secret) for the end-to-end readpst check.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { converterEnv, limitedArgv } from "../src/core/converter-sandbox.ts";
import { extractDocumentText } from "../src/core/extract-document.ts";

const TMP = join(import.meta.dir, ".tmp-converter-sandbox-test");
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("converterEnv", () => {
  test("keeps only allowlisted variables and points HOME/TMPDIR at the work dir", () => {
    const env = converterEnv("/tmp/work-1", {
      PATH: "/usr/bin",
      LANG: "de_AT.UTF-8",
      DATABASE_URL: "postgres://user:pw@db/x",
      ANTHROPIC_API_KEY: "sk-test",
      CRON_SECRET: "c",
    });
    expect(env).toEqual({
      PATH: "/usr/bin",
      LANG: "de_AT.UTF-8",
      HOME: "/tmp/work-1",
      TMPDIR: "/tmp/work-1",
    });
  });

  test("falls back to a default PATH", () => {
    expect(converterEnv("/w", {}).PATH).toBe("/usr/local/bin:/usr/bin:/bin");
  });
});

describe("limitedArgv", () => {
  test("wraps the command in prlimit with CPU and file-size ceilings", () => {
    expect(
      limitedArgv(
        ["soffice", "--headless"],
        { cpuSeconds: 120, maxFileBytes: 1000 },
        "/usr/bin/prlimit"
      )
    ).toEqual(["/usr/bin/prlimit", "--cpu=120", "--fsize=1000", "--", "soffice", "--headless"]);
  });

  test("leaves the command unchanged when prlimit is not available", () => {
    expect(limitedArgv(["qpdf", "x"], { cpuSeconds: 1, maxFileBytes: 1 }, null)).toEqual([
      "qpdf",
      "x",
    ]);
  });
});

describe("converter processes do not see engine secrets", () => {
  test("readpst runs without the engine's environment", async () => {
    const binDir = join(TMP, "bin");
    mkdirSync(binDir, { recursive: true });
    const fake = join(binDir, "readpst");
    // The fake readpst writes its own environment into the extracted mail.
    writeFileSync(
      fake,
      `#!/bin/sh
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then shift; out="$1"; fi
  shift
done
mkdir -p "$out/Inbox"
{ printf 'From: a@example.invalid\\r\\nSubject: Env\\r\\nContent-Type: text/plain\\r\\n\\r\\n'; env; } > "$out/Inbox/1.eml"
`,
      { mode: 0o700 }
    );
    chmodSync(fake, 0o700);
    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    process.env.SANDBOX_TEST_SECRET = "must-not-leak-4711";
    try {
      const out = await extractDocumentText(Buffer.from("!BDN-test-pst"), ".pst", {
        filename: "mailbox.pst",
      });
      expect(out.text).toContain("HOME=");
      expect(out.text).not.toContain("must-not-leak-4711");
    } finally {
      process.env.PATH = previousPath;
      delete process.env.SANDBOX_TEST_SECRET;
    }
  });
});
