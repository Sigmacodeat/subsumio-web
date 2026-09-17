import { describe, expect, it } from "vitest";
import { planImport, type ExistingData } from "./plan";
import { executeImport, rollbackImport, type ImportClient } from "./run";

type Page = { slug: string; title?: string; type?: string; frontmatter: Record<string, unknown> };

function fakeClient(initial: Page[]) {
  const pages = new Map(initial.map((p) => [p.slug, structuredClone(p)]));
  const log: string[] = [];
  const client: ImportClient = {
    async getPage(slug) {
      const p = pages.get(slug);
      return p ? structuredClone(p) : null;
    },
    async createPage(p) {
      if (p.title === "BOOM") throw new Error("Engine nicht erreichbar");
      log.push(`create ${p.slug}`);
      pages.set(p.slug, { ...p, frontmatter: { ...p.frontmatter } });
    },
    async updatePage({ slug, frontmatter }) {
      log.push(`update ${slug}`);
      const p = pages.get(slug)!;
      p.frontmatter = { ...p.frontmatter, ...frontmatter };
    },
    async deletePage(slug) {
      log.push(`delete ${slug}`);
      const p = pages.get(slug)!;
      p.frontmatter.status = slug.startsWith("legal/cases/") ? "archived" : "tombstoned";
    },
  };
  return { client, pages, log };
}

const opts = { projectId: "mig-xyz12345", today: "2026-09-17", now: "2026-09-17T10:00:00.000Z" };

describe("executeImport", () => {
  it("does not overwrite a matter created between dry run and import, and reports failures per row", async () => {
    const existing: ExistingData = { cases: [], contacts: [], deadlines: [] };
    const plan = planImport(
      "cases",
      [
        ["Neu", "1"],
        ["Parallel", "2"],
        ["BOOM", "3"],
      ],
      { title: 0, case_number: 1 },
      existing,
      opts
    );
    const { client, pages } = fakeClient([
      { slug: "legal/cases/2", title: "Von Kollegin angelegt", frontmatter: { status: "open" } },
    ]);
    const out = await executeImport(plan, client);
    expect(out.rows.map((r) => `${r.status}${r.reason ? ` ${r.reason}` : ""}`)).toEqual([
      "imported",
      "skipped Wurde inzwischen angelegt",
      "failed Engine nicht erreichbar",
    ]);
    expect(pages.get("legal/cases/2")?.title).toBe("Von Kollegin angelegt");
    expect(out.refs.pages).toEqual(["legal/cases/1"]);
  });

  it("appends time entries with one write per matter and takes them back, keeping invoiced ones", async () => {
    const matter: Page = {
      slug: "legal/cases/m",
      title: "Berger",
      type: "legal_case",
      frontmatter: {
        case_number: "M-1",
        time_entries: [{ id: "own", date: "2026-09-01", minutes: 30, description: "Eigen" }],
      },
    };
    const existing: ExistingData = { cases: [matter], contacts: [], deadlines: [] };
    const rows = [
      ["M-1", "02.09.2026", "60", "Schriftsatz"],
      ["M-1", "03.09.2026", "15", "Telefonat"],
    ];
    const plan = planImport(
      "time_entries",
      rows,
      { case_ref: 0, date: 1, minutes: 2, description: 3 },
      existing,
      opts
    );
    const { client, pages, log } = fakeClient([matter]);
    const out = await executeImport(plan, client);
    expect(out.counts.imported).toBe(2);
    expect(log.filter((l) => l.startsWith("update"))).toHaveLength(1);
    expect((pages.get("legal/cases/m")!.frontmatter.time_entries as unknown[]).length).toBe(3);

    // Someone invoices one of the imported entries before the import is taken back.
    const entries = pages.get("legal/cases/m")!.frontmatter.time_entries as Array<
      Record<string, unknown>
    >;
    entries[1].invoice_number = "RE-2026-0007";
    const back = await rollbackImport(out.refs, client);
    expect(back.removedTimeEntries).toBe(1);
    expect(back.kept[0]).toMatch(/verrechnet/);
    const left = (
      pages.get("legal/cases/m")!.frontmatter.time_entries as Array<{ id: string }>
    ).map((e) => e.id);
    expect(left).toEqual(["own", "imp-xyz12345-2"]);
  });

  it("completes contacts and reverts only values nobody changed since", async () => {
    const a: Page = { slug: "contact/a", title: "Anna", frontmatter: { name: "Anna" } };
    const b: Page = { slug: "contact/b", title: "Bert", frontmatter: { name: "Bert" } };
    const existing: ExistingData = { cases: [], contacts: [a, b], deadlines: [] };
    const plan = planImport(
      "contacts",
      [
        ["Anna", "anna@x.at", "1"],
        ["Bert", "bert@x.at", ""],
      ],
      { name: 0, email: 1, phone: 2 },
      existing,
      opts
    );
    const { client, pages } = fakeClient([a, b]);
    const out = await executeImport(plan, client);
    expect(out.counts.completed).toBe(2);
    pages.get("contact/b")!.frontmatter.email = "bert@neu.at";
    const back = await rollbackImport(out.refs, client);
    expect(pages.get("contact/a")!.frontmatter).toMatchObject({ email: "", phone: "" });
    expect(pages.get("contact/b")!.frontmatter.email).toBe("bert@neu.at");
    expect(back.kept).toEqual(["Bert: email wurde inzwischen geändert"]);
  });

  it("archives imported matters and removes imported deadlines on rollback", async () => {
    const matter: Page = { slug: "legal/cases/m", title: "M", frontmatter: { case_number: "M-1" } };
    const existing: ExistingData = { cases: [matter], contacts: [], deadlines: [] };
    const plan = planImport(
      "deadlines",
      [["M-1", "Frist", "01.12.2026"]],
      { case_ref: 0, title: 1, due_date: 2 },
      existing,
      opts
    );
    const { client, pages } = fakeClient([matter]);
    const out = await executeImport(plan, client);
    const back = await rollbackImport(out.refs, client);
    expect(back).toMatchObject({ removedRecords: 1, archivedCases: 0, failed: [] });
    expect(pages.get(out.refs.pages[0])!.frontmatter.status).toBe("tombstoned");
  });
});
