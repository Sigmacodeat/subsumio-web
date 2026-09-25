/**
 * The engine image is built with server/ as context, from a release folder
 * that also holds the production .env and the firm import mirror under
 * deploy/netcup/. Neither may enter the build context. .dockerignore patterns
 * are anchored at the context root, so this test evaluates them with Docker's
 * matching rules (`**` spans directories, `*` stays inside one segment, a
 * later `!` pattern re-includes, an excluded parent excludes its children).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERVER = join(import.meta.dir, "..");

function toRegex(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function loadRules(file: string): Array<{ re: RegExp; negate: boolean }> {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const negate = l.startsWith("!");
      const p = (negate ? l.slice(1) : l).replace(/^\/+/, "").replace(/\/+$/, "");
      return { re: toRegex(p), negate };
    });
}

function excludedExact(rules: ReturnType<typeof loadRules>, path: string): boolean {
  let excluded = false;
  for (const r of rules) if (r.re.test(path)) excluded = !r.negate;
  return excluded;
}

/** True when Docker leaves `path` out of the build context. */
function isExcluded(rules: ReturnType<typeof loadRules>, path: string): boolean {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    if (excludedExact(rules, parts.slice(0, i).join("/"))) return true;
  }
  return false;
}

describe("server/.dockerignore keeps secrets and import data out of the engine image", () => {
  const rules = loadRules(join(SERVER, ".dockerignore"));

  test.each([
    ".env",
    ".env.local",
    "deploy/netcup/.env",
    "deploy/netcup/.env.production",
    "deploy/netcup/imports",
    "deploy/netcup/imports/advokat/akte-1/schriftsatz.pdf",
  ])("excludes %s", (path) => {
    expect(isExcluded(rules, path)).toBe(true);
  });

  test.each(["src/cli.ts", "Dockerfile", "deploy/netcup/docker-compose.yml", ".env.example"])(
    "keeps %s",
    (path) => {
      expect(isExcluded(rules, path)).toBe(false);
    }
  );
});

describe("deploy-code.sh", () => {
  const script = readFileSync(join(SERVER, "deploy/netcup/deploy-code.sh"), "utf8");
  const buildAt = script.indexOf("docker compose -p subsumio-engine build");

  test("copies the import mirror only after the images are built", () => {
    const copyAt = script.indexOf('cp -a "$APP/$H/imports"');
    expect(buildAt).toBeGreaterThan(-1);
    expect(copyAt).toBeGreaterThan(buildAt);
  });

  test("checks the built engine images before switching", () => {
    const checkAt = script.indexOf("check-image-secrets.sh");
    const switchAt = script.indexOf('echo "[deploy] umschalten');
    expect(checkAt).toBeGreaterThan(buildAt);
    expect(checkAt).toBeLessThan(switchAt);
  });
});
