import { describe, expect, it } from "vitest";
import { buildCaseFromIntake, type IntakeConversionInput } from "./intake-conversion";
import { defaultAcceptanceWorkflow } from "./intake-acceptance";
import type { IntakeRequestFrontmatter } from "./intake";

function intake(overrides: Partial<IntakeRequestFrontmatter> = {}): IntakeConversionInput {
  const now = "2026-06-20T10:00:00.000Z";
  return {
    slug: "legal/intake/2026-06-20/max",
    title: "Intake: Max Muster",
    content: "Kündigung erhalten",
    frontmatter: {
      type: "intake_request",
      source: "whatsapp",
      status: "accepted",
      client_name: "Max Muster",
      phone_hash: "hash",
      legal_area: "Arbeitsrecht",
      summary: "Mandant hat eine Kündigung erhalten.",
      missing_documents: ["Kündigung", "Vollmacht"],
      conflict_check_status: "clear",
      source_event_slug: "legal/conversations/whatsapp/wamid",
      created_at: now,
      updated_at: now,
      acceptance: {
        ...defaultAcceptanceWorkflow(),
        conflict_check: {
          ...defaultAcceptanceWorkflow().conflict_check,
          status: "clear",
        },
        kyc: { ...defaultAcceptanceWorkflow().kyc, status: "verified" },
        poa: { ...defaultAcceptanceWorkflow().poa, status: "signed" },
        engagement_letter: { status: "sent" },
      },
      ...overrides,
    },
  };
}

describe("buildCaseFromIntake", () => {
  it("builds a legal_case page from intake data", () => {
    const page = buildCaseFromIntake(intake(), {
      at: new Date("2026-06-20T12:00:00.000Z"),
      convertedBy: "lawyer@test",
    });

    expect(page.type).toBe("legal_case");
    expect(page.slug).toContain("legal/cases/2026-");
    expect(page.title).toBe("Max Muster - Arbeitsrecht");
    expect(page.frontmatter).toMatchObject({
      type: "legal_case",
      status: "open",
      priority: "medium",
      client_name: "Max Muster",
      legal_area: "Arbeitsrecht",
      source_intake_slug: "legal/intake/2026-06-20/max",
      source_event_slug: "legal/conversations/whatsapp/wamid",
      converted_from_intake_by: "lawyer@test",
    });
    expect(page.content).toContain("Mandant hat eine Kündigung erhalten.");
    expect(page.content).toContain("Kündigung");
    expect(page.frontmatter.tasks).toHaveLength(2);
  });

  it("honors explicit slug, title, priority and portal setting", () => {
    const page = buildCaseFromIntake(intake(), {
      caseSlug: "legal/cases/custom",
      caseNumber: "2026-CUSTOM",
      title: "Custom Case",
      priority: "high",
      portalEnabled: true,
      at: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(page.slug).toBe("legal/cases/custom");
    expect(page.title).toBe("Custom Case");
    expect(page.frontmatter.case_number).toBe("2026-CUSTOM");
    expect(page.frontmatter.priority).toBe("high");
    expect(page.frontmatter.portal_enabled).toBe(true);
  });

  it("carries the opponent, the Streitwert and the engagement letter into the matter (W4-03/W4-13)", () => {
    const page = buildCaseFromIntake(
      intake({
        opponent: "  Gegner GmbH ",
        acceptance: {
          ...defaultAcceptanceWorkflow(),
          engagement_letter: {
            status: "sent",
            document_slug: "intake/legal/intake/2026-06-20/max/engagement-letter-1",
            generated_at: "2026-06-20T11:00:00.000Z",
          },
        },
      }),
      { caseNumber: "MK-26-0042", disputeValue: 12000, at: new Date("2026-06-20T12:00:00.000Z") }
    );
    expect(page.frontmatter.opponent_name).toBe("Gegner GmbH");
    expect(page.frontmatter.dispute_value).toBe(12000);
    expect(page.frontmatter.documents).toEqual([
      expect.objectContaining({
        slug: "intake/legal/intake/2026-06-20/max/engagement-letter-1",
        name: "Mandatsannahme-Schreiben",
        portal_visible: false,
      }),
    ]);
    // A firm prefix yields a lower-case slug the engine stores as such.
    expect(page.slug).toBe("legal/cases/mk-26-0042-max-muster-arbeitsrecht");
    expect(page.frontmatter.case_number).toBe("MK-26-0042");
  });

  it("without opponent or Streitwert no empty fields are written", () => {
    const page = buildCaseFromIntake(intake(), { caseNumber: "26-0001" });
    expect(page.frontmatter).not.toHaveProperty("opponent_name");
    expect(page.frontmatter).not.toHaveProperty("dispute_value");
    expect(page.frontmatter.documents).toEqual([]);
  });
});
