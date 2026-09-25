// Executes an import plan and takes an import back. Nothing is ever overwritten:
// matters are re-checked before creation, contacts only get empty fields filled,
// time entries are appended once per matter.

import type { ImportPlan, ImportedTimeEntry, PlanRow } from "./plan";
import { normaliseName } from "./values";

export interface ImportClient {
  /** Null when the page does not exist. */
  getPage(
    slug: string
  ): Promise<{ slug: string; title?: string; frontmatter?: Record<string, unknown> } | null>;
  createPage(page: {
    slug: string;
    title: string;
    type: string;
    content?: string;
    frontmatter: Record<string, unknown>;
  }): Promise<void>;
  /** Merge-update: only the given frontmatter keys change. */
  updatePage(page: { slug: string; frontmatter: Record<string, unknown> }): Promise<void>;
  /** Matters are archived, other records removed from every list. */
  deletePage(slug: string): Promise<void>;
  /**
   * Atomic append to a top-level frontmatter array (engine
   * page_array_append). Required — time_entries writes must not go through
   * a read-modify-write merge, or a concurrent append is lost.
   */
  appendPageArray(slug: string, field: string, items: unknown[]): Promise<unknown>;
  /**
   * Rollback of imported time entries (/api/kanzlei-import/rollback-time-entries).
   * The server removes only entries this import appended — also those that
   * arrived marked billed from the previous system — and keeps every entry an
   * invoice of this system holds, checked inside one atomic statement.
   */
  removeImportedTimeEntries(
    caseSlug: string,
    importProjectId: string,
    ids: string[]
  ): Promise<ImportedTimeEntriesRemoval>;
}

export interface ImportedTimeEntriesRemoval {
  removed_ids: string[];
  /** Left in place: invoiced here, or not written by this import. */
  kept_ids: string[];
  not_found_ids: string[];
}

/** The server refused a create because the slug is taken (409 page_exists). */
function isPageExists(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown } | null;
  return !!e && e.status === 409 && e.code === "page_exists";
}

/** What an import wrote, enough to take it back later. */
export interface ImportRefs {
  pages: string[];
  contactCompletions: Array<{ slug: string; fields: Record<string, string> }>;
  timeEntries: Array<{ caseSlug: string; ids: string[] }>;
}

export type RowStatus = "imported" | "completed" | "skipped" | "failed";

export interface RowOutcome {
  row: number;
  label: string;
  status: RowStatus;
  reason?: string;
  warnings: string[];
}

export interface ImportOutcome {
  refs: ImportRefs;
  rows: RowOutcome[];
  counts: Record<RowStatus, number>;
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Speichern fehlgeschlagen";
}

function timeKey(e: { date?: unknown; minutes?: unknown; description?: unknown }): string {
  return `${String(e.date ?? "").slice(0, 10)}|${Number(e.minutes ?? 0)}|${normaliseName(e.description)}`;
}

