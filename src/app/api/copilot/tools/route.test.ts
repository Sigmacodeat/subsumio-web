import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const credits = vi.hoisted(() => ({ ok: true, consumed: [] as string[] }));

vi.mock("@/lib/billing/credits", () => ({
  CREDIT_COSTS: { think: 1, document_analysis: 2, subsumption: 3, deadline_detect: 1 },
  ensureTrialCredits: vi.fn(async () => true),
  checkCredits: vi.fn(async () => ({ ok: credits.ok, balance: 0, required: 1 })),
  insufficientCreditsResponse: () =>
    Response.json({ error: "insufficient_credits" }, { status: 402 }),
}));
vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  ENGINE_URL: "http://engine-test:3001",
  recordCreditConsumption: vi.fn(async (_ctx: unknown, op: string) => {
    credits.consumed.push(op);
  }),
  engineHeadersWithCaseJurisdiction: async (h: Record<string, string>) => h,
}));
vi.mock("@/lib/email/mailbox", () => ({
  sendMailboxMessage: vi.fn(async () => ({ id: "m-1", status: "sent" })),
  buildMailDraft: (d: unknown) => d,
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: { id: "u-lawyer", role: "lawyer", email: "l@x.at", brainId: "firm-a" },
        billing: { ownerId: "u-owner", ownerType: "user" },
      };
      return handler(ctx, opts.body!.parse(await req.json()));
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/copilot/tools", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

function sse(answer: string): Response {
  const body = `data: ${JSON.stringify({ chunk: answer })}\n\ndata: ${JSON.stringify({ citations: [] })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

beforeEach(() => {
  credits.ok = true;
  credits.consumed = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/think")) return sse("Sehr geehrte Frau Müller, …");
      if (url.includes("/api/pages/")) {
        return Response.json({
          slug: "cases/mueller",
          title: "Müller",
          content: "Akte",
          frontmatter: {},
        });
      }
      return Response.json({ ok: true, slug: "x" });
    })
  );
});

describe("POST /api/copilot/tools", () => {
  it("runs a write tool only with a confirmation issued for the same parameters", async () => {
    const params = { to: "a@b.at", subject: "Termin", text: "Hallo" };
    expect((await call({ tool: "send_email", params })).status).toBe(403);

    const prepared = await (await call({ tool: "send_email", params, mode: "prepare" })).json();
    const token = prepared.data.confirmation as string;
    expect(
      (
        await call({
          tool: "send_email",
          params: { ...params, to: "evil@x.at" },
          confirmation: token,
        })
      ).status
    ).toBe(403);
    const ok = await call({ tool: "send_email", params, confirmation: token });
    expect(ok.status).toBe(200);
    expect((await call({ tool: "send_email", params, confirmation: token })).status).toBe(403);
  });

  it("runs matter tools when the call names the matter", async () => {
    const res = await call({ tool: "case_summary", params: { case_slug: "cases/mueller" } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("reads the streamed think answer and charges the tool's credits", async () => {
    const res = await call({ tool: "email_draft", params: { subject: "Termin" } });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.draft).toContain("Sehr geehrte Frau Müller");
    expect(credits.consumed).toEqual(["think"]);
  });

  it("refuses a paid tool without credits", async () => {
    credits.ok = false;
    const res = await call({ tool: "email_draft", params: { subject: "Termin" } });
    expect(res.status).toBe(402);
  });

  async function confirmedCall(tool: string, params: Record<string, unknown>) {
    const prepared = await (await call({ tool, params, mode: "prepare" })).json();
    return call({ tool, params, confirmation: prepared.data.confirmation });
  }

  it("appends a task to the case's tasks[] instead of writing a standalone page", async () => {
    const patches: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/pages/") && !init?.method) {
          return Response.json({
            slug: "cases/mueller",
            title: "Müller",
            content: "Akte",
            frontmatter: { tasks: [{ id: "t0", text: "Alt", done: false, createdAt: "x" }] },
          });
        }
        if (init?.method === "POST" && url.endsWith("/api/pages")) {
          const body = JSON.parse(String(init.body));
          patches.push(body);
          return Response.json({ ok: true });
        }
        return Response.json({ ok: true, slug: "x" });
      })
    );
    const res = await confirmedCall("create_task", {
      case_slug: "cases/mueller",
      title: "Schriftsatz entwerfen",
      due_date: "2026-10-15",
    });
    expect(res.status).toBe(200);
    expect(patches).toHaveLength(1);
    expect(patches[0].merge).toBe(true);
    const tasks = (patches[0].frontmatter as { tasks: Array<{ text: string; dueDate?: string }> })
      .tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].text).toBe("Alt");
    expect(tasks[1].text).toBe("Schriftsatz entwerfen");
    // Structured, not embedded in the text — dashboard/tasks/page.tsx sorts
    // and badges on task.dueDate, not on text parsed out of the title.
    expect(tasks[1].dueDate).toBe("2026-10-15");
  });

  it("appends an unreviewed deadline to the case's deadlines[]", async () => {
    const patches: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/pages/") && !init?.method) {
          return Response.json({
            slug: "cases/mueller",
            title: "Müller",
            content: "Akte",
            frontmatter: {},
          });
        }
        if (init?.method === "POST" && url.endsWith("/api/pages")) {
          patches.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        return Response.json({ ok: true, slug: "x" });
      })
    );
    const res = await confirmedCall("create_deadline", {
      case_slug: "cases/mueller",
      title: "Berufungsfrist",
      due_date: "2026-10-15",
    });
    expect(res.status).toBe(200);
    const deadlines = (patches[0].frontmatter as { deadlines: Array<Record<string, unknown>> })
      .deadlines;
    expect(deadlines[0]).toMatchObject({
      title: "Berufungsfrist",
      due_date: "2026-10-15",
      status: "pending",
      review_status: "unreviewed",
    });
  });

  it("creates a contact as a legal_contact page, matching the Kontakte dashboard's type", async () => {
    const creates: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.endsWith("/api/pages")) {
          creates.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        return Response.json({ ok: true, slug: "x" });
      })
    );
    const res = await confirmedCall("create_contact", {
      name: "Max Mustermann",
      role: "client",
      email: "max@example.com",
    });
    expect(res.status).toBe(200);
    expect(creates[0].type).toBe("legal_contact");
    expect((creates[0].frontmatter as Record<string, unknown>).type).toBe("legal_contact");
  });

  it("creates an NDA signature request as a draft with real document text, never sending anything", async () => {
    const creates: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.endsWith("/api/pages")) {
          creates.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        return Response.json({ ok: true, slug: "x" });
      })
    );
    const res = await confirmedCall("request_signature", {
      case_slug: "cases/mueller",
      document_name: "Geheimhaltungsvereinbarung",
      recipient_name: "Max Mustermann",
      recipient_email: "max@example.com",
      template: "nda",
    });
    expect(res.status).toBe(200);
    const fm = creates[0].frontmatter as Record<string, unknown>;
    expect(fm.status).toBe("draft");
    expect(fm.case_slug).toBe("cases/mueller");
    expect(String(creates[0].content)).toContain("GEHEIMHALTUNGSVEREINBARUNG");
    expect(String((await res.json()).display.message)).not.toMatch(/gesendet|versendet/i);
  });

  it("creates automation rules in the one model the UI lists and the cron runs", async () => {
    const creates: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.endsWith("/api/pages")) {
          creates.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        return Response.json({ ok: true, slug: "x" });
      })
    );
    const res = await confirmedCall("create_automation_rule", {
      name: "Mahnung bei Überfälligkeit",
      // The spelling the chat marker used to carry is still understood.
      event: "invoice_overdue",
      action: { type: "send_mail", recipient: "buchhaltung@kanzlei.at" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(creates).toHaveLength(1);
    expect(creates[0].type).toBe("automation");
    const fm = creates[0].frontmatter as Record<string, unknown>;
    expect(fm).toMatchObject({
      event: "invoice.overdue",
      enabled: true,
      // Runs as the user who asked for it, only on events from now on.
      owner_user_id: "u-lawyer",
      actions: [{ type: "send_mail", recipient: "buchhaltung@kanzlei.at" }],
    });
    expect(typeof fm.active_since).toBe("string");

    const bad = await confirmedCall("create_automation_rule", {
      name: "Ohne Empfänger",
      event: "case.created",
      action: { type: "send_mail" },
    });
    expect((await bad.json()).success).toBe(false);
    expect(creates).toHaveLength(1);
  });
});

describe("copilot conflict tools (§ 10 RAO)", () => {
  function conflictEngine(opts: { hit?: boolean; down?: boolean }) {
    const writes: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/api/legal/conflict-check")) {
          if (opts.down) return new Response("down", { status: 503 });
          const { name } = JSON.parse(String(init?.body)) as { name: string };
          return Response.json({
            name,
            severity: opts.hit ? "critical" : "none",
            explanation: opts.hit ? "Interessenkonflikt" : "Kein Konflikt erkennbar.",
            matches: opts.hit
              ? [
                  {
                    slug: "legal/cases/alt",
                    title: "Alte Akte",
                    role: "opponent",
                    matched_name: name,
                    assessment: "critical",
                  },
                ]
              : [],
          });
        }
        if (init?.method === "POST" && url.endsWith("/api/pages")) {
          writes.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        if (url.includes("/api/pages/")) return new Response("{}", { status: 404 });
        return Response.json({ ok: true });
      })
    );
    return writes;
  }

  async function runWrite(tool: string, params: Record<string, unknown>) {
    const prepared = await (await call({ tool, params, mode: "prepare" })).json();
    return call({ tool, params, confirmation: prepared.data.confirmation });
  }

  it("intake_create creates no matter when the client is an opponent elsewhere", async () => {
    const writes = conflictEngine({ hit: true });
    const res = await runWrite("intake_create", { client_name: "Neue GmbH", matter_type: "Zivil" });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("conflict_detected");
    expect(writes.filter((w) => w.type === "legal_case")).toHaveLength(0);
  });

  it("intake_create writes nothing when the conflict check is unavailable", async () => {
    const writes = conflictEngine({ down: true });
    const res = await runWrite("intake_create", { client_name: "Neue GmbH", matter_type: "Zivil" });
    expect((await res.json()).success).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("intake_create creates the matter through the safe path when there is no conflict", async () => {
    const writes = conflictEngine({});
    const res = await runWrite("intake_create", { client_name: "Neue GmbH", matter_type: "Zivil" });
    expect((await res.json()).success).toBe(true);
    const created = writes.find((w) => w.type === "legal_case") as
      | { slug: string; frontmatter: Record<string, unknown> }
      | undefined;
    expect(created?.slug).toMatch(/^legal\/cases\/neue-gmbh-[0-9a-f]{8}$/);
    expect(created?.frontmatter.conflict_status).toBe("conflict_cleared");
  });

  it("create_case goes through the safe path and creates nothing on a conflict", async () => {
    const writes = conflictEngine({ hit: true });
    const res = await runWrite("create_case", { title: "Neu ./. Alt", client_name: "Neue GmbH" });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("conflict_detected");
    expect(writes.filter((w) => w.type === "legal_case")).toHaveLength(0);
  });

  it("create_case creates with a server slug when there is no conflict", async () => {
    const writes = conflictEngine({});
    const res = await runWrite("create_case", { title: "Neu ./. Alt", client_name: "Neue GmbH" });
    expect((await res.json()).success).toBe(true);
    const created = writes.find((w) => w.type === "legal_case") as { slug: string } | undefined;
    expect(created?.slug).toMatch(/^legal\/cases\/neu-alt-[0-9a-f]{8}$/);
  });

  it("conflict_check sends the side and reports an unavailable check as failure", async () => {
    conflictEngine({ down: true });
    const res = await call({ tool: "conflict_check", params: { name: "Meier", side: "opponent" } });
    expect((await res.json()).success).toBe(false);
  });
});
