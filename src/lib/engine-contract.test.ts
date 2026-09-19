// @vitest-environment node
/**
 * Web ↔ engine contract: every `${ENGINE_URL}/api/...` path the web app calls
 * must be registered in the engine (server/src/commands/web-api.ts or
 * serve-http.ts). Features that call an unregistered path fail silently in
 * production (404 → empty result / placeholder) — this pins the contract.
 *
 * KNOWN_MISSING lists accepted gaps (empty since the 2026-09-19 audit fixes).
 * Never add an entry without a ticket.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

const KNOWN_MISSING = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "_archive" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function engineRoutes(): string[] {
  const src =
    readFileSync(join(ROOT, "server/src/commands/web-api.ts"), "utf8") +
    readFileSync(join(ROOT, "server/src/commands/serve-http.ts"), "utf8");
  const routes: string[] = [];
  for (const m of src.matchAll(
    /app\.(?:get|post|put|patch|delete|all|use)\(\s*"(\/api\/[^"]+)"/g
  )) {
    routes.push(m[1]!);
  }
  return routes;
}

function routeMatches(route: string, called: string, isPrefix: boolean): boolean {
  const r = route.split("/");
  const c = called.split("/").filter((seg, i, a) => !(i === a.length - 1 && seg === ""));
  // Express 5 catch-all (`/api/pages/{*slug}`) matches any continuation.
  const catchAll = r.findIndex((seg) => seg.startsWith("{*"));
  if (catchAll >= 0) {
    const head = r.slice(0, catchAll);
    return (
      c.length >= head.length + (isPrefix ? 0 : 1) &&
      head.every((seg, i) => seg === c[i] || seg.startsWith(":"))
    );
  }
  if (isPrefix) {
    // `${ENGINE_URL}/api/pages/${slug}` — the called path is a prefix; any
    // route that continues with a parameter / wildcard matches.
    if (r.length <= c.length) return false;
  } else if (r.length !== c.length && !route.endsWith("*")) {
    return false;
  }
  return c.every((seg, i) => {
    const rs = r[i];
    if (rs === undefined) return false;
    return rs === seg || rs.startsWith(":") || rs === "*";
  });
}

function calledPaths(): Map<string, { prefix: boolean; files: Set<string> }> {
  const out = new Map<string, { prefix: boolean; files: Set<string> }>();
  for (const file of walk(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/ENGINE_URL\}(\/api\/[^`"'?\s)]*)/g)) {
      const raw = m[1]!;
      const templ = raw.indexOf("${");
      const path = (templ >= 0 ? raw.slice(0, templ) : raw).replace(/\/+$/, "");
      const prefix = templ >= 0 && raw.slice(0, templ).endsWith("/");
      if (!path || path === "/api") continue;
      const key = `${path}${prefix ? "/*" : ""}`;
      const entry = out.get(key) ?? { prefix, files: new Set<string>() };
      entry.files.add(file.slice(ROOT.length + 1));
      out.set(key, entry);
    }
  }
  return out;
}

describe("web ↔ engine route contract", () => {
  it("every engine path called from the web app is registered in the engine", () => {
    const routes = engineRoutes();
    const missing: string[] = [];
    for (const [key, { prefix, files }] of calledPaths()) {
      const path = key.replace(/\/\*$/, "");
      if (KNOWN_MISSING.has(path)) continue;
      const ok = routes.some((r) => routeMatches(r, path, prefix) || (!prefix && r === path));
      if (!ok) missing.push(`${key}  ← ${[...files].join(", ")}`);
    }
    expect(missing).toEqual([]);
  });

  it("KNOWN_MISSING only lists paths that are really still missing", () => {
    const routes = engineRoutes();
    const fixed = [...KNOWN_MISSING].filter((p) => routes.some((r) => routeMatches(r, p, false)));
    expect(fixed).toEqual([]);
  });
});
