// @vitest-environment node
// UI-5: links built outside the dashboard (mobile app, Copilot tool results)
// must point to existing dashboard routes — no 404s.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brainPageHref, caseHref, INVOICING_HREF } from "./dashboard-hrefs";

const ROOT = path.resolve(__dirname, "..");
const DASHBOARD = path.join(ROOT, "app", "dashboard");

function routeExists(segment: string): boolean {
  return existsSync(path.join(DASHBOARD, segment));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("dashboard hrefs", () => {
  it("builds links to routes that exist", () => {
    expect(caseHref("legal/cases/mueller")).toBe("/dashboard/cases/legal/cases/mueller");
    expect(brainPageHref("notes/2026-09-25 notiz")).toBe(
      "/dashboard/brain/notes%2F2026-09-25%20notiz"
    );
    expect(INVOICING_HREF).toBe("/dashboard/invoicing");
    expect(existsSync(path.join(DASHBOARD, "cases", "[...slug]", "page.tsx"))).toBe(true);
    expect(existsSync(path.join(DASHBOARD, "brain", "[slug]", "page.tsx"))).toBe(true);
    expect(existsSync(path.join(DASHBOARD, "invoicing", "page.tsx"))).toBe(true);
  });

  it("mobile pages and Copilot tool results link only to existing dashboard routes", () => {
    const sources = [
      ...filesUnder(path.join(ROOT, "app", "mobile")),
      path.join(ROOT, "app", "api", "copilot", "tools", "route.ts"),
    ];
    const dead: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\/dashboard\/([a-z0-9_-]+)/g)) {
        if (!routeExists(m[1]!)) dead.push(`${path.relative(ROOT, file)}: /dashboard/${m[1]}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
