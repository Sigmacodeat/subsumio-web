import { describe, expect, it } from "vitest";
import { guessMapping, missingMappings } from "./fields";
import { planImport, type ExistingData } from "./plan";

const opts = {
  projectId: "mig-1789-abcdef12",
  today: "2026-09-17",
  now: "2026-09-17T10:00:00.000Z",
};

const existing: ExistingData = {
  cases: [
    {
      slug: "legal/cases/2026-001",
      title: "Berger ./. Muster Werk GmbH",
      frontmatter: {
        case_number: "2026/001",
        time_entries: [
          { id: "t1", date: "2026-09-01", minutes: 60, description: "Erstbesprechung" },
        ],
        deadlines: [{ title: "Klagebeantwortung", due_date: "2026-10-15" }],
      },
    },
    {
      slug: "legal/cases/2026-002",
      title: "Huber Verlassenschaft",
      frontmatter: { case_number: "2026/002" },
    },
    { slug: "legal/cases/a", title: "Doppelt", frontmatter: {} },
    { slug: "legal/cases/b", title: "Doppelt", frontmatter: {} },
  ],
  contacts: [
    {
      slug: "contact/anna-berger",
      title: "Mag. Anna Berger",
      frontmatter: { name: "Mag. Anna Berger", role: "client" },
    },
    {
      slug: "contact/max",
      title: "Max Muster",
      frontmatter: { name: "Max Muster", email: "max@muster.at", phone: "+43 1 234" },
    },
    {
      slug: "contact/alt",
      title: "Gelöscht",
      frontmatter: { name: "Gelöscht", status: "tombstoned" },
    },
  ],
  deadlines: [
    {
      slug: "legal/deadlines/d1",
      title: "Berufung",
      frontmatter: { case_slug: "legal/cases/2026-002", due_date: "2026-11-02" },
    },
  ],
};

const actions = (plan: ReturnType<typeof planImport>) =>
  plan.rows.map((r) => `${r.row}:${r.action}${r.reason ? ` ${r.reason}` : ""}`);

describe("mapping", () => {
  it("proposes each column once and names what is missing", () => {
    const headers = ["Aktenzahl", "Datum", "Dauer (Std.)", "Leistungstext", "Sachbearbeiter"];
    const m = guessMapping("time_entries", headers);
    expect(m.case_ref).toBe(0);
    expect(m.date).toBe(1);
    expect(m.hours).toBe(2);
    expect(m.description).toBe(3);
    expect(m.lawyer).toBe(4);
    expect(missingMappings("time_entries", m)).toEqual([]);
    expect(missingMappings("time_entries", { ...m, hours: -1 })).toEqual([
      "Dauer in Minuten oder Dauer in Stunden",
    ]);
  });
});

