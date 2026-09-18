import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/lib/audit-labels";
import { generateTimeSuggestions } from "@/lib/passive-time";
import { activitiesFromAudit, captureRuleFor, caseSlugOf } from "@/lib/time-capture";

const LAWYER = "alice@kanzlei-beispiel.at";

function entry(
  id: string,
  action: string,
  timestamp: string,
  extra: Partial<AuditEntry> = {}
): AuditEntry {
  return { id, action, entityType: "page", timestamp, userEmail: LAWYER, ...extra };
}

describe("captureRuleFor", () => {
  it("counts client work and ignores administration", () => {
    expect(captureRuleFor("legal.schriftsatz")?.type).toBe("drafting");
    expect(captureRuleFor("legal.redline")?.type).toBe("review");
    expect(captureRuleFor("email.send")?.type).toBe("email_sent");
    expect(captureRuleFor("settings.update")).toBeNull();
    expect(captureRuleFor("invoice.create")).toBeNull();
    expect(captureRuleFor("user.login")).toBeNull();
  });
});

describe("caseSlugOf", () => {
  it("reads the matter from details or from the page slug", () => {
    expect(
      caseSlugOf(
        entry("1", "legal.research", "2026-09-18T08:00:00Z", {
          details: { case_slug: "legal/cases/2026-001" },
        })
      )
    ).toBe("legal/cases/2026-001");
    expect(
      caseSlugOf(
        entry("2", "case.update", "2026-09-18T08:00:00Z", {
          entityId: "legal/cases/2026-002/notes/call",
        })
      )
    ).toBe("legal/cases/2026-002");
    expect(caseSlugOf(entry("3", "case.update", "2026-09-18T08:00:00Z"))).toBeUndefined();
  });
});

describe("page writes", () => {
  it("count on a matter, but not bookkeeping pages or pages without a matter", () => {
    const acts = activitiesFromAudit([
      entry("21", "case.create", "2026-09-18T08:00:00Z", {
        details: { type: "legal_deadline", case_slug: "legal/cases/a" },
      }),
      entry("22", "case.create", "2026-09-18T08:01:00Z", {
        details: { type: "time_suggestion", case_slug: "legal/cases/a" },
      }),
      entry("23", "case.update", "2026-09-18T08:02:00Z", { details: { type: "note" } }),
    ]);
    expect(acts.map((a) => a.id)).toEqual(["audit-21"]);
  });
});

describe("audit → suggestions", () => {
  // 10:00–10:30 Vienna (UTC+2 in September) on matter A, one e-mail on B.
  const entries: AuditEntry[] = [
    entry("11", "legal.research", "2026-09-18T08:06:00Z", {
      details: { case_slug: "legal/cases/a" },
    }),
    entry("12", "legal.schriftsatz", "2026-09-18T08:25:00Z", {
      details: { case_slug: "legal/cases/a", title: "Klagebeantwortung" },
    }),
    entry("13", "email.send", "2026-09-18T08:27:00Z", {
      details: { case_slug: "legal/cases/b", subject: "Terminbestätigung" },
    }),
    entry("14", "settings.update", "2026-09-18T08:28:00Z"),
    entry("15", "legal.research", "2026-09-18T08:30:00Z", { userEmail: undefined }),
  ];
  const activities = activitiesFromAudit(entries);
  const suggestions = generateTimeSuggestions(activities, LAWYER);

  it("keeps only client work by a known user", () => {
    expect(activities.map((a) => a.id)).toEqual(["audit-11", "audit-12", "audit-13"]);
  });

  it("never mixes matters in one suggestion", () => {
    expect(suggestions.map((s) => s.case_slug)).toEqual(["legal/cases/a", "legal/cases/b"]);
  });

  it("uses Austrian local time and started tenths of an hour", () => {
    const a = suggestions[0]!;
    // research ends 10:06 (starts 10:00), drafting ends 10:25 → 25 min → 30 min
    expect(a.date).toBe("2026-09-18");
    expect(a.start_time).toBe("10:00");
    expect(a.end_time).toBe("10:25");
    expect(a.duration_minutes).toBe(30);
    expect(a.description).toContain("Klagebeantwortung");
  });

  it("gives the same id on a second run", () => {
    const again = generateTimeSuggestions(activitiesFromAudit(entries), LAWYER);
    expect(again.map((s) => s.id)).toEqual(suggestions.map((s) => s.id));
  });
});
