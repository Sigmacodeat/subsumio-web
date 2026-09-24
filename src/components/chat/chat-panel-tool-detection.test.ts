import { describe, it, expect } from "vitest";
import { detectToolCalls } from "./chat-panel";

const GLOBAL_CTX = { type: "global" as const };

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
