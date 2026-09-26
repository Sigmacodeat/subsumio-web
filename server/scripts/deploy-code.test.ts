/**
 * The two server-side blocks of server/deploy/netcup/deploy-code.sh, run for
 * real against a simulated /opt folder.
 *
 * Why: on 2026-09-20 two parallel deploys shared one upload path and one set
 * of folders and left /opt/subsumio with nothing but an empty server/ folder —
 * cron and backup restart-looped, the nightly deadline reminders stopped. The
 * guards below are what keeps that from happening again, so they are tested
 * rather than trusted: a run that finds a changed server must refuse to
 * switch, and an incomplete release must never be switched in.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";

/** These tests shell out (tar, sh); 5 s is not enough on a loaded machine. */
const SHELL_TIMEOUT = 30_000;
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(__dirname, "..", "deploy", "netcup", "deploy-code.sh");
const H = "server/deploy/netcup";

/** The heredoc blocks the script pipes into `ssh … sh -s`, in order. */
function remoteBlocks(): string[] {
  const src = readFileSync(SCRIPT, "utf8");
  const blocks: string[] = [];
  const re = /<<'REMOTE'\n([\s\S]*?)\nREMOTE\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) blocks.push(m[1]!);
  return blocks;
}

let root: string;
let app: string;

function makeRelease(dir: string, opts: { complete?: boolean } = {}) {
  mkdirSync(join(dir, H), { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}\n");
  writeFileSync(join(dir, H, "docker-compose.yml"), "services: {}\n");
  if (opts.complete !== false) {
    writeFileSync(join(dir, H, "crontab"), "0 6 * * * true\n");
    writeFileSync(join(dir, H, "cronjob.sh"), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  }
}

/** A release archive as `git archive` would produce it. */
function makeTar(opts: { complete?: boolean } = {}): string {
  const stage = join(root, "stage");
  rmSync(stage, { recursive: true, force: true });
  makeRelease(stage, opts);
  const tar = join(root, "release.tar.gz");
  execFileSync("tar", ["-czf", tar, "-C", stage, "."]);
  return tar;
}

function runBlock(
  block: string,
  env: Record<string, string>
): { code: number; stdout: string; stderr: string } {
  const res = spawnSync("sh", ["-s"], {
    input: block,
    env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, ...env },
    encoding: "utf8",
  });
  return { code: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "deploy-test-"));
  app = join(root, "opt", "subsumio");
  // A fake docker so the switch block's compose calls do nothing here.
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(join(root, "bin", "docker"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  makeRelease(app);
  writeFileSync(join(app, H, ".env"), "SECRET=1\n", { mode: 0o600 });
  writeFileSync(join(app, "DEPLOYED_COMMIT"), "aaaaaaaaaa\n");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("deploy-code.sh — preparing the new release", () => {
  const prepare = () => remoteBlocks()[0]!;

  it(
    "carries over the secrets, stamps the commit and remembers what it replaces",
    () => {
      const tar = makeTar();
      const res = runBlock(prepare(), { APP: app, H, SHA: "bbbbbbbbbb", TAR: tar });
      expect(res.stderr).toBe("");
      expect(res.code).toBe(0);
      expect(readFileSync(`${app}-new/DEPLOYED_COMMIT`, "utf8").trim()).toBe("bbbbbbbbbb");
      expect(readFileSync(`${app}-new/${H}/.env`, "utf8")).toBe("SECRET=1\n");
      expect(readFileSync(`${app}-new/PREVIOUS_COMMIT`, "utf8").trim()).toBe("aaaaaaaaaa");
      // The upload is removed, so a later run cannot unpack a stale archive.
      expect(existsSync(tar)).toBe(false);
    },
    SHELL_TIMEOUT
  );

  it(
    "stops when the release folder is gone instead of building on nothing",
    () => {
      rmSync(app, { recursive: true, force: true });
      const res = runBlock(prepare(), { APP: app, H, SHA: "bbbbbbbbbb", TAR: makeTar() });
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain("fehlt");
      expect(existsSync(`${app}-new`)).toBe(false);
    },
    SHELL_TIMEOUT
  );

  it(
    "stops when the server has no .env to carry over",
    () => {
      rmSync(join(app, H, ".env"));
      const res = runBlock(prepare(), { APP: app, H, SHA: "bbbbbbbbbb", TAR: makeTar() });
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain(".env");
    },
    SHELL_TIMEOUT
  );

  it(
    "refuses an incomplete release",
    () => {
      const res = runBlock(prepare(), {
        APP: app,
        H,
        SHA: "bbbbbbbbbb",
        TAR: makeTar({ complete: false }),
      });
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain("Unvollständige Version");
    },
    SHELL_TIMEOUT
  );
});

describe("deploy-code.sh — switching releases", () => {
  const blocks = () => remoteBlocks();
  const prepare = () => blocks()[0]!;
  // The switch is the last remote block; checks run in the blocks before it.
  const swap = () => blocks().at(-1)!;

  function prepared(sha = "bbbbbbbbbb") {
    const res = runBlock(prepare(), { APP: app, H, SHA: sha, TAR: makeTar() });
    expect(res.code).toBe(0);
  }

  it(
    "switches when the server is still the one it prepared against",
    () => {
      prepared();
      const res = runBlock(swap(), { APP: app, H, APP_SERVICES: "web engine" });
      expect(res.code).toBe(0);
      expect(readFileSync(join(app, "DEPLOYED_COMMIT"), "utf8").trim()).toBe("bbbbbbbbbb");
      expect(readFileSync(join(`${app}-prev`, "DEPLOYED_COMMIT"), "utf8").trim()).toBe(
        "aaaaaaaaaa"
      );
      expect(existsSync(`${app}-new`)).toBe(false);
      // The marker is internal — it must not survive into the live release.
      expect(existsSync(join(app, "PREVIOUS_COMMIT"))).toBe(false);
    },
    SHELL_TIMEOUT
  );

  it(
    "refuses when someone else switched in the meantime, and moves nothing",
    () => {
      prepared();
      writeFileSync(join(app, "DEPLOYED_COMMIT"), "cccccccccc\n"); // another deploy landed
      const res = runBlock(swap(), { APP: app, H, APP_SERVICES: "web engine" });
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain("während des Baus verändert");
      expect(readFileSync(join(app, "DEPLOYED_COMMIT"), "utf8").trim()).toBe("cccccccccc");
      expect(existsSync(`${app}-new`)).toBe(true);
      expect(existsSync(`${app}-prev`)).toBe(false);
    },
    SHELL_TIMEOUT
  );

  it(
    "refuses when the release folder disappeared, instead of emptying it further",
    () => {
      prepared();
      rmSync(app, { recursive: true, force: true });
      const res = runBlock(swap(), { APP: app, H, APP_SERVICES: "web engine" });
      expect(res.code).not.toBe(0);
      expect(existsSync(`${app}-new`)).toBe(true);
    },
    SHELL_TIMEOUT
  );
});

describe("deploy-code.sh — engine data volume handover", () => {
  // The chown command travels through three shells (local double quotes →
  // ssh → `sh -c` inside the container). Unescaped parentheses reached the
  // container shell as syntax and stopped a deploy (2026-09-26).
  it(
    "the find expression reaches the container shell intact",
    () => {
      const line = readFileSync(SCRIPT, "utf8")
        .split("\n")
        .find((l) => l.includes("find /data") && l.includes("chown"));
      expect(line).toBeTruthy();
      const bin = mkdtempSync(join(tmpdir(), "deploy-quoting-"));
      try {
        const log = join(bin, "find.args");
        // ssh HOST "cmd": run cmd in a shell, as the server would (no real cd).
        writeFileSync(join(bin, "ssh"), '#!/bin/sh\nshift\nexec sh -c "cd() { :; }; $1"\n', {
          mode: 0o755,
        });
        // docker … -c 'payload': run the payload with sh, as the container would.
        writeFileSync(
          join(bin, "docker"),
          '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "-c" ] && { shift; exec sh -c "$1"; }; shift; done\n',
          { mode: 0o755 }
        );
        writeFileSync(join(bin, "find"), `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`, {
          mode: 0o755,
        });
        const cmd = line!.trim().replace(/\s*\|\|\s*\{\s*$/, "");
        const res = spawnSync("sh", ["-c", cmd], {
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOST: "h", APP: "/x", H },
          encoding: "utf8",
        });
        expect(res.stderr).toBe("");
        expect(res.status).toBe(0);
        const args = readFileSync(log, "utf8").trim().split("\n");
        expect(args.slice(0, 4)).toEqual(["/data", "(", "!", "-user"]);
        expect(args).toContain(")");
      } finally {
        rmSync(bin, { recursive: true, force: true });
      }
    },
    SHELL_TIMEOUT
  );
});
