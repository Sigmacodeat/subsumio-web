import { describe, expect, test } from "vitest";

import {
  automationToFrontmatter,
  buildAutomationSlug,
  fmToAutomation,
  interpolateTemplate,
  ruleMatches,
  ruleSendsExternally,
  type AutomationRule,
} from "./automation";

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    slug: "automation-test-1",
    name: "Test",
    enabled: true,
    event: "booking.created",
    action: { type: "notify", title: "Neue Buchung {name}" },
    created_at: "2026-09-22T10:00:00Z",
    created_by: "test@kanzlei.at",
    ...overrides,
  };
}

describe("interpolateTemplate", () => {
  test("ersetzt einfache und verschachtelte Platzhalter", () => {
    expect(
      interpolateTemplate("Hallo {name}, Akte {case.slug}", {
        name: "Muster",
        case: { slug: "26-0001" },
      })
    ).toBe("Hallo Muster, Akte 26-0001");
  });

  test("fehlende Felder werden zu leerem String", () => {
    expect(interpolateTemplate("{a}-{b}", { a: "x" })).toBe("x-");
  });

  test("undefined/null Zwischenpfade sind sicher", () => {
    expect(interpolateTemplate("{deep.down.value}", { deep: null })).toBe("");
  });
});

describe("ruleMatches", () => {
  test("gleiches Event ohne Filter matcht", () => {
    expect(ruleMatches(rule(), "booking.created", {})).toBe(true);
  });

  test("anderes Event matcht nicht", () => {
    expect(ruleMatches(rule(), "document.uploaded", {})).toBe(false);
  });

  test("deaktivierte Regel matcht nie", () => {
    expect(ruleMatches(rule({ enabled: false }), "booking.created", {})).toBe(false);
  });

  test("Filter müssen alle passen", () => {
    const r = rule({ filters: { channel: "whatsapp", priority: "high" } });
    expect(ruleMatches(r, "booking.created", { channel: "whatsapp", priority: "high" })).toBe(true);
    expect(ruleMatches(r, "booking.created", { channel: "whatsapp", priority: "low" })).toBe(false);
    expect(ruleMatches(r, "booking.created", { channel: "whatsapp" })).toBe(false);
  });
});

describe("buildAutomationSlug", () => {
  test("umlaute und Sonderzeichen werden normalisiert", () => {
    expect(buildAutomationSlug("Buchung überfällig!")).toMatch(
      /^automation-buchung-ueberfaellig-[a-z0-9]+$/
    );
  });

  test("leerer Name fällt auf Fallback zurück", () => {
    expect(buildAutomationSlug("!!!")).toMatch(/^automation-regel-[a-z0-9]+$/);
  });
});

describe("fmToAutomation", () => {
  test("roundtrip frontmatter → rule", () => {
    const r = rule({ filters: { channel: "email" } });
    const page = {
      slug: r.slug,
      title: r.name,
      frontmatter: automationToFrontmatter(r),
    };
    const parsed = fmToAutomation(page);
    expect(parsed).not.toBeNull();
    expect(parsed?.event).toBe("booking.created");
    expect(parsed?.action.type).toBe("notify");
    expect(parsed?.filters?.channel).toBe("email");
  });

  test("unbekanntes Event → null", () => {
    expect(
      fmToAutomation({
        slug: "x",
        title: "x",
        frontmatter: { type: "automation", event: "bogus", action: { type: "notify" } },
      })
    ).toBeNull();
  });

  test("unbekannter Action-Typ → null", () => {
    expect(
      fmToAutomation({
        slug: "x",
        title: "x",
        frontmatter: { type: "automation", event: "booking.created", action: { type: "bogus" } },
      })
    ).toBeNull();
  });

  test("Besitzer und Pausengrund überleben den Roundtrip; Neuspeichern leert die Pause", () => {
    const paused = rule({ owner_user_id: undefined, paused_reason: "owner_missing" });
    const fm = automationToFrontmatter(paused);
    expect(fm.status_message).toBe("Besitzer fehlt — bitte neu speichern");
    expect(fmToAutomation({ slug: "x", title: "x", frontmatter: fm })?.paused_reason).toBe(
      "owner_missing"
    );
    const resaved = automationToFrontmatter({
      ...paused,
      owner_user_id: "u1",
      paused_reason: undefined,
    });
    // Merge updates cannot drop keys: the pause is cleared explicitly.
    expect(resaved).toMatchObject({
      owner_user_id: "u1",
      paused_reason: null,
      status_message: null,
    });
    const parsed = fmToAutomation({ slug: "x", title: "x", frontmatter: resaved });
    expect(parsed?.owner_user_id).toBe("u1");
    expect(parsed?.paused_reason).toBeUndefined();
  });

  test("nur E-Mail-Aktionen senden Inhalte nach außen", () => {
    expect(ruleSendsExternally(rule({ action: { type: "send_mail", recipient: "a@b.at" } }))).toBe(
      true
    );
    for (const type of ["notify", "create_task", "start_workflow"] as const) {
      expect(ruleSendsExternally(rule({ action: { type } }))).toBe(false);
    }
  });

  test("fremder Seitentyp → null", () => {
    expect(fmToAutomation({ slug: "x", title: "x", frontmatter: { type: "case" } })).toBeNull();
  });
});
