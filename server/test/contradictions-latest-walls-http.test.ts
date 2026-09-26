/**
 * GET /api/legal/contradictions/latest shows a finding only when the caller
 * may see both documents: an ethical wall or document access group hides
 * findings that touch the walled matter.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-contra";
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

const finding = (a: string, b: string) => ({
  kind: "cross_slug_chunks",
  severity: "high",
  axis: `Widerspruch zwischen ${a} und ${b}`,
  confidence: 0.9,
  a: { slug: a, chunk_id: null, take_id: null },
  b: { slug: b, chunk_id: null, take_id: null },
  resolution_kind: "manual_review",
  resolution_command: "",
});

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

  const put = (h: Record<string, string>, body: unknown) =>
    fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const admin = headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" });
  for (const slug of ["cases/walled", "cases/open"]) {
    expect(
      (await put(admin, { slug, type: "legal_case", title: slug, content: "Akte" })).status
    ).toBe(200);
  }
  await put(admin, {
    slug: "cases/walled",
    merge: true,
    frontmatter: { permissions: { blocked_users: ["u-walled"] } },
  });
  invalidateMatterAccess(SOURCE);
  for (const [slug, caseSlug] of [
    ["docs/geheim", "cases/walled"],
    ["docs/offen-1", "cases/open"],
    ["docs/offen-2", "cases/open"],
  ] as const) {
    await importFromContent(
      engine,
      slug,
      `---\ntitle: ${slug}\ntype: document\ncase_slug: ${caseSlug}\n---\n\ntext\n`,
      { sourceId: SOURCE, noEmbed: true }
    );
  }
  await engine.writeContradictionsRun({
    run_id: "run-walls",
    judge_model: "anthropic:claude-haiku-4-5",
    prompt_version: "1",
    queries_evaluated: 1,
    queries_with_contradiction: 1,
    total_contradictions_flagged: 2,
    wilson_ci_lower: 0,
    wilson_ci_upper: 1,
    judge_errors_total: 0,
    cost_usd_total: 0,
    duration_ms: 1,
    source_tier_breakdown: { curated_vs_curated: 0, curated_vs_bulk: 0, bulk_vs_bulk: 0, other: 0 },
    report_json: {
      schema_version: 1,
      run_id: "run-walls",
      per_query: [
        {
          contradictions: [
            finding("docs/geheim", "docs/offen-1"),
            finding("docs/offen-1", "docs/offen-2"),
          ],
        },
      ],
    },
  } as never);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

const latest = async (h: Record<string, string>) =>
  (
    (await (await fetch(`${base}/api/legal/contradictions/latest`, { headers: h })).json()) as {
      findings: Array<{ a: { slug: string }; b: { slug: string }; axis: string }>;
    }
  ).findings;

describe("GET /api/legal/contradictions/latest", () => {
  test("a walled colleague sees no finding that touches the walled matter", async () => {
    const f = await latest(headers("u-walled", "lawyer"));
    expect(f).toHaveLength(1);
    expect(JSON.stringify(f)).not.toContain("docs/geheim");
  });

  test("a colleague without a wall sees both findings", async () => {
    expect(await latest(headers("u-colleague", "lawyer"))).toHaveLength(2);
  });
});