describe("matters", () => {
  it("creates new matters, skips existing and repeated case numbers, never reuses a slug", () => {
    const rows = [
      ["Neu ./. Test", "2026/010", "Offen"],
      ["Schon da", "2026/001", ""],
      ["Wieder", "2026/010", ""],
      ["", "2026/011", ""],
      ["Alt", "", "Erledigt"],
      ["Komisch", "2026/012", "in Klärung"],
    ];
    const plan = planImport("cases", rows, { title: 0, case_number: 1, status: 2 }, existing, opts);
    expect(actions(plan)).toEqual([
      "2:create",
      "3:skip Aktenzahl 2026/001 existiert bereits",
      "4:skip Aktenzahl 2026/010 steht schon in Zeile 2",
      "5:error Bezeichnung fehlt",
      "6:create",
      "7:create",
    ]);
    const first = plan.rows[0].write!;
    expect(first).toMatchObject({
      op: "create_page",
      slug: "legal/cases/2026-010",
      type: "legal_case",
    });
    expect((first as { frontmatter: Record<string, unknown> }).frontmatter).toMatchObject({
      status: "open",
      source: "kanzlei-import",
      import_project_id: opts.projectId,
    });
    expect(
      (plan.rows[4].write as { frontmatter: Record<string, unknown> }).frontmatter
    ).toMatchObject({
      status: "archived",
      archived_by: "Kanzlei-Import",
    });
    expect(plan.rows[5].warnings[0]).toMatch(/unbekannt/);
    expect(plan.counts).toEqual({ create: 3, complete: 0, skip: 2, error: 1 });
  });

  it("gives a matter a unique slug when its natural slug is taken", () => {
    const plan = planImport(
      "cases",
      [["A", "A"]],
      { title: 0, case_number: 1 },
      {
        ...existing,
        cases: [{ slug: "legal/cases/a", title: "x", frontmatter: {} }],
      },
      opts
    );
    const slug = (plan.rows[0].write as { slug: string }).slug;
    expect(slug).toMatch(/^legal\/cases\/a-[a-z0-9]+$/);
    expect(slug).not.toBe("legal/cases/a");
    // Deterministic: another import project plans the same slug.
    const again = planImport(
      "cases",
      [["A", "A"]],
      { title: 0, case_number: 1 },
      { ...existing, cases: [{ slug: "legal/cases/a", title: "x", frontmatter: {} }] },
      { ...opts, projectId: "mig-2000-99999999" }
    );
    expect((again.rows[0].write as { slug: string }).slug).toBe(slug);
  });

  it("a second import of matters without Aktenzahl creates nothing twice", () => {
    const map = { title: 0, case_number: 1, client_name: 2 };
    const rows = [["Mietsache Beispiel", "", "Anna Beispiel"]];
    const first = planImport("cases", rows, map, { ...existing, cases: [] }, opts);
    expect(actions(first)).toEqual(["2:create"]);
    const created = first.rows[0].write as {
      slug: string;
      title: string;
      frontmatter: Record<string, unknown>;
    };
    const second = planImport(
      "cases",
      rows,
      map,
      {
        ...existing,
        cases: [{ slug: created.slug, title: created.title, frontmatter: created.frontmatter }],
      },
      { ...opts, projectId: "mig-2000-99999999" }
    );
    expect(actions(second)).toEqual([
      "2:skip Akte „Mietsache Beispiel“ mit diesem Mandanten existiert bereits",
    ]);
  });

  it("the same title for a different client is a different matter", () => {
    const map = { title: 0, case_number: 1, client_name: 2 };
    const plan = planImport(
      "cases",
      [
        ["Mietsache", "", "Anna Beispiel"],
        ["Mietsache", "", "Bernd Beispiel"],
        ["Mietsache", "", "Anna Beispiel"],
      ],
      map,
      { ...existing, cases: [] },
      opts
    );
    expect(actions(plan)).toEqual([
      "2:create",
      "3:create",
      "4:skip Akte „Mietsache“ mit diesem Mandanten steht schon in Zeile 2",
    ]);
  });

  it("Geschäftszahlen are compared normalised", () => {
    const plan = planImport(
      "cases",
      [["Neu", "12Cg34/25X"]],
      { title: 0, case_number: 1 },
      {
        ...existing,
        cases: [
          { slug: "legal/cases/x", title: "X", frontmatter: { case_number: "12 Cg 34/25x" } },
        ],
      },
      opts
    );
    expect(actions(plan)).toEqual(["2:skip Aktenzahl 12Cg34/25X existiert bereits"]);
  });
});

describe("contacts", () => {
  it("creates, completes only empty fields, and never overwrites", () => {
    const rows = [
      ["Mag. Anna Berger", "Mandantin", "anna@berger.at", "+43 660 1"],
      ["Max Muster", "", "max@muster.at", "+43 999"],
      ["Dr. Karl Neu", "Gegenanwalt", "karl@kanzlei", ""],
      ["Dr. Karl Neu", "", "", ""],
      ["Gelöscht", "", "", ""],
    ];
    const plan = planImport(
      "contacts",
      rows,
      { name: 0, role: 1, email: 2, phone: 3 },
      existing,
      opts
    );
    expect(actions(plan)).toEqual([
      "2:complete Ergänzt 2 leere Angabe(n) bei „Mag. Anna Berger“",
      "3:skip Kontakt „Max Muster“ existiert bereits, nichts zu ergänzen",
      "4:create",
      "5:skip Doppelt in der Datei (Zeile 4)",
      "6:create",
    ]);
    expect(plan.rows[0].write).toEqual({
      op: "complete_contact",
      slug: "contact/anna-berger",
      fields: { email: "anna@berger.at", phone: "+43 660 1" },
    });
    expect(plan.rows[2].warnings[0]).toMatch(/E-Mail „karl@kanzlei“ ungültig/);
    expect((plan.rows[2].write as { frontmatter: Record<string, unknown> }).frontmatter.role).toBe(
      "lawyer"
    );
  });
});

