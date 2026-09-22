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

  it("a non-destructive tool starts executing immediately", () => {
    const calls = detectToolCalls('[TOOL:search_cases query="Müller"]', GLOBAL_CTX);
    expect(calls[0].status).toBe("executing");
    expect(calls[0].requiresConfirmation).toBeFalsy();
  });
});
