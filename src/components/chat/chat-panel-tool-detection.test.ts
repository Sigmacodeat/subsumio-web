import { describe, it, expect } from "vitest";
import { detectNativeToolCalls, detectToolCalls, resolveToolCalls } from "./chat-panel";

const GLOBAL_CTX = { type: "global" as const };

describe("detectNativeToolCalls (structured tool_call events)", () => {
  it("turns a structured call into the same ToolCall the marker parser yields", () => {
    const native = detectNativeToolCalls(
      [
        {
          id: "call_1",
          name: "search_deadlines",
          args: { case_slug: "cases/1", status: "critical" },
        },
      ],
      GLOBAL_CTX
    );
    const marker = detectToolCalls(
      '[TOOL:search_deadlines case_slug="cases/1" status="critical"]',
      GLOBAL_CTX
    );
    expect(native).toHaveLength(1);
    expect(native[0].id).toBe("call_1");
    expect(native[0].type).toBe("search_deadlines");
    expect(native[0].params).toEqual(marker[0].params);
    expect(native[0].status).toBe(marker[0].status);
    expect(native[0].requiresConfirmation).toBe(marker[0].requiresConfirmation);
  });

  it("keeps the model's order across several calls", () => {
    const calls = detectNativeToolCalls(
      [
        { id: "a", name: "search_cases", args: { query: "Müller" } },
        { id: "b", name: "navigate", args: { route: "/dashboard/cases" } },
        { id: "c", name: "create_task", args: { case_slug: "cases/1", title: "Schriftsatz" } },
      ],
      GLOBAL_CTX
    );
    expect(calls.map((c) => c.type)).toEqual(["search_cases", "navigate", "create_task"]);
    expect(calls[2].status).toBe("pending");
    expect(calls[2].requiresConfirmation).toBe(true);
  });

  it("applies schema defaults and typed arguments", () => {
    const calls = detectNativeToolCalls(
      [
        { id: "1", name: "search_deadlines", args: {} },
        {
          id: "2",
          name: "time_entry",
          args: { case_slug: "cases/1", description: "Aktenanalyse", hours: 1.5 },
        },
        {
          id: "3",
          name: "tabular_review",
          args: { questions: ["Kündigungsfrist?", "Haftung?"], document_slugs: ["docs/a"] },
        },
        {
          id: "4",
          name: "render_template",
          args: { template_query: "Klage", create_document: true },
        },
      ],
      GLOBAL_CTX
    );
    expect(calls[0].params).toEqual({ case_slug: undefined, status: "open" });
    expect(calls[1].params).toMatchObject({ hours: 1.5, activity_type: "other" });
    expect(calls[2].params).toMatchObject({
      questions: ["Kündigungsfrist?", "Haftung?"],
      document_slugs: ["docs/a"],
    });
    expect(calls[3].params).toMatchObject({ create_document: true });
  });

  it("drops calls with unknown names, wrong types or missing required arguments", () => {
    const calls = detectNativeToolCalls(
      [
        { id: "1", name: "delete_everything", args: { id: "1" } },
        { id: "2", name: "send_email", args: { to: ["x@example.com"], subject: "Hi", text: "…" } },
        {
          id: "3",
          name: "time_entry",
          args: { case_slug: "cases/1", description: "x", hours: "viele" },
        },
        { id: "4", name: "create_case", args: { client_name: "Max Mustermann" } },
        { id: "5", name: "navigate", args: { route: 42 } },
      ],
      GLOBAL_CTX
    );
    expect(calls).toHaveLength(0);
  });

  it("auto-injects case_slug from the open matter before validation", () => {
    const ctx = { type: "case" as const, caseSlug: "cases/mueller" };
    const calls = detectNativeToolCalls(
      [
        { id: "1", name: "case_summary", args: {} },
        {
          id: "2",
          name: "create_deadline",
          args: { title: "Berufungsfrist", due_date: "2026-10-15" },
        },
        { id: "3", name: "email_draft", args: { subject: "Status" } },
      ],
      ctx
    );
    expect(calls.map((c) => c.params.case_slug)).toEqual([
      "cases/mueller",
      "cases/mueller",
      "cases/mueller",
    ]);
  });

  it("tolerates a call without arguments", () => {
    const calls = detectNativeToolCalls(
      [{ id: "1", name: "search_tasks", args: undefined as unknown as Record<string, unknown> }],
      GLOBAL_CTX
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({ status: "open", priority: "all" });
  });
});

describe("resolveToolCalls (native vs. marker fallback)", () => {
  it("uses structured calls when the engine confirmed native tool use", () => {
    const calls = resolveToolCalls(
      {
        answer: "Ich suche die Akte.",
        tools_supported: true,
        tool_calls: [{ id: "1", name: "search_cases", args: { query: "Müller" } }],
      },
      GLOBAL_CTX
    );
    expect(calls.map((c) => c.type)).toEqual(["search_cases"]);
  });

  it("ignores marker text in the answer when tool use is native (quotes are not actions)", () => {
    const calls = resolveToolCalls(
      {
        answer: 'Die Syntax wäre [TOOL:create_case title="Klage"] — so sah es früher aus.',
        tools_supported: true,
        tool_calls: [],
      },
      GLOBAL_CTX
    );
    expect(calls).toHaveLength(0);
  });

  it("falls back to the marker regex when the engine reports no tool use", () => {
    const calls = resolveToolCalls(
      { answer: '[TOOL:search_cases query="Müller"]', tools_supported: false },
      GLOBAL_CTX
    );
    expect(calls.map((c) => c.type)).toEqual(["search_cases"]);
  });

  it("falls back to the marker regex when an older engine says nothing", () => {
    const calls = resolveToolCalls(
      { answer: '[TOOL:navigate route="/dashboard/deadlines"]' },
      GLOBAL_CTX
    );
    expect(calls.map((c) => c.type)).toEqual(["navigate"]);
  });
});

describe("detectToolCalls", () => {
  it("parses a marker regardless of attribute order", () => {
    // The old per-tool regexes each hard-coded one attribute order; this is
    // the exact bug that motivated the generic parser — the model is free to
    // emit attributes in whatever order it generates them in.
    const forward = detectToolCalls(
      '[TOOL:search_deadlines case_slug="cases/1" status="critical"]',
      GLOBAL_CTX
    );
    const reversed = detectToolCalls(
      '[TOOL:search_deadlines status="critical" case_slug="cases/1"]',
      GLOBAL_CTX
    );
    expect(forward).toHaveLength(1);
    expect(reversed).toHaveLength(1);
    expect(forward[0].params).toEqual(reversed[0].params);
    expect(forward[0].params).toEqual({ case_slug: "cases/1", status: "critical" });
  });

  it("finds multiple different tools in the order they appear", () => {
    const answer = [
      'Zuerst [TOOL:search_cases query="Müller"] und dann',
      '[TOOL:navigate route="/dashboard/cases"] zum Anzeigen.',
    ].join(" ");
    const calls = detectToolCalls(answer, GLOBAL_CTX);
    expect(calls.map((c) => c.type)).toEqual(["search_cases", "navigate"]);
  });

  it("skips a marker missing a required attribute", () => {
    const calls = detectToolCalls('[TOOL:create_case client_name="Max Mustermann"]', GLOBAL_CTX);
    expect(calls).toHaveLength(0);
  });

  it("skips an unknown tool name", () => {
    const calls = detectToolCalls('[TOOL:delete_everything id="1"]', GLOBAL_CTX);
    expect(calls).toHaveLength(0);
  });

  it("auto-injects case_slug from context for matter-scoped tools", () => {
    const calls = detectToolCalls('[TOOL:email_draft subject="Status Update"]', {
      type: "case",
      caseSlug: "cases/mueller",
    });
    expect(calls[0].params.case_slug).toBe("cases/mueller");
  });

  it("marks write tools as pending confirmation, not auto-executing", () => {
    const calls = detectToolCalls(
      '[TOOL:create_task case_slug="cases/1" title="Schriftsatz entwerfen"]',
      GLOBAL_CTX
    );
    expect(calls[0].status).toBe("pending");
    expect(calls[0].requiresConfirmation).toBe(true);
  });

  it("parses the new create_task/create_deadline/create_contact/request_signature markers", () => {
    const calls = detectToolCalls(
      [
        '[TOOL:create_task case_slug="cases/1" title="Fristenkontrolle" due_date="2026-10-01"]',
        '[TOOL:create_deadline case_slug="cases/1" title="Berufungsfrist" due_date="2026-10-15"]',
        '[TOOL:create_contact name="Max Mustermann" role="client" email="max@example.com"]',
        '[TOOL:request_signature case_slug="cases/1" document_name="NDA" recipient_name="Max Mustermann" template="nda"]',
      ].join(" "),
      GLOBAL_CTX
    );
    expect(calls.map((c) => c.type)).toEqual([
      "create_task",
      "create_deadline",
      "create_contact",
      "request_signature",
    ]);
    expect(calls[0].params).toMatchObject({ due_date: "2026-10-01" });
    expect(calls[3].params).toMatchObject({ template: "nda" });
  });

  it("auto-injects case_slug into create_task/create_deadline/request_signature when the model omits it", () => {
    // These three require case_slug in their zod schema, but transform()
    // used to also require it as a raw marker attribute — which made the
    // MATTER_SCOPED_TOOLS auto-injection below unreachable: the marker was
    // already dropped as "missing required attribute" before auto-injection
    // ever ran, so a model that (correctly) relied on the open matter, the
    // same way it's allowed to for email_draft, silently lost the tool call.
    const ctx = { type: "case" as const, caseSlug: "cases/mueller" };
    const task = detectToolCalls('[TOOL:create_task title="Schriftsatz entwerfen"]', ctx);
    expect(task[0]?.params.case_slug).toBe("cases/mueller");
    const deadline = detectToolCalls(
      '[TOOL:create_deadline title="Berufungsfrist" due_date="2026-10-15"]',
      ctx
    );
    expect(deadline[0]?.params.case_slug).toBe("cases/mueller");
    const signature = detectToolCalls(
      '[TOOL:request_signature document_name="NDA" recipient_name="Max Mustermann"]',
      ctx
    );
    expect(signature[0]?.params.case_slug).toBe("cases/mueller");
  });

  it("a non-destructive tool starts executing immediately", () => {
    const calls = detectToolCalls('[TOOL:search_cases query="Müller"]', GLOBAL_CTX);
    expect(calls[0].status).toBe("executing");
    expect(calls[0].requiresConfirmation).toBeFalsy();
  });

  it("paid or run-starting tools from a marker wait for a click (prompt-injection guard)", () => {
    const markers = [
      '[TOOL:email_draft to="x@example.com" subject="Hallo"]',
      '[TOOL:document_summary document_slug="docs/a"]',
      '[TOOL:precedent_search query="Mietrecht"]',
      '[TOOL:tabular_review document_slugs="docs/a" questions="Partei?"]',
      '[TOOL:translate_text text="Hallo" target_language="en"]',
      '[TOOL:client_update case_slug="cases/1"]',
    ];
    for (const marker of markers) {
      const calls = detectToolCalls(marker, GLOBAL_CTX);
      expect(calls, marker).toHaveLength(1);
      for (const call of calls) {
        expect(call.status, marker).toBe("pending");
        expect(call.requiresConfirmation, marker).toBe(true);
      }
    }
  });

  it("only the free read-only allowlist auto-executes", async () => {
    const { AUTO_EXECUTE_TOOLS, DESTRUCTIVE_TOOLS } = await import("./chat-types");
    for (const tool of AUTO_EXECUTE_TOOLS) expect(DESTRUCTIVE_TOOLS.has(tool)).toBe(false);
    for (const paid of [
      "email_draft",
      "document_summary",
      "tabular_review",
      "precedent_search",
      "deadline_extract",
      "obligation_extract",
      "meeting_tasks",
      "translate_text",
      "client_update",
      "deep_analysis",
      "case_investigation",
    ]) {
      expect((AUTO_EXECUTE_TOOLS as ReadonlySet<string>).has(paid)).toBe(false);
    }
  });
});
