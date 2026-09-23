/**
 * `gbrain pages audit-agent-writes`: read-only report of pages agent runs
 * wrote without a matter binding, with the writing job and whether a web user
 * started it. Bound pages (case_slug), private areas and deleted pages are
 * not listed; nothing is changed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { MinionQueue } from "../src/core/minions/queue.ts";
import { auditUnboundAgentPages } from "../src/core/agent-write-audit.ts";
import { runPages } from "../src/commands/pages.ts";

let engine: PGLiteEngine;
let webJob: number;
let cliJob: number;
let toolJob: number;

async function put(slug: string, type: string, fm: Record<string, unknown> = {}) {
  await engine.putPage(slug, {
    type: type as never,
    title: slug,
    compiled_truth: slug,
    frontmatter: fm,
  });
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  const queue = new MinionQueue(engine);
  const add = async (name: string, data: Record<string, unknown>) =>
    (await queue.add(name, data, {}, { allowProtectedSubmit: true })).id;
  webJob = await add("subagent", { prompt: "x", _owner_user_id: "u-1" });
  cliJob = await add("supervisor", { prompt: "y" });
  toolJob = await add("subagent", { prompt: "z", _matter_scope: ["*", "!cases/walled"] });

  await put(`wiki/agents/${webJob}/leak`, "note");
  await put(`agent-runs/supervisor-${cliJob}-1`, "agent_run", { agent_job_id: cliJob });
  await put("wiki/personal/written-by-tool", "note");
  await put("wiki/agents/999999/orphan", "note", { case_ref: "cases/x" });
  // Not listed: bound, private, deleted, unrelated.
  await put(`wiki/agents/${webJob}/bound`, "note", { case_slug: "cases/open" });
  await put(`chat-sessions/private/u-1/wiki/agents/${webJob}/p`, "note");
  await put(`wiki/agents/${webJob}/deleted`, "note");
  await engine.softDeletePage(`wiki/agents/${webJob}/deleted`);
  await put("notes/unrelated", "note");

  await engine.executeRaw(
    `INSERT INTO subagent_tool_executions (job_id, message_idx, tool_use_id, tool_name, input, status)
     VALUES ($1, 0, 'tu_1', 'brain_put_page', $2::jsonb, 'complete')`,
    [toolJob, { slug: "wiki/personal/written-by-tool", content: "x" }]
  );
}, 60_000);

afterAll(async () => {
  await engine?.disconnect();
}, 60_000);

describe("auditUnboundAgentPages", () => {
  test("lists unbound agent pages with their job, web runs first", async () => {
    const report = await auditUnboundAgentPages(engine);
    const bySlug = new Map(report.rows.map((r) => [r.slug, r]));
    expect([...bySlug.keys()].sort()).toEqual(
      [
        `agent-runs/supervisor-${cliJob}-1`,
        "wiki/agents/999999/orphan",
        `wiki/agents/${webJob}/leak`,
        "wiki/personal/written-by-tool",
      ].sort()
    );
    expect(bySlug.get(`wiki/agents/${webJob}/leak`)).toMatchObject({
      origin: "subagent_namespace",
      job_id: webJob,
      job_name: "subagent",
      owner_user_id: "u-1",
      risk: "web_run",
    });
    expect(bySlug.get("wiki/personal/written-by-tool")).toMatchObject({
      origin: "tool_execution",
      job_id: toolJob,
      job_matter_stamped: true,
      risk: "web_run",
    });
    expect(bySlug.get(`agent-runs/supervisor-${cliJob}-1`)).toMatchObject({
      origin: "agent_run_page",
      job_id: cliJob,
      risk: "unstamped_run",
    });
    expect(bySlug.get("wiki/agents/999999/orphan")).toMatchObject({
      job_id: 999999,
      risk: "job_unknown",
      case_ref: "cases/x",
    });
    expect(report.counts).toEqual({ web_run: 2, unstamped_run: 1, job_unknown: 1, total: 4 });
    expect(report.rows.slice(0, 2).every((r) => r.risk === "web_run")).toBe(true);
  });

  test("--since and --source narrow the report", async () => {
    const future = await auditUnboundAgentPages(engine, {
      since: new Date(Date.now() + 86_400_000),
    });
    expect(future.counts.total).toBe(0);
    const other = await auditUnboundAgentPages(engine, { sourceId: "some-other-firm" });
    expect(other.counts.total).toBe(0);
  });

  test("the CLI prints JSON and changes nothing", async () => {
    const before = await engine.executeRaw<{ n: number }>(
      `SELECT count(*)::int AS n FROM pages WHERE deleted_at IS NULL`
    );
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
    try {
      await runPages(engine, ["audit-agent-writes", "--json"]);
    } finally {
      console.log = orig;
    }
    const out = JSON.parse(lines.join("\n")) as { read_only: boolean; counts: { total: number } };
    expect(out.read_only).toBe(true);
    expect(out.counts.total).toBe(4);
    const after = await engine.executeRaw<{ n: number }>(
      `SELECT count(*)::int AS n FROM pages WHERE deleted_at IS NULL`
    );
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});
