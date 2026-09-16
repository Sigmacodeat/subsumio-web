import { describe, expect, test } from "vitest";
import {
  AKTENBLATT_END,
  AKTENBLATT_START,
  caseContentWithAktenblatt,
  renderAktenblatt,
  withAktenblatt,
} from "./aktenblatt";

const fm = {
  case_number: "QA-2026-003",
  client_name: "Petra Novak",
  opponent_name: "Versicherung AG",
  court_name: "LG Wien",
  legal_area: "Zivilrecht",
  status: "open",
  deadlines: [
    {
      title: "Klagebeantwortung § 230 ZPO",
      due_date: "2026-10-21",
      status: "pending",
      type: "court",
    },
    { title: "erledigt", due_date: "2026-09-01", status: "done" },
  ],
  documents: [{ id: "d1", name: "Kündigung Versicherung AG", type: "pdf" }],
  tasks: [
    { id: "t1", text: "Vollmacht einholen", done: false },
    { id: "t2", text: "erledigt", done: true },
  ],
  facts: "Deckungsstreit nach Wasserschaden.",
};

describe("renderAktenblatt", () => {
  test("renders parties, court, deadlines, documents and open tasks", () => {
    const text = renderAktenblatt("Novak ./. Versicherung AG", fm);
    expect(text).toContain("# Aktenblatt QA-2026-003 — Novak ./. Versicherung AG");
    expect(text).toContain("- Mandant: Petra Novak");
    expect(text).toContain("- Gegner: Versicherung AG");
    expect(text).toContain("- Gericht: LG Wien");
    expect(text).toContain("- Status: offen");
    expect(text).toContain("## Sachverhalt");
    expect(text).toContain("2026-10-21: Klagebeantwortung § 230 ZPO (ausstehend) [court]");
    expect(text).toContain("- Kündigung Versicherung AG (pdf)");
    expect(text).toContain("- Vollmacht einholen");
    expect(text).not.toContain("- erledigt\n");
  });

  test("lists linked deadline pages once, deduplicated against embedded ones", () => {
    const text = renderAktenblatt("T", fm, {
      linkedDeadlines: [
        {
          title: "Klagebeantwortung § 230 ZPO",
          frontmatter: { due_date: "2026-10-21", status: "pending" },
        },
        {
          title: "Revisionsfrist § 505 ZPO",
          frontmatter: { due_date: "2026-10-28", status: "pending", deadline_type: "notfrist" },
        },
      ],
    });
    expect(text.match(/Klagebeantwortung § 230 ZPO/g)?.length).toBe(1);
    expect(text).toContain("2026-10-28: Revisionsfrist § 505 ZPO (ausstehend) [notfrist]");
  });

  test("skips empty sections", () => {
    const text = renderAktenblatt("Leer", { case_number: "X-1" });
    expect(text).toBe("# Aktenblatt X-1 — Leer\n\n- Aktenzeichen: X-1");
  });
});

describe("withAktenblatt", () => {
  test("appends to the lawyer's own text and replaces on refresh", () => {
    const first = withAktenblatt("Eigene Notiz.", "BLOCK-1");
    expect(first.startsWith("Eigene Notiz.")).toBe(true);
    expect(first).toContain(`${AKTENBLATT_START}\nBLOCK-1\n${AKTENBLATT_END}`);
    const second = withAktenblatt(first, "BLOCK-2");
    expect(second).toContain("Eigene Notiz.");
    expect(second).toContain("BLOCK-2");
    expect(second).not.toContain("BLOCK-1");
    expect(second.split(AKTENBLATT_START).length).toBe(2);
  });

  test("caseContentWithAktenblatt is idempotent", () => {
    const a = caseContentWithAktenblatt("", "T", fm);
    const b = caseContentWithAktenblatt(a, "T", fm);
    expect(b).toBe(a);
  });
});
