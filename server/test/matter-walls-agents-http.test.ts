/**
 * Ethical walls over HTTP for agent and deadline routes, on a real PGLite
 * brain: agent jobs carry the caller's matter scope, case investigation and
 * the pipeline trigger refuse walled matters, and the Fristenbuch / ICS feed
 * leave out walled matters' deadlines.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-walls";
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

const lawyer = () => headers("u-lawyer", "lawyer");
const admin = () => headers("u-admin", "admin");

async function putPage(h: Record<string, string>, body: Record<string, unknown>) {
  return fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
}

async function post(path: string, h: Record<string, string>, body: unknown) {
  return fetch(`${base}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
}

async function jobData(id: number): Promise<Record<string, unknown>> {
  const [row] = await engine.executeRaw<{ data: unknown }>(
    `SELECT data FROM minion_jobs WHERE id = $1`,
    [id]
  );
  const d = row?.data;
  return (typeof d === "string" ? JSON.parse(d) : d) as Record<string, unknown>;
}

const CAL = (frist: string) =>
  [
    "| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |",
    "|---|---|---|---|---|---|",
    `| 03.07.2030 | rot | ${frist} | § 464 ZPO | Rechtskraft | ON 12 |`,
  ].join("\n");

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

  for (const slug of ["cases/walled", "cases/open"]) {
    const res = await putPage(admin(), {
      slug,
      type: "legal_case",
      title: slug,
      content: "Akte",
      frontmatter: {},
    });
    expect(res.status).toBe(200);
  }
  const wall = await putPage(
    headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }),
    {
      slug: "cases/walled",
      merge: true,
      frontmatter: { permissions: { blocked_users: ["u-lawyer"] } },
    }
  );
  expect(wall.status).toBe(200);
  invalidateMatterAccess(SOURCE);

  await engine.putPage(
    "deadline-calendars/cases/walled",
    {
      type: "deadline_calendar" as never,
      title: "Fristen walled",
      compiled_truth: CAL("Geheime Berufungsfrist"),
      frontmatter: {},
    },
    { sourceId: SOURCE }
  );
  await engine.putPage(
    "deadline-calendars/cases/open",
    {
      type: "deadline_calendar" as never,
      title: "Fristen open",
      compiled_truth: CAL("Offene Einspruchsfrist"),
      frontmatter: {},
    },
    { sourceId: SOURCE }
  );
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("agent jobs carry the caller's matter scope", () => {
  test("a walled caller's supervisor job is stamped; an unrestricted caller's is not", async () => {
    const res = await post("/api/agents/supervisor", lawyer(), { prompt: "Analysiere die Akten" });
    expect(res.status).toBe(200);
    const { jobId } = (await res.json()) as { jobId: number };
    const data = await jobData(jobId);
    expect(data._source_id).toBe(SOURCE);
    expect(data._matter_scope).toEqual(expect.arrayContaining(["!cases/walled"]));

    const plain = await post("/api/agents/supervisor", admin(), { prompt: "Analysiere die Akten" });
    const plainData = await jobData(((await plain.json()) as { jobId: number }).jobId);
    expect(plainData._matter_scope).toBeUndefined();
  });

  test("a replay by a walled caller never yields a job outside that caller's scope", async () => {
    const res = await post("/api/agents/supervisor", admin(), { prompt: "Analysiere alles" });
    const { jobId } = (await res.json()) as { jobId: number };
    await engine.executeRaw(`UPDATE minion_jobs SET status = 'completed' WHERE id = $1`, [jobId]);
    const [{ n: before }] = await engine.executeRaw<{ n: number }>(
      `SELECT count(*)::int AS n FROM minion_jobs`
    );

    const replay = await post(`/api/agents/${jobId}/replay`, lawyer(), {});
    if (replay.status === 200) {
      const { newJobId } = (await replay.json()) as { newJobId: number };
      const data = await jobData(newJobId);
      expect(data._matter_scope).toEqual(expect.arrayContaining(["!cases/walled"]));
      expect(data.prompt).toBe("Analysiere alles");
    } else {
      // MinionQueue.replayJob refuses protected job names (supervisor) —
      // then no job may have been created at all.
      const [{ n: after }] = await engine.executeRaw<{ n: number }>(
        `SELECT count(*)::int AS n FROM minion_jobs`
      );
      expect(after).toBe(before);
    }
  });

  test("a case scan started by a walled caller is stamped", async () => {
    const res = await post("/api/legal/case-scanner", lawyer(), {});
    expect(res.status).toBe(200);
    const { job_id } = (await res.json()) as { job_id: number };
    expect((await jobData(job_id))._matter_scope).toEqual(
      expect.arrayContaining(["!cases/walled"])
    );
  });
});

describe("case investigation and pipeline trigger authorize case_slug", () => {
  test("case investigation of a walled matter reads as not found", async () => {
    const walled = await post("/api/legal/case-investigation", lawyer(), {
      case_slug: "cases/walled",
    });
    expect(walled.status).toBe(404);
    const open = await post("/api/legal/case-investigation", lawyer(), { case_slug: "cases/open" });
    expect(open.status).not.toBe(404);
  });

  test("the pipeline cannot be triggered on a walled matter", async () => {
    const res = await post("/api/legal-pipeline/trigger", lawyer(), { case_slug: "cases/walled" });
    expect(res.status).toBe(404);
  });
});

describe("Fristenbuch and ICS feed", () => {
  test("a walled matter's deadlines are left out of the Fristenbuch", async () => {
    const res = await fetch(`${base}/api/legal/fristenbuch?heute=2030-06-01`, {
      headers: lawyer(),
    });
    expect(res.status).toBe(200);
    const buch = (await res.json()) as {
      eintraege: Array<{ case_slug: string; frist: string }>;
      zusammenfassung: { gesamt: number };
    };
    expect(buch.eintraege.map((e) => e.case_slug)).toEqual(["cases/open"]);
    expect(buch.zusammenfassung.gesamt).toBe(1);

    const forWalled = (await (
      await fetch(`${base}/api/legal/fristenbuch?heute=2030-06-01&case=cases/walled`, {
        headers: lawyer(),
      })
    ).json()) as { eintraege: unknown[] };
    expect(forWalled.eintraege).toEqual([]);

    const full = (await (
      await fetch(`${base}/api/legal/fristenbuch?heute=2030-06-01`, { headers: admin() })
    ).json()) as { eintraege: Array<{ case_slug: string }> };
    expect(full.eintraege.map((e) => e.case_slug).sort()).toEqual(["cases/open", "cases/walled"]);
  });

  test("the ICS feed carries no event of a walled matter", async () => {
    const ics = await (
      await fetch(`${base}/api/legal/deadlines.ics`, { headers: lawyer() })
    ).text();
    expect(ics).toContain("Offene Einspruchsfrist");
    expect(ics).not.toContain("Geheime Berufungsfrist");
    expect(ics).not.toContain("cases/walled");
  });
});
