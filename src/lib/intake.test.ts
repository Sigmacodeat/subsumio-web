import { describe, expect, it, vi } from "vitest";
import { buildIntakeRequest, hashContact, intakeFromPage, writeIntakeRequest } from "./intake";
import type { BrainPage } from "./types";

describe("intake requests", () => {
  it("builds a Brain-page-backed intake request", () => {
    const intake = buildIntakeRequest(
      {
        source: "whatsapp",
        summary: "Ich habe eine Kündigung erhalten, Frist läuft bald.",
        clientName: "Test Mandant",
        phoneHash: "phone-hash",
        sourceEventSlug: "legal/conversations/whatsapp/wamid-test",
      },
      new Date("2026-06-20T12:00:00.000Z")
    );

    expect(intake.slug).toBe("legal/intake/2026-06-20/test-mandant-1781956800000");
    expect(intake.frontmatter).toMatchObject({
      type: "intake_request",
      source: "whatsapp",
      status: "new",
      client_name: "Test Mandant",
      phone_hash: "phone-hash",
      conflict_check_status: "pending",
      source_event_slug: "legal/conversations/whatsapp/wamid-test",
    });
    expect(intake.frontmatter.missing_documents).toContain("ausgangsdokument");
  });

  it("hashes contact data deterministically", () => {
    expect(hashContact(" TEST@example.com ")).toBe(hashContact("test@example.com"));
  });

  it("writes intake requests as mergeable brain pages", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const intake = buildIntakeRequest({ source: "manual", summary: "Neue Anfrage" });

    await writeIntakeRequest("brain-1", intake, fetchImpl as unknown as typeof fetch);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.type).toBe("intake_request");
    expect(body.merge).toBe(true);
  });

  it("parses intake pages and ignores other page types", () => {
    const page = {
      slug: "legal/intake/x",
      title: "Intake",
      content: "Hallo",
      frontmatter: buildIntakeRequest({ source: "web", summary: "Hallo" }).frontmatter,
    } as BrainPage;

    expect(intakeFromPage(page)?.frontmatter.type).toBe("intake_request");
    expect(intakeFromPage({ ...page, frontmatter: { type: "legal_case" } } as BrainPage)).toBeNull();
  });
});
