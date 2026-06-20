import { describe, expect, it } from "vitest";
import { buildCaseFromIntake } from "./intake-conversion";
import type { IntakeRequestFrontmatter } from "./intake";

function intake(overrides: Partial<IntakeRequestFrontmatter> = {}) {
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
      ...overrides,
    },
  } as const;
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
});
