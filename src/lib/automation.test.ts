import { describe, expect, test } from "vitest";

import {
  applyAutomationEdit,
  automationStateFrontmatter,
  automationToFrontmatter,
  buildAutomationSlug,
  buildNewAutomationRule,
  fmToAutomation,
  floorVerdict,
  interpolateTemplate,
  mergeFiredKeys,
  needsBaseline,
  normalizeTriggerEvent,
  ruleMatches,
  ruleSendsExternally,
  validateActions,
  MAX_FIRED_KEYS,
  type AutomationRule,
  type Observation,
} from "./automation-model";

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    slug: "automation-test-1",
    name: "Test",
    enabled: true,
    event: "booking.created",
    actions: [{ type: "notify", title: "Neue Buchung {name}" }],
    created_at: "2026-09-22T10:00:00Z",
    created_by: "test@kanzlei.at",
    ...overrides,
  };
}

/** How the engine lists a page: type in its own column, not in frontmatter. */
function listed(r: AutomationRule) {
  const { type: _t, ...frontmatter } = automationToFrontmatter(r);
  return { slug: r.slug, title: r.name, type: "automation", frontmatter };
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
    expect(interpolateTemplate("{a.b.c}", { a: null })).toBe("");
  });
});

describe("ruleMatches", () => {
  test("gleiches Event ohne Filter matcht", () => {
    expect(ruleMatches(rule(), "booking.created", {})).toBe(true);
  });

  test("anderes Event matcht nicht", () => {
    expect(ruleMatches(rule(), "case.created", {})).toBe(false);
  });

  test("deaktivierte Regel matcht nie", () => {
    expect(ruleMatches(rule({ enabled: false }), "booking.created", {})).toBe(false);
  });

  test("Filter müssen alle passen", () => {
    const r = rule({ event: "message.received", filters: { channel: "whatsapp" } });
    expect(ruleMatches(r, "message.received", { channel: "whatsapp" })).toBe(true);
    expect(ruleMatches(r, "message.received", { channel: "email" })).toBe(false);
  });

  test("„Frist läuft bald ab“ beachtet den Vorlauf der Regel", () => {
    const r = rule({ event: "deadline.due_soon", within_days: 3 });
    expect(ruleMatches(r, "deadline.due_soon", { days_left: "3" })).toBe(true);
    expect(ruleMatches(r, "deadline.due_soon", { days_left: "5" })).toBe(false);
    // Ohne eigenen Vorlauf gelten 7 Tage.
    const d = rule({ event: "deadline.due_soon" });
    expect(ruleMatches(d, "deadline.due_soon", { days_left: "7" })).toBe(true);
    expect(ruleMatches(d, "deadline.due_soon", { days_left: "8" })).toBe(false);
  });
});

describe("buildAutomationSlug", () => {
  test("umlaute und Sonderzeichen werden normalisiert", () => {
    expect(buildAutomationSlug("Fristen-Überwachung für Müller & Söhne")).toMatch(
      /^automation-fristen-ueberwachung-fuer-mueller-soehne-[a-z0-9]+$/
    );
  });

  test("leerer Name fällt auf Fallback zurück", () => {
    expect(buildAutomationSlug("!!!")).toMatch(/^automation-regel-/);
  });
});

describe("normalizeTriggerEvent", () => {
  test("kanonische Namen und Alt-Schreibweisen", () => {
    expect(normalizeTriggerEvent("invoice.overdue")).toBe("invoice.overdue");
    expect(normalizeTriggerEvent("invoice_overdue")).toBe("invoice.overdue");
    expect(normalizeTriggerEvent("deadline_approaching")).toBe("deadline.due_soon");
    expect(normalizeTriggerEvent("bogus")).toBeNull();
    expect(normalizeTriggerEvent(42)).toBeNull();
  });
});

