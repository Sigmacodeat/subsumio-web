/**
 * list_pages `match` / GET /api/pages `q`: case-insensitive substring search
 * over title, name, e-mail, company and case number in SQL — a contact
 * picker finds any contact of the firm, not only recently edited ones.
 * LIKE metacharacters are literal; other firms' pages never match.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { textMatchPattern } from "../src/core/types.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-textmatch";
const OTHER = "firm-textmatch-other";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

async function search(q: string, source = SOURCE): Promise<string[]> {
  const res = await fetch(
    `${base}/api/pages?type=legal_contact&limit=100&q=${encodeURIComponent(q)}`,
    { headers: { "x-subsumio-api-key": SECRET, "x-subsumio-source": source } }
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as Array<{ slug: string }>).map((p) => p.slug).sort();
}

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  for (const src of [SOURCE, OTHER]) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [src]
    );
  }
  const put = (slug: string, title: string, fm: Record<string, unknown>, sourceId = SOURCE) =>
    engine.putPage(
      slug,
      { type: "legal_contact" as never, title, compiled_truth: "", frontmatter: fm },
      { sourceId }
    );
  await put("c/otto", "Otto Altgegner", { name: "Otto Altgegner", email: "otto@example.test" });
  await put("c/maria", "Kontakt 2", { name: "Maria Mandantin", email: "m.mandantin@kanzlei.test" });
  await put("c/firma", "Firma", { company: "Acme 100% GmbH" });
  await put("c/otto-other", "Otto Fremd", { name: "Otto Fremd" }, OTHER);
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await engine?.disconnect();
  releaseEnv?.();
}, 60_000);

describe("text match", () => {
  test("by name, e-mail and company, case-insensitive, own firm only", async () => {
    expect(await search("OTTO")).toEqual(["c/otto"]);
    expect(await search("kanzlei.test")).toEqual(["c/maria"]);
    expect(await search("acme")).toEqual(["c/firma"]);
    expect(await search("otto", OTHER)).toEqual(["c/otto-other"]);
  });

  test("LIKE metacharacters are literal", async () => {
    expect(await search("100%")).toEqual(["c/firma"]);
    expect(await search("%%")).toEqual([]);
    expect(await search("_a")).toEqual([]);
  });

  test("a single character does not filter", async () => {
    expect(await search("o")).toEqual(["c/firma", "c/maria", "c/otto"]);
    expect(textMatchPattern(" o ")).toBeNull();
    expect(textMatchPattern("a_b")).toBe("%a\\_b%");
  });
});
