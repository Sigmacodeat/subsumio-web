import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import {
  conflictCheck,
  entityRoleToSide,
  matchName,
  nameSimilarity,
  nameTokens,
  normalizeName,
  prefilterPatterns,
  type ConflictEngine,
} from "../src/core/legal/conflict-check.ts";

// ── Fake engine: first call returns case/contact rows, second entity rows ──

function fakeEngine(caseRows: unknown[], entityRows: unknown[]): ConflictEngine {
  let call = 0;
  return {
    async executeRaw<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
      call++;
      return (call === 1 ? caseRows : entityRows) as T[];
    },
  };
}

const caseRow = (over: Record<string, unknown> = {}) => ({
  slug: "cases/akte-1",
  title: "Akte 1",
  client_name: null,
  opponent_name: null,
  contact_name: null,
  status: "open",
  page_type: "legal_case",
  ...over,
});

const entityRow = (over: Record<string, unknown> = {}) => ({
  slug: "people/max-mustermann",
  title: "Max Mustermann",
  role: "zeuge",
  case_ref: "cases/akte-2",
  aliases: JSON.stringify([]),
  ...over,
});

describe("normalizeName / nameSimilarity", () => {
  it("normalizes umlauts", () => {
    expect(normalizeName("Müller & Söhne GmbH")).toBe("mueller soehne gmbh");
  });

  it("Müller matches Mueller with similarity 1", () => {
    expect(nameSimilarity("Müller GmbH", "Mueller GmbH")).toBe(1);
  });

  it("partial overlap scores between 0 and 1", () => {
    const s = nameSimilarity("Müller Bau GmbH", "Müller GmbH");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("legal-form suffixes do not change the similarity", () => {
    expect(nameSimilarity("Müller GmbH & Co KG", "Müller GmbH")).toBe(1);
  });
});

describe("entityRoleToSide", () => {
  it("maps client-side roles", () => {
    expect(entityRoleToSide("opfer")).toBe("client");
    expect(entityRoleToSide("privatbeteiligter")).toBe("client");
    expect(entityRoleToSide("klaegerin")).toBe("client");
  });

  it("maps opponent-side roles", () => {
    expect(entityRoleToSide("beschuldigter")).toBe("opponent");
    expect(entityRoleToSide("beklagte partei")).toBe("opponent");
  });

  it("everything else is contact", () => {
    expect(entityRoleToSide("zeuge")).toBe("contact");
    expect(entityRoleToSide("richter")).toBe("contact");
  });
});

describe("conflictCheck", () => {
  it("no hits → severity none", async () => {
    const r = await conflictCheck(fakeEngine([], []), { name: "Unbekannt" });
    expect(r.severity).toBe("none");
    expect(r.matches).toHaveLength(0);
  });

  it("throws on empty name", async () => {
    await expect(conflictCheck(fakeEngine([], []), { name: "  " })).rejects.toThrow();
  });

  it("side unknown: a single known hit is never 'kein Konflikt'", async () => {
    const r = await conflictCheck(fakeEngine([caseRow({ client_name: "Max Mustermann" })], []), {
      name: "Max Mustermann",
    });
    expect(r.severity).toBe("low");
    expect(r.matches[0]!.role).toBe("client");
    expect(r.matches[0]!.exact).toBe(true);
  });

  it("CRITICAL: client in Akte 1, opponent in Akte 2 (case frontmatter)", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [
          caseRow({ slug: "cases/akte-1", client_name: "Max Mustermann" }),
          caseRow({ slug: "cases/akte-2", opponent_name: "Max Mustermann" }),
        ],
        []
      ),
      { name: "Max Mustermann" }
    );
    expect(r.severity).toBe("critical");
    expect(r.explanation).toContain("§ 10 Abs 1 RAO");
  });

  it("CRITICAL via entity graph: Mandant in Akte 1, Beschuldigter-Entity in Akte 2", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [caseRow({ slug: "cases/akte-1", client_name: "Max Mustermann" })],
        [entityRow({ role: "beschuldigter", case_ref: "cases/akte-2" })]
      ),
      { name: "Max Mustermann" }
    );
    expect(r.severity).toBe("critical");
    const entityMatch = r.matches.find((m) => m.quelle === "entity");
    expect(entityMatch?.role).toBe("opponent");
    expect(entityMatch?.case_ref).toBe("cases/akte-2");
  });

  it("alias hit is reported with the matched alias", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [],
        [
          entityRow({
            title: "Adnan Beispiel",
            aliases: JSON.stringify(["Rudi Tarnname"]),
            role: "beschuldigter",
          }),
        ]
      ),
      { name: "Rudi Tarnname" }
    );
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.matched_name).toContain("Alias: Rudi Tarnname");
  });

  it("repeat opponent (same side in two Akten) is information, not a conflict", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [
          caseRow({ slug: "cases/akte-1", opponent_name: "Widget Co" }),
          caseRow({ slug: "cases/akte-2", opponent_name: "Widget Co" }),
        ],
        []
      ),
      { name: "Widget Co", side: "opponent" }
    );
    expect(r.severity).toBe("none");
    expect(r.explanation).toContain("Gegnerseite");
    expect(r.explanation).toContain("§ 9 RAO");
    expect(r.matches.every((m) => m.assessment === "info")).toBe(true);
  });

  it("Zeugen-Entity allein ist kein kritischer Konflikt (contact, prüfen)", async () => {
    const r = await conflictCheck(fakeEngine([], [entityRow({ role: "zeuge" })]), {
      name: "Max Mustermann",
      side: "client",
    });
    expect(r.severity).toBe("low");
    expect(r.matches[0]!.role).toBe("contact");
    expect(r.matches[0]!.assessment).toBe("review");
  });

  it("same Akt on both sides is NOT critical (data error, not conflict)", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [caseRow({ slug: "cases/akte-1", client_name: "Max Mustermann" })],
        [entityRow({ role: "beschuldigter", case_ref: "cases/akte-1" })]
      ),
      { name: "Max Mustermann" }
    );
    expect(r.severity).not.toBe("critical");
  });

  it("dedupes by slug and reports checked_rows", async () => {
    const dup = caseRow({ client_name: "Max Mustermann" });
    const r = await conflictCheck(fakeEngine([dup, dup], []), { name: "Max Mustermann" });
    expect(r.matches).toHaveLength(1);
    expect(r.checked_rows).toBe(2);
  });

  it("disclaimer cites RAO (AT-first)", async () => {
    const r = await conflictCheck(fakeEngine([], []), { name: "X Y" });
    expect(r.disclaimer).toContain("§ 10 RAO");
  });
});