describe("fmToAutomation", () => {
  test("liest Regeln so, wie die Engine sie listet (Typ nicht im Frontmatter)", () => {
    // Regression: the engine strips `type` from the stored frontmatter. A
    // parser gating on frontmatter.type found no rule at all — nothing ran.
    const parsed = fmToAutomation(listed(rule({ filters: { channel: "email" } })));
    expect(parsed).not.toBeNull();
    expect(parsed?.event).toBe("booking.created");
    expect(parsed?.actions.map((a) => a.type)).toEqual(["notify"]);
    expect(parsed?.filters?.channel).toBe("email");
  });

  test("ältere Regeln mit einer einzelnen `action` bleiben lesbar", () => {
    const parsed = fmToAutomation({
      slug: "x",
      title: "x",
      type: "automation",
      frontmatter: { event: "case.created", action: { type: "send_mail", recipient: "a@b.at" } },
    });
    expect(parsed?.actions).toEqual([{ type: "send_mail", recipient: "a@b.at" }]);
  });

  test("mehrere Aktionen, Vorlauf und Laufzustand überleben den Roundtrip", () => {
    const r = rule({
      event: "deadline.due_soon",
      within_days: 3,
      actions: [
        { type: "create_task", title: "Frist vorbereiten", due_in_days: 2 },
        { type: "set_status", status: "pending" },
      ],
      owner_user_id: "u1",
      active_since: "2026-09-23T08:00:00.000Z",
      baseline_done_for: "2026-09-23T08:00:00.000Z",
      last_run_at: "2026-09-23T09:00:00.000Z",
      last_error: "x: kaputt",
    });
    const parsed = fmToAutomation(listed(r));
    expect(parsed).toMatchObject({
      within_days: 3,
      actions: r.actions,
      owner_user_id: "u1",
      active_since: r.active_since,
      baseline_done_for: r.baseline_done_for,
      last_run_at: r.last_run_at,
      last_error: "x: kaputt",
    });
    // Ein zurückgerollter Stand liest die erste Aktion weiterhin.
    expect(automationToFrontmatter(r).action).toEqual(r.actions[0]);
  });

  test("unbekanntes Event → null", () => {
    expect(
      fmToAutomation({
        slug: "x",
        title: "x",
        type: "automation",
        frontmatter: { event: "bogus", actions: [{ type: "notify" }] },
      })
    ).toBeNull();
  });

  test("unbekannter Action-Typ → null", () => {
    expect(
      fmToAutomation({
        slug: "x",
        title: "x",
        type: "automation",
        frontmatter: { event: "booking.created", actions: [{ type: "bogus" }] },
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
    expect(
      ruleSendsExternally(rule({ actions: [{ type: "send_mail", recipient: "a@b.at" }] }))
    ).toBe(true);
    // Eine E-Mail unter mehreren Aktionen genügt.
    expect(
      ruleSendsExternally(
        rule({ actions: [{ type: "notify" }, { type: "send_mail", recipient: "a@b.at" }] })
      )
    ).toBe(true);
    for (const type of ["notify", "create_task", "start_workflow", "set_status"] as const) {
      expect(ruleSendsExternally(rule({ actions: [{ type }] }))).toBe(false);
    }
  });

  test("fremder Seitentyp → null", () => {
    expect(fmToAutomation({ slug: "x", title: "x", frontmatter: { type: "case" } })).toBeNull();
    expect(fmToAutomation({ ...listed(rule()), type: "automation_rule" })).toBeNull();
  });

  test("gelöschte (tombstoned) Regel → null", () => {
    const page = listed(rule());
    expect(
      fmToAutomation({ ...page, frontmatter: { ...page.frontmatter, status: "tombstoned" } })
    ).toBeNull();
  });
});

describe("Laufzustand-Update", () => {
  test("schreibt nur Laufzustand, leert ausdrücklich und setzt den Pausentext", () => {
    expect(
      automationStateFrontmatter({ last_run_at: "t", fired_keys: ["a"] }, ["last_error"])
    ).toEqual({ last_run_at: "t", fired_keys: ["a"], last_error: null });
    expect(automationStateFrontmatter({ paused_reason: "owner_inactive" })).toEqual({
      paused_reason: "owner_inactive",
      status_message: "Besitzer nicht mehr in der Kanzlei aktiv — bitte neu speichern",
    });
    expect(automationStateFrontmatter({}, ["paused_reason"])).toEqual({
      paused_reason: null,
      status_message: null,
    });
  });

  test("mergeFiredKeys dedupliziert und kappt FIFO", () => {
    expect(mergeFiredKeys(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: MAX_FIRED_KEYS + 5 }, (_, i) => `k${i}`);
    const merged = mergeFiredKeys([], many);
    expect(merged).toHaveLength(MAX_FIRED_KEYS);
    expect(merged[0]).toBe("k5");
  });
});

describe("validateActions", () => {
  test("Pflichtfelder je Aktion", () => {
    expect(validateActions([])).toMatch(/Mindestens/);
    expect(validateActions([{ type: "send_mail" }])).toMatch(/Empfänger/);
    expect(validateActions([{ type: "send_mail", recipient: "{email}" }])).toBeNull();
    expect(validateActions([{ type: "start_workflow" }])).toMatch(/Vorlage/);
    expect(validateActions([{ type: "set_status", status: "review" }])).toMatch(/Status/);
    expect(validateActions([{ type: "set_status", status: "settled" }])).toBeNull();
  });
});

describe("Anlegen und Speichern: Besitzer und Stichtag", () => {
  const NOW = new Date("2026-09-23T10:00:00Z");
  const LATER = new Date("2026-09-24T10:00:00Z");

  test("neue Regel: Anlegender ist Besitzer, Stichtag = jetzt, Bestand noch offen", () => {
    const r = buildNewAutomationRule(
      { name: "Neu", event: "case.created", actions: [{ type: "notify" }] },
      { userId: "u1", label: "u1@kanzlei.at" },
      NOW
    );
    expect(r).toMatchObject({
      owner_user_id: "u1",
      created_by: "u1@kanzlei.at",
      active_since: NOW.toISOString(),
      enabled: true,
      fired_keys: [],
    });
    expect(needsBaseline(r)).toBe(true);
  });

  test("Speichern macht den Speichernden zum Besitzer und hebt die Pause auf", () => {
    const paused = rule({
      actions: [{ type: "send_mail", recipient: "a@b.at" }],
      paused_reason: "owner_missing",
      active_since: NOW.toISOString(),
      baseline_done_for: NOW.toISOString(),
    });
    const saved = applyAutomationEdit(paused, {}, "u2", LATER);
    expect(saved.owner_user_id).toBe("u2");
    expect(saved.paused_reason).toBeUndefined();
    // Wieder ausführbar → neuer Stichtag, nichts wird nachgeholt.
    expect(saved.active_since).toBe(LATER.toISOString());
    expect(needsBaseline(saved)).toBe(true);
  });

  test("Umbenennen durch den Besitzer lässt den Stichtag stehen", () => {
    const r = rule({
      owner_user_id: "u1",
      active_since: NOW.toISOString(),
      baseline_done_for: NOW.toISOString(),
    });
    const saved = applyAutomationEdit(r, { name: "Neuer Name" }, "u1", LATER);
    expect(saved.name).toBe("Neuer Name");
    expect(saved.active_since).toBe(NOW.toISOString());
    expect(needsBaseline(saved)).toBe(false);
  });

  test("Reaktivieren, neuer Besitzer oder geänderte Aktion beginnen einen neuen Stichtag", () => {
    const base = rule({
      owner_user_id: "u1",
      active_since: NOW.toISOString(),
      baseline_done_for: NOW.toISOString(),
    });
    const reenabled = applyAutomationEdit(
      { ...base, enabled: false },
      { enabled: true },
      "u1",
      LATER
    );
    expect(reenabled.active_since).toBe(LATER.toISOString());
    expect(applyAutomationEdit(base, {}, "u2", LATER).active_since).toBe(LATER.toISOString());
    expect(
      applyAutomationEdit(
        base,
        { actions: [{ type: "send_mail", recipient: "a@b.at" }] },
        "u1",
        LATER
      ).active_since
    ).toBe(LATER.toISOString());
    // Deaktivieren braucht keinen neuen Stichtag.
    expect(applyAutomationEdit(base, { enabled: false }, "u1", LATER).active_since).toBe(
      NOW.toISOString()
    );
  });

  test("Altregel ohne Stichtag bekommt beim Speichern einen", () => {
    const legacy = rule({ owner_user_id: "u1" });
    expect(applyAutomationEdit(legacy, {}, "u1", LATER).active_since).toBe(LATER.toISOString());
  });
});

describe("floorVerdict — nichts vor dem Stichtag", () => {
  const SINCE = "2026-09-23T10:00:00.000Z";
  const r = rule({ event: "case.created", active_since: SINCE });
  const obs = (o: Partial<Observation>): Observation => ({
    event: "case.created",
    fireKey: "k",
    payload: {},
    ...o,
  });

  test("bekannter Zeitpunkt entscheidet", () => {
    expect(floorVerdict(r, obs({ occurredAt: "2026-09-23T11:00:00Z" }))).toBe("new");
    expect(floorVerdict(r, obs({ occurredAt: "2026-01-01T00:00:00Z" }))).toBe("old");
  });

  test("unbekannter Zeitpunkt bleibt unbekannt — außer die Untergrenze liegt danach", () => {
    expect(floorVerdict(r, obs({}))).toBe("unknown");
    expect(floorVerdict(r, obs({ notBefore: "2026-09-24T00:00:00Z" }))).toBe("new");
    expect(floorVerdict(r, obs({ notBefore: "2026-01-01T00:00:00Z" }))).toBe("unknown");
  });

  test("„bald fällig“: Eintritt ins Vorlauf-Fenster der Regel", () => {
    const due = rule({ event: "deadline.due_soon", within_days: 7, active_since: SINCE });
    const dueObs = (due_date: string, extra: Partial<Observation> = {}) =>
      obs({ event: "deadline.due_soon", payload: { due_date }, ...extra });
    // Rückt erst nach dem Stichtag ins Fenster → neu.
    expect(floorVerdict(due, dueObs("2026-10-05"))).toBe("new");
    // War beim Stichtag schon im Fenster, Anlage unbekannt → unbekannt.
    expect(floorVerdict(due, dueObs("2026-09-25"))).toBe("unknown");
    // … Anlage vor dem Stichtag → alt; nach dem Stichtag → neu.
    expect(floorVerdict(due, dueObs("2026-09-25", { occurredAt: "2026-09-01T00:00:00Z" }))).toBe(
      "old"
    );
    expect(floorVerdict(due, dueObs("2026-09-25", { occurredAt: "2026-09-23T12:00:00Z" }))).toBe(
      "new"
    );
  });

  test("Altregel ohne Stichtag: ihre Anlage gilt als Untergrenze", () => {
    const legacy = rule({ event: "case.created", created_at: "2026-09-01T00:00:00Z" });
    expect(floorVerdict(legacy, obs({ occurredAt: "2026-08-01T00:00:00Z" }))).toBe("old");
    expect(floorVerdict(legacy, obs({}))).toBe("unknown");
    expect(needsBaseline(legacy)).toBe(false);
  });
});
