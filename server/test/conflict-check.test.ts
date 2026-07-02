import { describe, it, expect } from "bun:test";
import {
  conflictCheck,
  entityRoleToSide,
  nameSimilarity,
  normalizeName,
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
    const s = nameSimilarity("Müller GmbH & Co KG", "Müller GmbH");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
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

  it("client in one Akt only → none", async () => {
    const r = await conflictCheck(
      fakeEngine([caseRow({ client_name: "Max Mustermann" })], []),
      { name: "Max Mustermann" }
    );
    expect(r.severity).toBe("none");
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
            aliases: JSON.stringify(["Toni Remik"]),
            role: "beschuldigter",
          }),
        ]
      ),
      { name: "Toni Remik" }
    );
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.matched_name).toContain("Alias: Toni Remik");
  });

  it("LOW: opponent in two different Akten", async () => {
    const r = await conflictCheck(
      fakeEngine(
        [
          caseRow({ slug: "cases/akte-1", opponent_name: "Widget Co" }),
          caseRow({ slug: "cases/akte-2", opponent_name: "Widget Co" }),
        ],
        []
      ),
      { name: "Widget Co" }
    );
    expect(r.severity).toBe("low");
    expect(r.explanation).toContain("Gegnerseite");
  });

  it("Zeugen-Entity allein erzeugt keinen Konflikt (contact)", async () => {
    const r = await conflictCheck(
      fakeEngine([], [entityRow({ role: "zeuge" })]),
      { name: "Max Mustermann" }
    );
    expect(r.severity).toBe("none");
    expect(r.matches[0]!.role).toBe("contact");
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