// ── OPS-1: the side of the name in the NEW mandate decides ──────────────

describe("conflictCheck — side of the new mandate (§ 10 Abs 1 RAO)", () => {
  it("CRITICAL: new client is the opponent in an existing Akte", async () => {
    const r = await conflictCheck(
      fakeEngine([caseRow({ slug: "cases/alt", opponent_name: "Müller GmbH" })], []),
      { name: "Müller GmbH", side: "client" }
    );
    expect(r.severity).toBe("critical");
    expect(r.side).toBe("client");
    expect(r.explanation).toContain("Gegnerseite");
    expect(r.matches[0]!.assessment).toBe("critical");
  });

  it("CRITICAL: new opponent is an existing client", async () => {
    const r = await conflictCheck(
      fakeEngine([caseRow({ slug: "cases/alt", client_name: "A" })], []),
      { name: "A", side: "opponent" }
    );
    expect(r.severity).toBe("critical");
    expect(r.explanation).toContain("Mandant der Kanzlei");
  });

  it("CRITICAL: new client is an additional opponent (object or string form)", async () => {
    for (const extra of [[{ name: "Dritte Beklagte GmbH" }], ["Dritte Beklagte GmbH"]]) {
      const r = await conflictCheck(
        fakeEngine(
          [
            caseRow({
              slug: "cases/alt",
              opponent_name: "Jemand Anderer",
              additional_opponents: JSON.stringify(extra),
            }),
          ],
          []
        ),
        { name: "Dritte Beklagte GmbH", side: "client" }
      );
      expect(r.severity).toBe("critical");
      expect(r.matches[0]!.matched_name).toBe("Dritte Beklagte GmbH");
    }
  });

  it("CRITICAL via entity graph: new client is Beschuldigter in another Akte", async () => {
    const r = await conflictCheck(
      fakeEngine([], [entityRow({ role: "beschuldigter", case_ref: "cases/akte-2" })]),
      { name: "Max Mustermann", side: "client" }
    );
    expect(r.severity).toBe("critical");
  });

  it("returning client (same side) is not a conflict", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [
          caseRow({ slug: "cases/akte-1", client_name: "Max Mustermann" }),
          caseRow({ slug: "cases/akte-2", client_name: "Max Mustermann" }),
        ],
        []
      ),
      { name: "Max Mustermann", side: "client" }
    );
    expect(r.severity).toBe("none");
    expect(r.explanation).toContain("Folgemandat");
  });

  it("a single hit as participant (witness) is at least low, never 'kein Konflikt'", async () => {
    const r = await conflictCheck(fakeEngine([], [entityRow({ role: "zeuge" })]), {
      name: "Max Mustermann",
      side: "opponent",
    });
    expect(r.severity).toBe("low");
  });

  it("contact recorded with the opposite role needs review", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [
          caseRow({
            slug: "contacts/max",
            title: "Max Mustermann",
            page_type: "legal_contact",
            contact_name: "Max Mustermann",
            contact_role: "opponent",
          }),
        ],
        []
      ),
      { name: "Max Mustermann", side: "client" }
    );
    expect(r.severity).toBe("low");
  });
});

