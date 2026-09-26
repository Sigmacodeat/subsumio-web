/**
 * backup/run.sh with stubbed database and crypto tools:
 *   - a failing `psql \copy` inside a pipe fails the run (pipefail) and no
 *     success status is written;
 *   - without an offsite repo the local archive holds the original files and
 *     the status says offsite=false, files=local (the health check then
 *     refuses "ok").
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUN = join(import.meta.dir, "..", "deploy", "netcup", "backup", "run.sh");
let root = "";

function stub(dir: string, name: string, body: string) {
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
}

function setup(psqlFails: boolean) {
  const dir = mkdtempSync(join(root, "case-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // pg_dump: write the -f target.
  stub(
    bin,
    "pg_dump",
    `while [ $# -gt 0 ]; do [ "$1" = "-f" ] && { shift; echo dump > "$1"; }; shift; done`
  );
  // psql: \\copy prints CSV (or fails), count queries print 1.
  stub(
    bin,
    "psql",
    psqlFails
      ? `case "$*" in *copy*) echo "psql: connection lost" >&2; exit 2;; *) echo 1;; esac`
      : `case "$*" in *copy*) echo "id"; echo "1";; *) echo 1;; esac`
  );
  // openssl enc … -out FILE: store stdin as-is (encryption is not under test).
  stub(
    bin,
    "openssl",
    `out=""; while [ $# -gt 0 ]; do [ "$1" = "-out" ] && { shift; out="$1"; }; shift; done; cat > "$out"`
  );
  const files = join(dir, "data");
  mkdirSync(files);
  writeFileSync(join(files, "schriftsatz.pdf"), "PDF");
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    BACKUP_LOCAL_DIR: join(dir, "local"),
    BACKUP_LOCAL_PASSPHRASE: "test-passphrase",
    BACKUP_STATUS_FILE: join(dir, "status", "last-success"),
    BACKUP_FILES_DIR: files,
    RESTIC_REPOSITORY: "",
    HOME: dir,
  };
  return { dir, env };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "backup-run-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("backup/run.sh", () => {
  test("a failing database export inside a pipe fails the run, no success status", () => {
    const { env } = setup(true);
    const r = spawnSync("sh", [RUN], { env, encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(existsSync(env.BACKUP_STATUS_FILE)).toBe(false);
  });

  test("without offsite repo: local archive holds the files, status is honest", () => {
    const { env } = setup(false);
    const r = spawnSync("sh", [RUN], { env, encoding: "utf8" });
    expect(r.status).toBe(0);
    const status = JSON.parse(readFileSync(env.BACKUP_STATUS_FILE, "utf8"));
    expect(status).toMatchObject({ offsite: false, files: "local" });
    const [archive] = readdirSync(env.BACKUP_LOCAL_DIR);
    const listing = spawnSync("tar", ["-tzf", join(env.BACKUP_LOCAL_DIR, archive)], {
      encoding: "utf8",
    }).stdout;
    expect(listing).toMatch(/data\/schriftsatz\.pdf/);
    expect(listing).toMatch(/firm-.*\/pages\.csv\.gz/);
  });
});