describe("deadlines", () => {
  it("links to the matter, skips past, done and known deadlines, flags them as unverified", () => {
    const rows = [
      ["2026/001", "Beweisantrag", "30.09.2026", "ja", ""],
      ["Huber Verlassenschaft", "Berufung", "02.11.2026", "", ""],
      ["2026/001", "Klagebeantwortung", "15.10.2026", "", ""],
      ["2026/001", "Alt", "01.09.2026", "", ""],
      ["2026/001", "Erledigt", "01.12.2026", "", "ja"],
      ["2026/999", "Unbekannt", "01.12.2026", "", ""],
      ["Doppelt", "Mehrdeutig", "01.12.2026", "", ""],
      ["2026/002", "Kaputt", "31.02.2026", "", ""],
      ["2026/002", "Vielleicht", "01.12.2026", "eventuell", ""],
    ];
    const map = { case_ref: 0, title: 1, due_date: 2, is_notfrist: 3, done: 4 };
    const plan = planImport("deadlines", rows, map, existing, opts);
    expect(actions(plan)).toEqual([
      "2:create",
      "3:skip Gleiche Frist ist in der Akte schon eingetragen",
      "4:skip Gleiche Frist ist in der Akte schon eingetragen",
      "5:skip Liegt vor dem Importtag",
      "6:skip In der Quelle als erledigt markiert",
      "7:error Akte „2026/999“ nicht gefunden. Zuerst die Akten importieren.",
      "8:error „Doppelt“ passt zu 2 Akten",
      "9:error Datum „31.02.2026“ nicht erkannt",
      "10:create",
    ]);
    expect(
      (plan.rows[0].write as { frontmatter: Record<string, unknown> }).frontmatter
    ).toMatchObject({
      case_slug: "legal/cases/2026-001",
      due_date: "2026-09-30",
      status: "pending",
      review_status: "unreviewed",
      imported_unverified: true,
      is_notfrist: true,
      second_check_required: true,
    });
    expect(plan.rows[8].warnings[0]).toMatch(/als Notfrist übernommen/);
    const withPast = planImport("deadlines", [rows[3]], map, existing, {
      ...opts,
      includePastDeadlines: true,
    });
    expect(withPast.rows[0].action).toBe("create");
    expect(withPast.rows[0].warnings).toContain("Frist liegt in der Vergangenheit");
  });
});

describe("time entries", () => {
  it("adds entries per matter, keeps billed state and skips entries already recorded", () => {
    const rows = [
      ["2026/001", "01.09.2026", "1:00", "Erstbesprechung", "", ""],
      ["2026/001", "02.09.2026", "0,5", "Aktenstudium", "280", "ja"],
      ["2026/002", "03.09.2026", "", "Telefonat", "", ""],
      ["2026/002", "03.09.2026", "0,25", "Telefonat", "viel", "vielleicht"],
      ["2026/002", "03.09.2026", "0,25", "Telefonat", "", ""],
    ];
    const map = { case_ref: 0, date: 1, hours: 2, description: 3, rate: 4, billed: 5 };
    const plan = planImport("time_entries", rows, map, existing, opts);
    expect(actions(plan)).toEqual([
      "2:skip Gleicher Eintrag ist in der Akte schon erfasst",
      "3:create",
      "4:error Dauer fehlt",
      "5:create",
      "6:skip Gleicher Eintrag ist in der Akte schon erfasst",
    ]);
    expect(plan.rows[1].write).toEqual({
      op: "add_time_entry",
      caseSlug: "legal/cases/2026-001",
      entry: {
        id: "imp-abcdef12-3",
        description: "Aktenstudium",
        minutes: 30,
        date: "2026-09-02",
        rate: 280,
        billable: true,
        billed: true,
        source: "kanzlei-import",
        import_project_id: opts.projectId,
      },
    });
    expect(plan.rows[3].warnings).toEqual([
      "Stundensatz „viel“ nicht erkannt, weggelassen",
      "„vielleicht“ bei abgerechnet nicht erkannt, als abgerechnet übernommen",
    ]);
    const open = planImport("time_entries", [rows[1]], { ...map, billed: -1 }, existing, opts);
    expect((open.rows[0].write as { entry: { billed: boolean } }).entry.billed).toBe(false);
    const billedDefault = planImport("time_entries", [rows[1]], { ...map, billed: -1 }, existing, {
      ...opts,
      defaultBilled: true,
    });
    expect((billedDefault.rows[0].write as { entry: { billed: boolean } }).entry.billed).toBe(true);
  });
});
