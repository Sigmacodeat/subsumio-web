// @vitest-environment node
/**
 * Guard: routes that act for a signed-in person must call the engine with the
 * request's `ctx.headers`. Those carry the signed caller identity; without it
 * the engine treats the call as unrestricted and skips ethical walls,
 * restricted matters and client-viewer limits (§ 9 RAO).
 *
 * `engineHeadersForBrain` (firm headers, no identity) is only for callers
 * without a user session. New uses outside these places fail this test.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

/** Whole areas without a user session. */
const SESSIONLESS_AREAS = ["cron/", "portal/", "whatsapp/"];

/** Single routes without a user session, with the reason. */
const SESSIONLESS_ROUTES: Record<string, string> = {
  "booking/public/route.ts": "public booking page, no login",
  "intake/public/route.ts": "public enquiry form, no login",
  "concierge/route.ts": "website chatbot on its own sales brain",
  "demo/route.ts": "public demo search on the demo brain",
  "cti/webhook/route.ts": "telephony webhook",
  "cti/webhook/[token]/route.ts": "telephony webhook, token in the path",
  "docusign/webhook/route.ts": "DocuSign webhook",
  "internal/post-upload/route.ts": "internal worker, shared-secret auth",
  "signature/qes/done/[token]/route.ts": "signing provider callback, token auth",
  "signature/qes/pdf/[token]/route.ts": "signing provider fetch, token auth",
  "data-rooms/[id]/document/route.ts":
    "guest of another firm reads a document the host explicitly shared",
  "data-rooms/[id]/route.ts":
    "guest view checks which shared documents of the host matter still exist",
  "legal/contradictions/route.ts": "only on the x-internal-secret branch",
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("engine calls for signed-in users carry the caller identity", () => {
  it("no user-facing route uses the identity-less firm headers", () => {
    const offenders = routeFiles(API_ROOT)
      .map((f) => path.relative(API_ROOT, f).split(path.sep).join("/"))
      .filter((rel) => !SESSIONLESS_AREAS.some((a) => rel.startsWith(a)))
      .filter((rel) => !(rel in SESSIONLESS_ROUTES))
      .filter((rel) =>
        readFileSync(path.join(API_ROOT, rel), "utf8").includes("engineHeadersForBrain")
      );
    expect(offenders).toEqual([]);
  });

  it("the allowlist names only routes that still exist", () => {
    for (const rel of Object.keys(SESSIONLESS_ROUTES)) {
      expect(() => statSync(path.join(API_ROOT, rel))).not.toThrow();
    }
  });

  it("server-side Copilot helpers never use the browser API client", () => {
    for (const lib of ["planning-session.ts", "comments.ts", "copilot-notifications.ts"]) {
      const src = readFileSync(path.join(process.cwd(), "src", "lib", lib), "utf8");
      expect(src, lib).not.toMatch(/from "(@\/lib\/|\.\/)api"/);
    }
  });
});
