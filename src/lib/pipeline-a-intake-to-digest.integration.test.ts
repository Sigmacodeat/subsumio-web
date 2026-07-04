// @vitest-environment node
/**
 * Pipeline A: Mandantsaufnahme → Case → Deadlines → Digest
 * =========================================================
 * Integration test chaining 6 modules through a real workflow:
 *   1. buildIntakeRequest  — construct intake from client input
 *   2. buildCaseFromIntake — convert intake → legal_case page
 *   3. detectDeadlines     — AI deadline extraction from case content
 *   4. calculateDeadline   — statutory deadline computation (§ 517 ZPO)
 *   5. computeVorfrist     — Vorfrist calculation with holiday roll-forward
 *   6. computeDeadlineStatus — digest classification (overdue/critical/warning/vorfrist)
 *
 * No vi.mock — all modules use their real implementations.
 * The chain verifies that data flows correctly from intake creation
 * all the way to digest classification.
 */

import { describe, test, expect } from "vitest";
import { buildIntakeRequest, type IntakeRequestInput } from "@/lib/intake";
import { buildCaseFromIntake } from "@/lib/intake-conversion";
import { detectDeadlines } from "@/lib/ai-deadline-detect";
import {
  calculateDeadline,
  computeDeadlineStatus,
  DEADLINE_RULES,
  type DeadlineEntry,
} from "@/lib/legal-deadlines";
import { computeVorfrist, isVorfristReached, daysUntilVorfrist } from "@/lib/legal/vorfrist";

// ── Fixtures ───────────────────────────────────────────────────────────

const INTAKE_INPUT: IntakeRequestInput = {
  source: "portal",
  summary:
    "Mandant Müller GmbH meldet Lieferverzug durch Schuldner AG. Vertrag vom 15.03.2025, Frist zur Mängelrüge am 15.06.2025 verstrichen. Berufungsfrist gegen Ersturteil bis 15.04.2026.",
  clientName: "Müller GmbH",
  legalArea: "Zivilrecht",
  missingDocuments: ["Vertrag", "Lieferschein", "Mahnung"],
};

const FIXED_DATE = new Date("2026-01-15T10:00:00Z");

// ── Pipeline ───────────────────────────────────────────────────────────

