/**
 * KYC records and ID copies are firm-internal: a client account granted its
 * own matter never reads them — not through the page list, a direct read,
 * search, the original-file route or an MCP token — while firm staff do.
 * The rule lives in the shared matter scope (core/matter-access-db.ts), so
 * every read path of the engine applies it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { callerMatterScope, loadSourceMatterAccess } from "../src/core/matter-access-db.ts";
import { matterScopeAllows, staffOnlyDenies } from "../src/core/matter-access.ts";
import { resolveWebMcpToken } from "../src/core/web-mcp-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-kyc";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

function headers(userId: string, role: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
    ...extra,
  };
}

async function putPage(h: Record<string, string>, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/pages`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
}

async function getStatus(h: Record<string, string>, slug: string) {
  const res = await fetch(
    `${base}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: h,
    }
  );
  await res.body?.cancel();
  return res.status;
}

async function listSlugs(h: Record<string, string>, query: string): Promise<string[]> {
  const res = await fetch(`${base}/api/pages?${query}`, { headers: h });
  const raw = (await res.json()) as unknown;
  const pages = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { pages?: unknown[] })?.pages)
      ? (raw as { pages: unknown[] }).pages
      : [];
  return (pages as Array<{ slug: string }>).map((p) => p.slug);
}

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const admin = headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" });
  await putPage(admin, {
    slug: "cases/mandant",
    type: "legal_case",
    title: "Mandant",
    content: "Akte",
    frontmatter: { permissions: { grants: [{ user_id: "u-client", level: "read" }] } },
  });
  await putPage(admin, {
    slug: "documents/vollmacht",
    type: "document",
    title: "Vollmacht",
    content: "Vollmacht Kormoranweg",
    frontmatter: { case_slug: "cases/mandant" },
  });
  await putPage(admin, {
    slug: "documents/scan-reisepass",
    type: "document",
    title: "Scan",
    content: "Reisepass Kormoranweg",
    frontmatter: { case_slug: "cases/mandant" },
  });
  await putPage(admin, {
    slug: "documents/lichtbildausweis",
    type: "document",
    title: "Lichtbildausweis",
    content: "Ausweis Kormoranweg",
    frontmatter: { case_slug: "cases/mandant", doc_type: "ausweiskopie" },
  });
  await putPage(admin, {
    slug: "documents/geldwaesche-notiz",
    type: "document",
    title: "Notiz",
    content: "Notiz Kormoranweg",
    frontmatter: { case_slug: "cases/mandant", tags: ["kyc"] },
  });
  await putPage(admin, {
    slug: "legal/kyc/kyc-1",
    type: "kyc_verification",
    title: "Identitätsprüfung",
    content: "Identitätsprüfung Kormoranweg",
    frontmatter: {
      case_slug: "cases/mandant",
      risk_level: "high",
      pep_match: true,
      identification: { document_file_slug: "documents/scan-reisepass" },
    },
  });
  invalidateMatterAccess(SOURCE);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("KYC records are firm staff only", () => {
  test("a client account with a grant on the matter never lists or reads them", async () => {
    const client = headers("u-client", "client_viewer");
    expect(await listSlugs(client, "type=kyc_verification")).toEqual([]);
    const docs = await listSlugs(client, "type=document");
    expect(docs).toContain("documents/vollmacht");
    expect(docs).not.toContain("documents/scan-reisepass");
    expect(docs).not.toContain("documents/lichtbildausweis");
    expect(await getStatus(client, "legal/kyc/kyc-1")).toBe(404);
    expect(await getStatus(client, "documents/scan-reisepass")).toBe(404);
    expect(await getStatus(client, "documents/lichtbildausweis")).toBe(404);
    expect(await getStatus(client, "documents/geldwaesche-notiz")).toBe(404);
    expect(await getStatus(client, "documents/vollmacht")).toBe(200);
  }, 60_000);

  test("the original-file route refuses the ID copy for a client account", async () => {
    const res = await fetch(`${base}/api/files/documents/scan-reisepass`, {
      headers: headers("u-client", "client_viewer"),
    });
    await res.body?.cancel();
    expect(res.status).toBe(404);
  }, 60_000);

  test("keyword search never returns them to a client account", async () => {
    const res = await fetch(`${base}/api/search?q=Kormoranweg&mode=keyword`, {
      headers: headers("u-client", "client_viewer"),
    });
    const text = await res.text();
    expect(text).not.toContain("legal/kyc/kyc-1");
    expect(text).not.toContain("documents/scan-reisepass");
    expect(text).not.toContain("documents/lichtbildausweis");
  }, 60_000);

  test("firm staff still see the records", async () => {
    const lawyer = headers("u-lawyer", "lawyer");
    expect(await listSlugs(lawyer, "type=kyc_verification")).toEqual(["legal/kyc/kyc-1"]);
    expect(await getStatus(lawyer, "documents/scan-reisepass")).toBe(200);
  }, 60_000);

  test("a record filed a moment ago is hidden from a client account at once", async () => {
    const client = headers("u-client", "client_viewer");
    // Warm the staff cache, then file a new ID copy.
    expect(await getStatus(headers("u-lawyer", "lawyer"), "documents/vollmacht")).toBe(200);
    await putPage(headers("u-admin", "admin"), {
      slug: "documents/ausweis-neu",
      type: "document",
      title: "Ausweis neu",
      content: "Ausweis",
      frontmatter: { case_slug: "cases/mandant", doc_type: "ausweiskopie" },
    });
    expect(await getStatus(client, "documents/ausweis-neu")).toBe(404);
  }, 60_000);

  test("an MCP token of a client account carries the same exclusion", async () => {
    const access = await resolveWebMcpToken(
      engine,
      { sourceId: SOURCE, userId: "u-client" },
      async () => ({ active: true, role: "client_viewer" })
    );
    if (typeof access === "string") throw new Error(access);
    expect(matterScopeAllows(access.matterScope, "legal/kyc/kyc-1", "cases/mandant")).toBe(false);
    expect(matterScopeAllows(access.matterScope, "documents/scan-reisepass", "cases/mandant")).toBe(
      false
    );
    expect(matterScopeAllows(access.matterScope, "documents/vollmacht", "cases/mandant")).toBe(
      true
    );
  }, 60_000);

  test("unknown roles are treated like client accounts (fail-closed)", async () => {
    const known = await loadSourceMatterAccess(engine, SOURCE);
    const { scope } = callerMatterScope("all", { userId: "u-x", role: undefined }, known);
    expect(matterScopeAllows(scope, "legal/kyc/kyc-1")).toBe(false);
    const staff = callerMatterScope("all", { userId: "u-y", role: "assistant" }, known);
    expect(matterScopeAllows(staff.scope, "legal/kyc/kyc-1")).toBe(true);
    expect(staffOnlyDenies("admin", ["a"])).toEqual([]);
  });
});