// ── OPS-4: no flood from the party's own records ────────────────────────

describe("conflictCheck — own contact and own Akte are not collisions", () => {
  const ownContact = caseRow({
    slug: "contacts/max",
    title: "Max Mustermann",
    page_type: "legal_contact",
    contact_name: "Max Mustermann",
    contact_role: "client",
  });

  it("the client's own contact (same role) is information only", async () => {
    const r = await conflictCheck(fakeEngine([ownContact], []), {
      name: "Max Mustermann",
      side: "client",
    });
    expect(r.severity).toBe("none");
    expect(r.matches[0]!.assessment).toBe("info");
  });

  it("ownContactSlugs drops that contact entirely", async () => {
    const r = await conflictCheck(fakeEngine([ownContact], []), {
      name: "Max Mustermann",
      side: "client",
      ownContactSlugs: ["contacts/max"],
    });
    expect(r.matches).toHaveLength(0);
  });

  it("ownContactSlugs never hides a case hit", async () => {
    const r = await conflictCheck(
      fakeEngine([caseRow({ slug: "cases/alt", opponent_name: "Max Mustermann" })], []),
      { name: "Max Mustermann", side: "client", ownContactSlugs: ["cases/alt"] }
    );
    expect(r.severity).toBe("critical");
  });

  it("selfCaseSlug drops the Akte itself and its entities", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [caseRow({ slug: "cases/neu", client_name: "Max Mustermann" })],
        [entityRow({ role: "beschuldigter", case_ref: "cases/neu" })]
      ),
      { name: "Max Mustermann", side: "opponent", selfCaseSlug: "cases/neu" }
    );
    expect(r.matches).toHaveLength(0);
    expect(r.severity).toBe("none");
  });
});

// ── OPS-2: fuzzy matching variants ──────────────────────────────────────

describe("matchName — fuzzy variants", () => {
  const hit = (q: string, c: string) => matchName(q, c).match;

  it("umlaut / ß folding", () => {
    expect(hit("Mueller", "Müller")).toBe(true);
    expect(hit("Strasser", "Straßer")).toBe(true);
  });

  it("case", () => {
    expect(hit("MAX MÜLLER", "max müller")).toBe(true);
  });

  it("legal-form suffixes", () => {
    expect(hit("Müller GmbH", "Müller Ges.m.b.H.")).toBe(true);
    expect(hit("Huber e.U.", "Huber")).toBe(true);
    expect(hit("Widget AG", "Widget KG")).toBe(true);
    expect(hit("Acme OG", "ACME G.m.b.H.")).toBe(true);
    expect(hit("Müller GmbH & Co KG", "Müller GmbH")).toBe(true);
  });

  it("hyphen vs space", () => {
    expect(hit("Mueller Bau GmbH", "Müller-Bau GmbH")).toBe(true);
  });

  it("first/last name order", () => {
    expect(hit("Max Müller", "Müller, Max")).toBe(true);
    expect(hit("Max Müller", "Müller Max")).toBe(true);
  });

  it("titles are ignored", () => {
    expect(hit("Dr. Max Müller", "Max Müller")).toBe(true);
    expect(hit("Max Müller", "Mag. Dr. Max Müller")).toBe(true);
  });

  it("small typos", () => {
    expect(hit("Meier", "Maier")).toBe(true);
    expect(hit("Anna Meier", "Anna Meyer")).toBe(true);
    expect(hit("Mustermann", "Musterman")).toBe(true);
    expect(hit("Mueler", "Müller")).toBe(true);
  });

  it("does not flood: different first names, short tokens, unrelated", () => {
    expect(hit("Max Müller", "Maria Müller")).toBe(false);
    expect(hit("Max Müller", "Max")).toBe(false);
    expect(hit("Max", "May")).toBe(false);
    expect(hit("Anna Huber", "Otto Berger")).toBe(false);
  });

  it("a surname-only record matches the full name", () => {
    expect(hit("Anna Müller", "Müller")).toBe(true);
  });

  it("exact only for the same normalized name", () => {
    expect(matchName("Müller GmbH", "Müller GmbH").exact).toBe(true);
    expect(matchName("Mueller GmbH", "Müller GmbH").exact).toBe(true);
    expect(matchName("Max Müller", "Müller, Max").exact).toBe(false);
    expect(matchName("Max Müller", "Müller, Max").similarity).toBe(1);
  });

  it("nameTokens strips legal forms/titles and sorts", () => {
    expect(nameTokens("Dr. Müller, Max")).toEqual(["max", "mueller"]);
    expect(nameTokens("G.m.b.H.")).toEqual(["gmbh"]);
  });

  it("prefilter patterns hold only safe LIKE characters", () => {
    for (const p of prefilterPatterns("O'Brien & Söhne GmbH; DROP TABLE pages")) {
      expect(p).toMatch(/^[a-z0-9_%]+$/);
    }
  });
});

