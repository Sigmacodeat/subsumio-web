/**
 * Ethical walls for what agent runs WRITE: a run a web user started (owner
 * or matter-access stamp) never leaves a firm-wide page behind. Its pages are
 * bound to the run's matter, or kept in the owner's private area when the run
 * has none; a stamped run with neither may not write. Updating a firm-wide
 * page from a bound run is refused, other writing tools are refused, and a
 * bound run never reads a colleague's private area. CLI / cron runs are
 * unchanged.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { OperationError, operations } from "../src/core/operations.ts";
import {
  agentWriteBinding,
  matterScopeAllows,
  privateAreaPrefix,
  type AgentWriteBinding,
  type MatterScope,
} from "../src/core/matter-access.ts";
import { callerMatterScope, loadSourceMatterAccess } from "../src/core/matter-access-db.ts";
import { buildBrainTools, runMatterGuarded } from "../src/core/minions/tools/brain-allowlist.ts";
import { makeSubagentHandler, type MessagesClient } from "../src/core/minions/handlers/subagent.ts";
import { MinionQueue } from "../src/core/minions/queue.ts";
import { isFactsBackstopEligible } from "../src/core/facts/eligibility.ts";
import type { GBrainConfig } from "../src/core/config.ts";
import type { MinionJobContext, ToolCtx, ToolDef } from "../src/core/minions/types.ts";

const config: GBrainConfig = { engine: "pglite" } as GBrainConfig;
const WALLED: MatterScope = ["*", "!cases/walled"];
const OWNER = "u-1";
const OWN_AREA = privateAreaPrefix(OWNER);
let engine: PGLiteEngine;

function tools(
  opts: { scope?: MatterScope; readOnly?: string[]; binding?: AgentWriteBinding } = {}
): ToolDef[] {
  return buildBrainTools({
    subagentId: 9,
    engine,
    config,
    matterScope: opts.scope,
    matterReadOnly: opts.readOnly,
    writeBinding: opts.binding,
  });
}

function tool(defs: ToolDef[], name: string): ToolDef {
  const t = defs.find((d) => d.name === `brain_${name}`);
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

const ctx = (): ToolCtx => ({ engine, jobId: 1, remote: true });
const matterBinding = (caseSlug: string): AgentWriteBinding => ({
  kind: "matter",
  caseSlug,
  ownerUserId: OWNER,
});
const privateBinding: AgentWriteBinding = {
  kind: "private",
  ownerUserId: OWNER,
  prefix: OWN_AREA,
};

async function fm(slug: string): Promise<Record<string, unknown> | null> {
  const p = await engine.getPage(slug);
  return p ? ((p.frontmatter ?? {}) as Record<string, unknown>) : null;
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  const put = (slug: string, type: string, title: string, fmData: Record<string, unknown> = {}) =>
    engine.putPage(slug, {
      type: type as never,
      title,
      compiled_truth: title,
      frontmatter: fmData,
    });
  await put("cases/open", "legal_case", "Mandat Offen");
  await put("cases/second", "legal_case", "Mandat Zwei");
  await put("cases/walled", "legal_case", "Mandat Gesperrt");
  await put("wiki/agents/9/firmwide", "note", "Kanzleiweite Altnotiz");
  await put("wiki/agents/9/open-note", "note", "Notiz zur Akte", { case_slug: "cases/open" });
  await put("chat-sessions/private/u-2/secret", "note", "Privat von u-2");
  await put(`${OWN_AREA}own-chat`, "note", "Eigene Unterhaltung");
}, 60_000);

afterAll(async () => {
  await engine?.disconnect();
}, 60_000);

describe("agentWriteBinding", () => {
  test("classifies runs by their stamps", () => {
    expect(agentWriteBinding({ prompt: "cli" })).toEqual({ kind: "free" });
    expect(agentWriteBinding({ _matter_scope: WALLED })).toEqual({ kind: "refuse" });
    // A malformed stamp is still a stamp: no firm-wide writes.
    expect(agentWriteBinding({ _matter_scope: "garbage" })).toEqual({ kind: "refuse" });
    expect(agentWriteBinding({ _owner_user_id: "a b@c" })).toEqual({
      kind: "private",
      ownerUserId: "a b@c",
      prefix: "chat-sessions/private/a_b_c/",
    });
    expect(
      agentWriteBinding({ _owner_user_id: OWNER, _case_slug: "cases/open", _matter_scope: WALLED })
    ).toEqual({ kind: "matter", caseSlug: "cases/open", ownerUserId: OWNER });
    expect(agentWriteBinding({ _case_slug: "cases/open" })).toEqual({
      kind: "matter",
      caseSlug: "cases/open",
    });
  });

  test("the put_page schema tells the model where its pages go", () => {
    const desc = (b: AgentWriteBinding): string => {
      const schema = tool(tools({ binding: b }), "put_page").input_schema;
      const props = schema.properties as Record<string, { description?: string }>;
      return String(props.slug?.description);
    };
    expect(desc(matterBinding("cases/open"))).toContain('bound to matter "cases/open"');
    expect(desc(privateBinding)).toContain(OWN_AREA);
    expect(desc({ kind: "refuse" })).toContain("may not write pages");
  });
});

describe("put_page of a run bound to a matter", () => {
  test("a new page gets the run's matter as case_slug", async () => {
    const putPage = tool(
      tools({ scope: WALLED, binding: matterBinding("cases/open") }),
      "put_page"
    );
    await putPage.execute(
      { slug: "wiki/agents/9/analyse", content: "---\ntitle: Analyse\n---\nText der Analyse" },
      ctx()
    );
    const f = await fm("wiki/agents/9/analyse");
    expect(f?.case_slug).toBe("cases/open");
    expect(f?.agent_job_id).toBe(1);
    const page = await engine.getPage("wiki/agents/9/analyse");
    expect(page?.compiled_truth).toContain("Text der Analyse");
  });

  test("content claiming another matter is refused", async () => {
    const putPage = tool(tools({ binding: matterBinding("cases/open") }), "put_page");
    await expect(
      putPage.execute(
        {
          slug: "wiki/agents/9/fremd",
          content: "---\ntitle: Fremd\ncase_slug: cases/second\n---\nbody",
        },
        ctx()
      )
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(await engine.getPage("wiki/agents/9/fremd")).toBeNull();
  });

  test("updating a firm-wide page is refused and leaves it unchanged", async () => {
    const putPage = tool(tools({ binding: matterBinding("cases/open") }), "put_page");
    await expect(
      putPage.execute(
        { slug: "wiki/agents/9/firmwide", content: "---\ntitle: Neu\n---\nAkteninhalt" },
        ctx()
      )
    ).rejects.toMatchObject({ code: "permission_denied" });
    const page = await engine.getPage("wiki/agents/9/firmwide");
    expect(page?.title).toBe("Kanzleiweite Altnotiz");
    expect((page?.frontmatter as Record<string, unknown>).case_slug).toBeUndefined();
  });

  test("a page of the same matter can be updated", async () => {
    const putPage = tool(tools({ binding: matterBinding("cases/open") }), "put_page");
    await putPage.execute(
      { slug: "wiki/agents/9/open-note", content: "---\ntitle: Aktualisiert\n---\nneu" },
      ctx()
    );
    const page = await engine.getPage("wiki/agents/9/open-note");
    expect(page?.title).toBe("Aktualisiert");
    expect((page?.frontmatter as Record<string, unknown>).case_slug).toBe("cases/open");
  });

  test("a matter the run's user may only read stays read-only", async () => {
    const putPage = tool(
      tools({ scope: WALLED, readOnly: ["cases/open"], binding: matterBinding("cases/open") }),
      "put_page"
    );
    await expect(
      putPage.execute({ slug: "wiki/agents/9/ro", content: "---\ntitle: RO\n---\nx" }, ctx())
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(await engine.getPage("wiki/agents/9/ro")).toBeNull();
  });
});

describe("put_page of a user's run without a matter", () => {
  test("the page goes to the owner's private area, never firm-wide", async () => {
    const t = tools({ binding: privateBinding });
    const res = (await tool(t, "put_page").execute(
      { slug: "wiki/agents/9/entwurf", content: "---\ntitle: Entwurf\n---\nInhalt aus Akte" },
      ctx()
    )) as { slug?: string };
    const target = `${OWN_AREA}wiki/agents/9/entwurf`;
    expect(res.slug).toBe(target);
    expect(await engine.getPage("wiki/agents/9/entwurf")).toBeNull();
    const f = await fm(target);
    expect(f?.visibility).toBe("private");
    expect(f?.agent_owner_id).toBe(OWNER);
    expect(f?.case_slug).toBeUndefined();

    // The model reads it back under its own slug.
    const read = (await tool(t, "get_page").execute({ slug: "wiki/agents/9/entwurf" }, ctx())) as {
      slug: string;
    };
    expect(read.slug).toBe(target);

    // Colleagues' matter scope hides it; the owner sees it.
    const known = await loadSourceMatterAccess(engine, "default");
    const colleague = callerMatterScope("all", { userId: "u-2", role: "admin" }, known);
    const owner = callerMatterScope("all", { userId: OWNER, role: "lawyer" }, known);
    expect(matterScopeAllows(colleague.scope, target)).toBe(false);
    expect(matterScopeAllows(owner.scope, target)).toBe(true);
  });

  test("a matter the content claims stays as an extra restriction", async () => {
    const putPage = tool(tools({ scope: WALLED, binding: privateBinding }), "put_page");
    await expect(
      putPage.execute(
        {
          slug: "wiki/agents/9/walled",
          content: "---\ntitle: W\ncase_slug: cases/walled\n---\nx",
        },
        ctx()
      )
    ).rejects.toMatchObject({ code: "page_not_found" });
    await putPage.execute(
      {
        slug: "wiki/agents/9/offen",
        content: "---\ntitle: O\ncase_slug: cases/open\n---\nx",
      },
      ctx()
    );
    expect((await fm(`${OWN_AREA}wiki/agents/9/offen`))?.case_slug).toBe("cases/open");
  });

  test("another owner's area or another agent's namespace is refused", async () => {
    const putPage = tool(tools({ binding: privateBinding }), "put_page");
    for (const slug of ["chat-sessions/private/u-2/wiki/agents/9/x", "wiki/agents/10/x"]) {
      await expect(
        putPage.execute({ slug, content: "---\ntitle: X\n---\nx" }, ctx())
      ).rejects.toMatchObject({ code: "permission_denied" });
      expect(await engine.getPage(slug)).toBeNull();
      expect(await engine.getPage(`${OWN_AREA}${slug}`)).toBeNull();
    }
  });

  test("the run never reads a colleague's private area, only its owner's", async () => {
    const t = tools({ binding: privateBinding });
    await expect(
      tool(t, "get_page").execute({ slug: "chat-sessions/private/u-2/secret" }, ctx())
    ).rejects.toBeInstanceOf(OperationError);
    const listed = (await tool(t, "list_pages").execute({ limit: 200 }, ctx())) as Array<{
      slug: string;
    }>;
    const slugs = listed.map((p) => p.slug);
    expect(slugs).not.toContain("chat-sessions/private/u-2/secret");
    expect(slugs).toContain(`${OWN_AREA}own-chat`);
  });
});

describe("runs with a stamp but no matter and no owner", () => {
  test("may not write pages at all", async () => {
    const putPage = tool(tools({ scope: WALLED, binding: { kind: "refuse" } }), "put_page");
    await expect(
      putPage.execute({ slug: "wiki/agents/9/nope", content: "---\ntitle: N\n---\nx" }, ctx())
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(await engine.getPage("wiki/agents/9/nope")).toBeNull();
  });
});

describe("unchanged for CLI / cron runs", () => {
  test("an unstamped run still writes its namespace page firm-wide", async () => {
    await tool(tools(), "put_page").execute(
      { slug: "wiki/agents/9/cli", content: "---\ntitle: CLI\n---\nbody" },
      ctx()
    );
    const f = await fm("wiki/agents/9/cli");
    expect(f).not.toBeNull();
    expect(f?.case_slug).toBeUndefined();
    expect(f?.visibility).toBeUndefined();
    expect(f?.agent_job_id).toBeUndefined();
  });
});

describe("other writing tools", () => {
  test("links, tags and timeline entries are refused for bound runs", async () => {
    const opCtx = {
      engine,
      config,
      logger: { info() {}, warn() {}, error() {} },
      dryRun: false,
      remote: true,
      sourceId: "default",
      jobId: 1,
      subagentId: 9,
      viaSubagent: true,
    } as never;
    for (const name of ["add_link", "add_tag", "add_timeline_entry"]) {
      const op = operations.find((o) => o.name === name);
      expect(op).toBeDefined();
      for (const binding of [privateBinding, matterBinding("cases/open")]) {
        await expect(
          runMatterGuarded(op!, opCtx, { slug: "cases/open" }, undefined, [], binding)
        ).rejects.toMatchObject({ code: "permission_denied" });
      }
    }
  });

  test("facts are never extracted from private areas", () => {
    const parsed = { type: "note" as never, compiled_truth: "x".repeat(200), frontmatter: {} };
    expect(isFactsBackstopEligible(`${OWN_AREA}wiki/agents/9/entwurf`, parsed)).toEqual({
      ok: false,
      reason: "private_area",
    });
    expect(isFactsBackstopEligible("notes/public", parsed)).toEqual({ ok: true });
  });
});

// ── End to end through the subagent handler ─────────────────

type FakeResponse = Partial<Anthropic.Message> & { content: Anthropic.Message["content"] };

class FakeMessagesClient implements MessagesClient {
  constructor(private responses: FakeResponse[]) {}
  async create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    const r = this.responses.shift();
    if (!r) throw new Error("out of scripted responses");
    return {
      id: "msg",
      type: "message",
      role: "assistant",
      model: params.model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 } as never,
      ...r,
    } as Anthropic.Message;
  }
}

async function runSubagent(data: Record<string, unknown>, slugOf: (id: number) => string) {
  const queue = new MinionQueue(engine);
  const job = await queue.add("subagent", data, {}, { allowProtectedSubmit: true });
  const slug = slugOf(job.id);
  const client = new FakeMessagesClient([
    {
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "brain_put_page",
          input: { slug, content: "---\ntitle: Notiz\n---\nAus der Akte kopiert" },
        } as never,
      ],
      stop_reason: "tool_use" as never,
    },
    { content: [{ type: "text", text: "fertig" }] as never, stop_reason: "end_turn" },
  ]);
  const handler = makeSubagentHandler({ engine, client, config });
  const ac = new AbortController();
  const jobCtx: MinionJobContext = {
    id: job.id,
    name: job.name,
    data,
    attempts_made: 0,
    signal: ac.signal,
    shutdownSignal: new AbortController().signal,
    async updateProgress() {},
    async updateTokens() {},
    async log() {},
    async isActive() {
      return true;
    },
    async readInbox() {
      return [];
    },
  };
  await handler(jobCtx);
  const execs = await engine.executeRaw<{ status: string; error: string | null }>(
    `SELECT status, error FROM subagent_tool_executions WHERE job_id = $1`,
    [job.id]
  );
  return { id: job.id, slug, execs };
}

describe("subagent handler", () => {
  test("a web user's run without a matter writes into the owner's private area", async () => {
    const r = await runSubagent(
      { prompt: "notiere", _owner_user_id: "u-3" },
      (id) => `wiki/agents/${id}/notiz`
    );
    expect(r.execs.map((e) => e.status)).toEqual(["complete"]);
    expect(await engine.getPage(r.slug)).toBeNull();
    const f = await fm(`${privateAreaPrefix("u-3")}${r.slug}`);
    expect(f?.visibility).toBe("private");
    expect(f?.agent_job_id).toBe(r.id);
  });

  test("a run bound to a matter writes a page of that matter", async () => {
    const r = await runSubagent(
      { prompt: "notiere", _owner_user_id: "u-3", _case_slug: "cases/second" },
      (id) => `wiki/agents/${id}/akte`
    );
    expect(r.execs.map((e) => e.status)).toEqual(["complete"]);
    expect((await fm(r.slug))?.case_slug).toBe("cases/second");
  });

  test("a stamped run without owner and matter cannot write", async () => {
    const r = await runSubagent(
      { prompt: "notiere", _matter_scope: WALLED },
      (id) => `wiki/agents/${id}/weg`
    );
    expect(r.execs.map((e) => e.status)).toEqual(["failed"]);
    expect(await engine.getPage(r.slug)).toBeNull();
  });
});