export async function executeImport(
  plan: ImportPlan,
  client: ImportClient,
  onProgress?: (done: number, total: number) => void
): Promise<ImportOutcome> {
  const refs: ImportRefs = { pages: [], contactCompletions: [], timeEntries: [] };
  const outcomes = new Map<PlanRow, RowOutcome>();
  const set = (r: PlanRow, status: RowStatus, reason?: string) =>
    outcomes.set(r, { row: r.row, label: r.label, status, reason, warnings: r.warnings });

  const writable = plan.rows.filter(
    (r) => r.write && (r.action === "create" || r.action === "complete")
  );
  for (const r of plan.rows)
    if (!writable.includes(r)) set(r, r.action === "error" ? "failed" : "skipped", r.reason);

  let done = 0;
  const total = writable.length;
  const tick = () => onProgress?.(++done, total);

  // Time entries: one read and one write per matter.
  const byCase = new Map<string, PlanRow[]>();
  for (const r of writable) {
    if (r.write?.op === "add_time_entry") {
      byCase.set(r.write.caseSlug, [...(byCase.get(r.write.caseSlug) ?? []), r]);
    }
  }

  for (const r of writable) {
    const w = r.write!;
    if (w.op === "add_time_entry") continue;
    try {
      if (w.op === "create_page") {
        if (await client.getPage(w.slug)) {
          set(r, "skipped", "Wurde inzwischen angelegt");
        } else {
          try {
            await client.createPage({
              slug: w.slug,
              title: w.title,
              type: w.type,
              content: w.content,
              frontmatter: w.frontmatter,
            });
          } catch (err) {
            // Created between the check above and this write: the server
            // refused the create (nothing replaced) — same outcome as above.
            if (isPageExists(err)) {
              set(r, "skipped", "Wurde inzwischen angelegt");
              tick();
              continue;
            }
            throw err;
          }
          refs.pages.push(w.slug);
          set(r, "imported");
        }
      } else {
        const current = await client.getPage(w.slug);
        if (!current) {
          set(r, "failed", "Kontakt nicht mehr vorhanden");
        } else {
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(w.fields)) {
            const now = current.frontmatter?.[k];
            if (typeof now !== "string" || !now.trim()) fields[k] = v;
          }
          if (Object.keys(fields).length === 0) {
            set(r, "skipped", "Inzwischen schon ausgefüllt");
          } else {
            await client.updatePage({ slug: w.slug, frontmatter: fields });
            refs.contactCompletions.push({ slug: w.slug, fields });
            set(r, "completed", `Ergänzt: ${Object.keys(fields).join(", ")}`);
          }
        }
      }
    } catch (err) {
      set(r, "failed", message(err));
    }
    tick();
  }

  for (const [caseSlug, rows] of byCase) {
    try {
      const page = await client.getPage(caseSlug);
      if (!page) {
        for (const r of rows) set(r, "failed", "Akte nicht mehr vorhanden");
      } else {
        const current = Array.isArray(page.frontmatter?.time_entries)
          ? (page.frontmatter.time_entries as Array<Record<string, unknown>>)
          : [];
        const keys = new Set(current.map(timeKey));
        const ids = new Set(current.map((e) => String(e.id ?? "")));
        const added: ImportedTimeEntry[] = [];
        for (const r of rows) {
          const entry = (r.write as { entry: ImportedTimeEntry }).entry;
          if (ids.has(entry.id) || keys.has(timeKey(entry))) {
            set(r, "skipped", "Gleicher Eintrag ist in der Akte schon erfasst");
          } else {
            keys.add(timeKey(entry));
            added.push(entry);
          }
        }
        if (added.length > 0) {
          // Atomic append — a merge-update would rewrite the whole array
          // from the (possibly already stale) `current` snapshot and could
          // drop an entry another writer just added.
          await client.appendPageArray(caseSlug, "time_entries", added);
          refs.timeEntries.push({ caseSlug, ids: added.map((e) => e.id) });
          const addedIds = new Set(added.map((e) => e.id));
          for (const r of rows) {
            if (addedIds.has((r.write as { entry: ImportedTimeEntry }).entry.id))
              set(r, "imported");
          }
        }
      }
    } catch (err) {
      for (const r of rows)
        if (!outcomes.has(r) || outcomes.get(r)?.status !== "skipped")
          set(r, "failed", message(err));
    }
    for (let i = 0; i < rows.length; i++) tick();
  }

  const rowsOut = plan.rows.map((r) => outcomes.get(r)!);
  const counts: Record<RowStatus, number> = { imported: 0, completed: 0, skipped: 0, failed: 0 };
  for (const o of rowsOut) counts[o.status]++;
  return { refs, rows: rowsOut, counts };
}

export interface RollbackResult {
  archivedCases: number;
  removedRecords: number;
  revertedContacts: number;
  removedTimeEntries: number;
  /** Things deliberately left in place, with the reason. */
  kept: string[];
  failed: string[];
}

export async function rollbackImport(
  refs: ImportRefs,
  client: ImportClient,
  /** The import's project id — stamped as import_project_id on its entries. */
  importProjectId: string
): Promise<RollbackResult> {
  const result: RollbackResult = {
    archivedCases: 0,
    removedRecords: 0,
    revertedContacts: 0,
    removedTimeEntries: 0,
    kept: [],
    failed: [],
  };

  for (const { caseSlug, ids } of refs.timeEntries) {
    try {
      // Server-checked removal: an entry invoiced since the import (it has an
      // invoice number) is kept, never dropped — removing it would break that
      // invoice's basis. Entries imported as already billed in the previous
      // system carry no invoice number here and are taken back.
      const res = await client.removeImportedTimeEntries(caseSlug, importProjectId, ids);
      result.removedTimeEntries += res.removed_ids.length;
      if (res.kept_ids.length > 0)
        result.kept.push(
          `${res.kept_ids.length} Zeiteintrag/-einträge in ${caseSlug}: inzwischen verrechnet`
        );
    } catch (err) {
      result.failed.push(`${caseSlug}: ${message(err)}`);
    }
  }

  for (const { slug, fields } of refs.contactCompletions) {
    try {
      const page = await client.getPage(slug);
      if (!page) continue;
      const revert: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (page.frontmatter?.[k] === v) revert[k] = "";
        else result.kept.push(`${page.title ?? slug}: ${k} wurde inzwischen geändert`);
      }
      if (Object.keys(revert).length > 0) {
        await client.updatePage({ slug, frontmatter: revert });
        result.revertedContacts++;
      }
    } catch (err) {
      result.failed.push(`${slug}: ${message(err)}`);
    }
  }

  for (const slug of refs.pages) {
    try {
      await client.deletePage(slug);
      if (slug.startsWith("legal/cases/")) result.archivedCases++;
      else result.removedRecords++;
    } catch (err) {
      result.failed.push(`${slug}: ${message(err)}`);
    }
  }
  return result;
}