describe("Pipeline A: Intake → Case → Deadlines → Digest", () => {
  test("full pipeline: intake creation through digest classification", () => {
    // ── Stage 1: Build Intake Request ──────────────────────────────────
    const intake = buildIntakeRequest(INTAKE_INPUT, FIXED_DATE);

    expect(intake.slug).toContain("legal/intake/2026-01-15");
    expect(intake.frontmatter.type).toBe("intake_request");
    expect(intake.frontmatter.status).toBe("new");
    expect(intake.frontmatter.client_name).toBe("Müller GmbH");
    expect(intake.frontmatter.conflict_check_status).toBe("pending");
    expect(intake.frontmatter.missing_documents).toEqual(["Vertrag", "Lieferschein", "Mahnung"]);

    // ── Stage 2: Convert Intake → Case ────────────────────────────────
    const casePage = buildCaseFromIntake(
      {
        slug: intake.slug,
        title: intake.title,
        content: intake.content,
        frontmatter: intake.frontmatter,
      },
      {
        caseNumber: "2026-001",
        title: "Müller GmbH vs. Schuldner AG — Lieferverzug",
        priority: "high",
        portalEnabled: true,
        convertedBy: "lawyer@kanzlei.de",
        at: FIXED_DATE,
      }
    );

    expect(casePage.type).toBe("legal_case");
    expect(casePage.frontmatter.case_number).toBe("2026-001");
    expect(casePage.frontmatter.status).toBe("open");
    expect(casePage.frontmatter.priority).toBe("high");
    expect(casePage.frontmatter.client_name).toBe("Müller GmbH");
    expect(casePage.frontmatter.source_intake_slug).toBe(intake.slug);
    expect(casePage.frontmatter.portal_enabled).toBe(true);
    expect(casePage.content).toContain("Mandant Müller GmbH");
    expect(casePage.frontmatter.tasks).toHaveLength(3);
    expect(casePage.frontmatter.tasks?.[0].text).toContain("Vertrag");

    // ── Stage 3: AI Deadline Detection from case content ──────────────
    const detected = detectDeadlines(intake.content);

    // The text contains "Berufungsfrist ... bis 15.04.2026" — should match
    // both the zpo_berufung rule (template) and absolute_date_de rule (date)
    const berufungDetected = detected.find(
      (d) => d.matchedRule === "zpo_berufung" || d.date === "2026-04-15"
    );
    expect(berufungDetected).toBeDefined();
    expect(berufungDetected!.confidence).toBe("high");
    // The absolute_date_de rule should extract the date
    const dateDetected = detected.find((d) => d.date === "2026-04-15");
    expect(dateDetected).toBeDefined();

    // ── Stage 4: Calculate statutory deadline (Berufungsfrist) ────────
    const berufungRule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung");
    expect(berufungRule).toBeDefined();

    // Use a future start date so the calculated deadline isn't already overdue
    const futureStart = new Date();
    futureStart.setUTCFullYear(futureStart.getUTCFullYear() + 1);
    const futureStartISO = futureStart.toISOString().slice(0, 10);

    const deadline = calculateDeadline(berufungRule!, futureStartISO, "BY");
    expect(deadline.rule_key).toBe("zpo-berufung");
    expect(deadline.law).toBe("§ 517 ZPO");
    expect(deadline.status).not.toBe("overdue");
    expect(deadline.review_status).toBe("unreviewed");
    expect(deadline.audit_log).toHaveLength(1);
    expect(deadline.audit_log![0].action).toBe("created");

    // ── Stage 5: Compute Vorfrist (7 days before deadline) ────────────
    const vorfristDate = computeVorfrist(deadline.due_date, 7, "BY", "DE");
    expect(vorfristDate).toBeTruthy();

    // Vorfrist should be ~7 days before the deadline
    const deadlineDate = new Date(deadline.due_date);
    const vorfristParsed = new Date(vorfristDate!);
    const diffDays = Math.round(
      (deadlineDate.getTime() - vorfristParsed.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBeGreaterThanOrEqual(5);
    expect(diffDays).toBeLessThanOrEqual(8);

    // ── Stage 6: Digest classification ────────────────────────────────
    const status = computeDeadlineStatus(deadline.due_date, undefined, vorfristDate ?? undefined);

    // The deadline is in the future from our test date (2026-01-15)
    expect(["pending", "warning", "critical", "vorfrist"]).toContain(status);

    // Verify Vorfrist interaction
    const vorfristReached = isVorfristReached(vorfristDate, "2026-01-15");
    const daysToVorfrist = daysUntilVorfrist(vorfristDate, "2026-01-15");

    if (status === "vorfrist") {
      expect(vorfristReached).toBe(true);
      expect(daysToVorfrist!).toBeLessThanOrEqual(0);
    } else {
      expect(status).toBe("pending");
    }

    // ── Cross-stage invariant: deadline date is valid ISO ─────────────
    expect(deadline.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(vorfristDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("pipeline handles intake with no detectable deadlines gracefully", () => {
    const intake = buildIntakeRequest({
      source: "manual",
      summary: "Allgemeine Beratung zur Vertragsgestaltung.",
      clientName: "Test Client",
      legalArea: "Vertragsrecht",
    });

    const casePage = buildCaseFromIntake(
      {
        slug: intake.slug,
        title: intake.title,
        content: intake.content,
        frontmatter: intake.frontmatter,
      },
      { at: FIXED_DATE }
    );

    expect(casePage.type).toBe("legal_case");

    const detected = detectDeadlines(intake.content);
    expect(detected).toEqual([]);

    // No deadlines → no digest entries
    // This verifies the pipeline doesn't break on empty input
  });

  test("pipeline: multiple deadlines from one case, all reach digest classification", () => {
    const intake = buildIntakeRequest({
      source: "portal",
      summary:
        "Klageerwiderung bis 20.02.2026. Berufung gegen Ersturteil bis 15.04.2026. Zahlungsfrist 31.03.2026.",
      clientName: "Multi Deadline GmbH",
      legalArea: "Zivilrecht",
    });

    const casePage = buildCaseFromIntake(
      {
        slug: intake.slug,
        title: intake.title,
        content: intake.content,
        frontmatter: intake.frontmatter,
      },
      { at: FIXED_DATE }
    );

    expect(casePage.type).toBe("legal_case");

    const detected = detectDeadlines(intake.content);
    expect(detected.length).toBeGreaterThanOrEqual(2);

    // Classify each detected deadline
    const classifications = detected
      .map((d) => {
        if (!d.date) return null;
        const vorfrist = computeVorfrist(d.date, 7, "BY", "DE");
        const status = computeDeadlineStatus(d.date, undefined, vorfrist ?? undefined);
        return { date: d.date, status, vorfrist };
      })
      .filter(Boolean);

    expect(classifications.length).toBeGreaterThanOrEqual(2);

    // All classifications should be valid status values
    for (const c of classifications) {
      expect(["overdue", "critical", "warning", "pending", "vorfrist"]).toContain(c!.status);
    }
  });

  test("pipeline: intake conversion preserves missing documents as tasks", () => {
    const intake = buildIntakeRequest({
      source: "whatsapp",
      summary: "Kündigung erhalten, Frist bis 15.03.2026.",
      clientName: "Max Muster",
      legalArea: "Arbeitsrecht",
      missingDocuments: ["Kündigung", "Vollmacht", "Zustellnachweis"],
    });

    const casePage = buildCaseFromIntake(
      {
        slug: intake.slug,
        title: intake.title,
        content: intake.content,
        frontmatter: intake.frontmatter,
      },
      { at: FIXED_DATE }
    );

    // Tasks should mirror missing documents
    expect(casePage.frontmatter.tasks).toHaveLength(3);
    expect(casePage.frontmatter.tasks?.[0].text).toContain("Kündigung");
    expect(casePage.frontmatter.tasks?.[1].text).toContain("Vollmacht");
    expect(casePage.frontmatter.tasks?.[2].text).toContain("Zustellnachweis");
    expect(casePage.frontmatter.tasks?.every((t) => t.done === false)).toBe(true);

    // AI detection should also find the deadline in the summary
    const detected = detectDeadlines(intake.content);
    const fristDetected = detected.find((d) => d.date === "2026-03-15");
    expect(fristDetected).toBeDefined();
    expect(fristDetected!.type).toBe("absolute_deadline");
  });
});