// ── OPS-2 on a real engine (PGLite): the SQL prefilter must find the variants ──

describe("conflictCheck on PGLite — prefilter recall", () => {
  let engine: PGLiteEngine;

  beforeAll(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
    const cases: Array<[string, Record<string, unknown>]> = [
      ["akten/a-mueller", { client_name: "Hans Huber", opponent_name: "Müller" }],
      ["akten/b-max", { client_name: "Irgendwer", opponent_name: "Müller, Max" }],
      ["akten/c-bau", { client_name: "Irgendwer", opponent_name: "Müller-Bau GmbH" }],
      ["akten/d-maier", { client_name: "Irgendwer", opponent_name: "Anna Maier" }],
      [
        "akten/e-dritte",
        {
          client_name: "Irgendwer",
          opponent_name: "Jemand",
          additional_opponents: [{ name: "Straßer e.U." }],
        },
      ],
      ["akten/f-gross", { client_name: "ÖBAU Übersee AG", opponent_name: "Jemand" }],
    ];
    for (const [slug, fm] of cases) {
      await engine.putPage(slug, {
        type: "legal_case",
        title: slug,
        compiled_truth: "",
        frontmatter: fm,
      });
    }
    await engine.putPage("kontakte/max", {
      type: "legal_contact",
      title: "Max Mustermann",
      compiled_truth: "",
      frontmatter: { name: "Max Mustermann", role: "client" },
    });
  }, 60_000);

  afterAll(async () => {
    if (engine) await engine.disconnect();
  });

  const slugsFor = async (name: string, side: "client" | "opponent" = "client") =>
    [...new Set((await conflictCheck(engine, { name, side })).matches.map((m) => m.slug))].sort();

  it("Mueller (query) finds Müller (stored) — critical for a new client", async () => {
    const r = await conflictCheck(engine, { name: "Mueller", side: "client" });
    expect(r.matches.map((m) => m.slug)).toContain("akten/a-mueller");
    expect(r.severity).toBe("critical");
  });

  it("Max Müller finds 'Müller, Max'", async () => {
    expect(await slugsFor("Max Müller")).toContain("akten/b-max");
  });

  it("Mueller Bau GmbH finds 'Müller-Bau GmbH'", async () => {
    expect(await slugsFor("Mueller Bau GmbH")).toContain("akten/c-bau");
  });

  it("Anna Meier finds 'Anna Maier' (typo)", async () => {
    expect(await slugsFor("Anna Meier")).toEqual(["akten/d-maier"]);
  });

  it("Strasser finds an additional opponent 'Straßer e.U.'", async () => {
    expect(await slugsFor("Strasser")).toEqual(["akten/e-dritte"]);
  });

  it("uppercase umlauts in the stored value are folded", async () => {
    const r = await conflictCheck(engine, { name: "Oebau Uebersee", side: "opponent" });
    expect(r.matches.map((m) => m.slug)).toEqual(["akten/f-gross"]);
    expect(r.severity).toBe("critical");
  });

  it("own client contact is information only (no flood)", async () => {
    const r = await conflictCheck(engine, { name: "Max Mustermann", side: "client" });
    expect(r.severity).toBe("none");
  });

  it("unrelated names are not matched", async () => {
    expect(await slugsFor("Berta Unbekannt")).toEqual([]);
  });
});
