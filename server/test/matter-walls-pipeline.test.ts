/**
 * Legal-pipeline child agents and ethical walls: the trigger stamps the
 * caller's matter access, owner and matter into the pipeline job, and every
 * child job the pipeline submits inherits the stamp through
 * StampedMinionQueue — a submission site cannot forget it, nor widen it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { StampedMinionQueue } from "../src/core/minions/stamped-queue.ts";
import { inheritedAgentStamps, readJobMatterAccess } from "../src/core/matter-access.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-pipeline-walls";
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

async function jobData(id: number): Promise<Record<string, unknown>> {
  const [row] = await engine.executeRaw<{ data: unknown }>(
    `SELECT data FROM minion_jobs WHERE id = $1`,
    [id]
  );
  const d = row?.data;
  return (typeof d === "string" ? JSON.parse(d) : d) as Record<string, unknown>;
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
  const post = (h: Record<string, string>, body: unknown) =>
    fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
  for (const slug of ["cases/walled", "cases/open"]) {
    const res = await post(headers("u-admin", "admin"), {
      slug,
      type: "legal_case",
      title: slug,
      content: "Akte",
      frontmatter: { jurisdiction: "at" },
    });
    expect(res.status).toBe(200);
  }
  const wall = await post(
    headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }),
    {
      slug: "cases/walled",
      merge: true,
      frontmatter: { permissions: { blocked_users: ["u-lawyer"] } },
    }
  );
  expect(wall.status).toBe(200);
  invalidateMatterAccess(SOURCE);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("pipeline trigger", () => {
  test("the pipeline job carries the caller's matter access, owner and matter", async () => {
    const res = await fetch(`${base}/api/legal-pipeline/trigger`, {
      method: "POST",
      headers: headers("u-lawyer", "lawyer"),
      body: JSON.stringify({
        case_slug: "cases/open",
        part_slugs: ["cases/open"],
        jurisdiction: "at",
        owner_id: "org-1",
        owner_type: "org",
        pipeline_key: "pipeline-test",
        reserved_credits: 1,
      }),
    });
    expect(res.status).toBe(200);
    const { job_id } = (await res.json()) as { job_id: number };
    const data = await jobData(job_id);
    expect(data._matter_scope).toEqual(expect.arrayContaining(["!cases/walled"]));
    expect(data._owner_user_id).toBe("u-lawyer");
    expect(data._case_slug).toBe("cases/open");
  });
});

describe("StampedMinionQueue", () => {
  test("every submitted job inherits the stamps and cannot widen them", async () => {
    const parent = {
      _matter_scope: ["*", "!cases/walled"],
      _owner_user_id: "u-lawyer",
      _case_slug: "cases/open",
      source_id: SOURCE,
    };
    const queue = new StampedMinionQueue(engine, inheritedAgentStamps(parent));
    const child = await queue.add(
      "subagent",
      { prompt: "Prüfe", _matter_scope: "all", _source_id: SOURCE },
      {},
      { allowProtectedSubmit: true }
    );
    const data = await jobData(child.id);
    expect(readJobMatterAccess(data).scope).toEqual(["*", "!cases/walled"]);
    expect(data._owner_user_id).toBe("u-lawyer");
    expect(data._case_slug).toBe("cases/open");
    expect(data._source_id).toBe(SOURCE);
    expect(data.prompt).toBe("Prüfe");
  });

  test("an unrestricted pipeline (no stamp) leaves child data unchanged", async () => {
    const queue = new StampedMinionQueue(engine, inheritedAgentStamps({ source_id: SOURCE }));
    const child = await queue.add("subagent", { prompt: "x" }, {}, { allowProtectedSubmit: true });
    const data = await jobData(child.id);
    expect(data._matter_scope).toBeUndefined();
    expect(data._owner_user_id).toBeUndefined();
  });

  test("the legal pipeline submits every child through the stamped queue", () => {
    const src = readFileSync(
      join(import.meta.dir, "../src/core/minions/handlers/legal-pipeline.ts"),
      "utf8"
    );
    expect(src.match(/new MinionQueue\(/g)).toBeNull();
    expect(src).toContain("new StampedMinionQueue(engine, inheritedAgentStamps(ctx.data))");
  });
});
