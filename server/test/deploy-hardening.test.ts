/**
 * Static guards for the production stack (server/deploy/netcup). They read
 * the committed compose file, Dockerfile and deploy script — no Docker needed.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";

const SERVER = join(import.meta.dir, "..");
const NETCUP = join(SERVER, "deploy", "netcup");

type Service = Record<string, unknown> & {
  networks?: string[] | Record<string, unknown>;
};
const compose = yaml.load(readFileSync(join(NETCUP, "docker-compose.yml"), "utf8")) as {
  services: Record<string, Service>;
  networks?: Record<string, { external?: boolean; name?: string }>;
};
const deployScript = readFileSync(join(NETCUP, "deploy-code.sh"), "utf8");

function networksOf(svc: Service): string[] {
  if (!svc.networks) return ["default"];
  return Array.isArray(svc.networks) ? svc.networks : Object.keys(svc.networks);
}

describe("edge network: web and engine are reachable only via the proxy", () => {
  test("no service joins the shared foreign network", () => {
    for (const [name, svc] of Object.entries(compose.services)) {
      expect({ name, nets: networksOf(svc) }).toEqual({
        name,
        nets: expect.not.arrayContaining(["hetzner_default"]),
      });
    }
    expect(Object.keys(compose.networks ?? {})).not.toContain("hetzner_default");
  });

  test("web and engine share only the stack network and subsumio-edge", () => {
    for (const name of ["web", "engine"]) {
      expect(networksOf(compose.services[name]).sort()).toEqual(["default", "subsumio-edge"]);
    }
    expect(compose.networks?.["subsumio-edge"]).toEqual({ external: true, name: "subsumio-edge" });
  });

  test("the legacy proxy service never starts without an explicit profile", () => {
    expect(compose.services.caddy.profiles).toEqual(["standalone-proxy"]);
  });

  test("the reference proxy config overwrites X-Real-IP for the web app", () => {
    const caddyfile = readFileSync(join(NETCUP, "Caddyfile"), "utf8");
    expect(caddyfile).toContain("header_up X-Real-IP {remote_host}");
  });

  test("deploy attaches the proxy to the edge network and refuses a proxy without the X-Real-IP rule", () => {
    expect(deployScript).toContain("docker network create subsumio-edge");
    expect(deployScript).toContain("docker network connect subsumio-edge");
    expect(deployScript).toMatch(/grep -q 'X-Real-IP \{remote_host\}'/);
    // The check sits before the switch, so a drifted proxy stops the deploy.
    expect(deployScript.indexOf("X-Real-IP {remote_host}")).toBeLessThan(
      deployScript.indexOf('echo "[deploy] umschalten')
    );
  });
});

describe("stack hygiene: logs, limits, no install at start", () => {
  test("every service has rotated logs", () => {
    for (const [name, svc] of Object.entries(compose.services)) {
      expect({ name, logging: Boolean(svc.logging) }).toEqual({ name, logging: true });
    }
  });

  test("cron and backup use prebuilt images and install nothing at start", () => {
    const raw = readFileSync(join(NETCUP, "docker-compose.yml"), "utf8");
    expect(raw).not.toMatch(/apk add/);
    for (const name of ["cron", "backup"]) {
      const svc = compose.services[name];
      expect(svc.build).toBeTruthy();
      expect(svc.entrypoint).toBeUndefined();
      const df = readFileSync(join(NETCUP, "images", name, "Dockerfile"), "utf8");
      expect(df).toMatch(/^FROM alpine:[\d.]+@sha256:[0-9a-f]{64}$/m);
      expect(df).toContain("supercronic");
    }
    // deploy builds them in every mode, so --no-build never meets a missing image
    for (const m of deployScript.matchAll(/BUILD="([^"]*)"/g)) {
      expect(m[1].split(" ")).toEqual(expect.arrayContaining(["cron", "backup"]));
    }
  });

  test("application services forbid privilege gain and have memory ceilings", () => {
    for (const name of ["engine", "web", "cron", "backup", "clamav", "corpus-pipeline"]) {
      expect({ name, opt: compose.services[name].security_opt }).toEqual({
        name,
        opt: expect.arrayContaining(["no-new-privileges:true"]),
      });
    }
    for (const name of ["engine", "web", "cron", "clamav", "corpus-pipeline"]) {
      expect({ name, mem: Boolean(compose.services[name].mem_limit) }).toEqual({ name, mem: true });
    }
  });
});

describe("scripts/deploy.sh only deploys reviewed, pushed main", () => {
  const script = join(SERVER, "..", "scripts", "deploy.sh");
  const src = readFileSync(script, "utf8");

  test("it never stages, commits or pushes", () => {
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/git\s+(add|commit|push)\b/);
    expect(code).toContain("git status --porcelain");
    expect(code).toMatch(/rev-parse HEAD\)" != "\$\(git rev-parse origin\/main\)/);
  });

  test("a dirty working tree stops it before anything else", () => {
    const repo = mkdtempSync(join(tmpdir(), "deploy-sh-"));
    try {
      const git = (...args: string[]) =>
        spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
      git("init", "-q");
      git(
        "-c",
        "user.email=t@example.invalid",
        "-c",
        "user.name=t",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "init"
      );
      mkdirSync(join(repo, "scripts"));
      copyFileSync(script, join(repo, "scripts", "deploy.sh"));
      writeFileSync(join(repo, "half-done.txt"), "wip");
      const res = spawnSync("bash", ["scripts/deploy.sh"], { cwd: repo, encoding: "utf8" });
      expect(res.status).toBe(1);
      expect(res.stdout + res.stderr).toContain("nicht sauber");
      // Nothing was committed.
      expect(git("rev-list", "--count", "HEAD").stdout.trim()).toBe("1");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("restore verification leaves a result for the operator console", () => {
  const verify = readFileSync(join(NETCUP, "backup", "verify.sh"), "utf8");
  test("success and every failure path record the outcome next to the backup status", () => {
    expect(verify).toContain('"$(dirname "$BACKUP_STATUS_FILE")/last-verify"');
    expect(verify).toMatch(/trap '[^']*write_verify_status false/);
    expect(verify).toMatch(/write_verify_status true/);
    expect(verify).toMatch(/write_verify_status false ",\\"pages\\":0"/);
  });
});

const dockerfile = readFileSync(join(SERVER, "Dockerfile"), "utf8");
const webDockerfile = readFileSync(join(SERVER, "..", "Dockerfile.web"), "utf8");

describe("engine image: unprivileged and reproducible", () => {
  test("the final user is a non-root engine user", () => {
    const users = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
    expect(users.length).toBeGreaterThan(0);
    const last = users[users.length - 1];
    expect(["root", "0", "0:0"]).not.toContain(last);
    expect(dockerfile).toMatch(/useradd[^\n]*--uid 10001/);
    // Nothing after USER runs as root again.
    const afterUser = dockerfile.slice(dockerfile.lastIndexOf(`USER ${last}`));
    expect(afterUser).not.toMatch(/^RUN\s/m);
  });

  test("base image is pinned to the same Bun as the web image", () => {
    const engineFrom = dockerfile.match(/^FROM\s+(\S+)/m)?.[1];
    const webFrom = webDockerfile.match(/^FROM\s+(oven\/bun:\S+)/m)?.[1];
    expect(engineFrom).toMatch(/^oven\/bun:\d+\.\d+\.\d+$/);
    expect(engineFrom).toBe(webFrom);
  });

  test("dependency install has no lockfile-ignoring fallback", () => {
    expect(dockerfile).toContain("bun install --frozen-lockfile --production");
    expect(dockerfile).not.toMatch(/\|\|\s*bun install/);
    expect(webDockerfile).not.toMatch(/\|\|\s*bun install/);
  });
});

describe("engine and pipeline services are confined", () => {
  test("engine: no capabilities, no privilege gain, bounded resources", () => {
    const e = compose.services.engine;
    expect(e.security_opt).toContain("no-new-privileges:true");
    expect(e.cap_drop).toEqual(["ALL"]);
    expect(e.mem_limit).toBeTruthy();
    expect(e.cpus).toBeTruthy();
    expect(e.pids_limit).toBeTruthy();
    expect(e.user).toBeUndefined(); // image default: uid 10001
  });

  test("pipeline: explicit user, no privilege gain, bounded resources", () => {
    const p = compose.services["corpus-pipeline"];
    expect(p.user).toBe("0:0");
    expect(p.security_opt).toContain("no-new-privileges:true");
    expect(p.mem_limit).toBeTruthy();
  });

  test("deploy hands the data volume to uid 10001 and proves write access before switching", () => {
    const sw = deployScript.indexOf('echo "[deploy] umschalten');
    const chown = deployScript.indexOf("chown -h 10001:10001");
    const probe = deployScript.indexOf("touch /data/.write-check");
    expect(chown).toBeGreaterThan(0);
    expect(probe).toBeGreaterThan(chown);
    expect(probe).toBeLessThan(sw);
  });
});
