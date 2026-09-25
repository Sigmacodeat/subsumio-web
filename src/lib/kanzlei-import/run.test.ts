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
      if (p.title === "RACE") {
        // Another user created the matter after the runner's check; the
        // server refuses the create instead of replacing it.
        pages.set(p.slug, { slug: p.slug, title: "Kollegin", frontmatter: {} });
        throw Object.assign(new Error("exists"), { status: 409, code: "page_exists" });
      }
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
    async appendPageArray(slug, field, items) {
      log.push(`append ${slug}.${field}`);
      const p = pages.get(slug)!;
      const cur = Array.isArray(p.frontmatter[field]) ? (p.frontmatter[field] as unknown[]) : [];
      p.frontmatter[field] = [...cur, ...items];
      return { items: p.frontmatter[field] };
    },
    // Faithful mirror of the engine's page_array_mutate: matched elements
    // get `set` merged / `unset` dropped / removed — skipped unchanged when
    // `unless` holds (eq: every pair equal; ne: every key exists and differs).
    async mutatePageArray(slug, field, mutation) {
      const p = pages.get(slug);
      const cur =
        p && Array.isArray(p.frontmatter[field])
          ? (p.frontmatter[field] as Record<string, unknown>[])
          : [];
      const key = mutation.match_key ?? "id";
      const wanted = new Set(mutation.match.map(String));
      const matched: string[] = [];
      const skipped: string[] = [];
      const unlessHolds = (e: Record<string, unknown>) => {
        const u = mutation.unless;
        if (!u) return false;
        for (const [k, v] of Object.entries(u.eq ?? {})) if (e[k] !== v) return false;
        for (const [k, v] of Object.entries(u.ne ?? {})) if (!(k in e) || e[k] === v) return false;
        return true;
      };
      const next: unknown[] = [];
      for (const e of cur) {
        const id = String(e[key]);
        if (!wanted.has(id)) {
          next.push(e);
          continue;
        }
        matched.push(id);
        if (unlessHolds(e)) {
          skipped.push(id);
          next.push(e);
          continue;
        }
        if (mutation.remove) continue;
        const patched = { ...e, ...(mutation.set ?? {}) };
        for (const k of mutation.unset ?? []) delete patched[k];
        next.push(patched);
      }
      if (p) p.frontmatter[field] = next;
      return {
        slug,
        field,
        matched_ids: matched,
        updated_ids: matched.filter((id) => !skipped.includes(id)),
        skipped_ids: skipped,
        not_found_ids: mutation.match.map(String).filter((id) => !matched.includes(id)),
        items: next,
        length: next.length,
      };
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

  it("a matter created after the runner's check is refused by the server and reported as skipped", async () => {
    const existing: ExistingData = { cases: [], contacts: [], deadlines: [] };
    const plan = planImport("cases", [["RACE", "7"]], { title: 0, case_number: 1 }, existing, opts);
    const { client, pages } = fakeClient([]);
    const out = await executeImport(plan, client);
    expect(out.rows.map((r) => `${r.status} ${r.reason ?? ""}`.trim())).toEqual([
      "skipped Wurde inzwischen angelegt",
    ]);
    expect(out.refs.pages).toEqual([]);
    expect(pages.get("legal/cases/7")?.title).toBe("Kollegin");
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
    // One atomic append per matter — no read-modify-write merge.
    expect(log.filter((l) => l.startsWith("append"))).toHaveLength(1);
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
