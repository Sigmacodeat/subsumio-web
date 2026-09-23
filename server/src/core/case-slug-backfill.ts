/**
 * Backfill: stamp the canonical `case_slug` on pages that name their matter
 * only through another field (case_ref, matter_slug, …; core/matter-binding.ts).
 *
 * The walls resolve those references on every read, so this is not what
 * closes the leak — it makes the binding explicit for everything that only
 * reads `case_slug` (the web app, document_refs, case discovery) and shows
 * the operator which pages name no matter (unresolved) or several
 * (ambiguous). Those stay unstamped and hidden from walled users.
 *
 * Idempotent: only pages without a case_slug are touched, each with one
 * `jsonb_set` that re-checks the condition. Dry run unless `apply`.
 */
import type { BrainEngine } from "./engine.ts";
import {
  CANONICAL_CASE_FIELD,
  HARD_LIST_REF_FIELDS,
  HARD_SCALAR_REF_FIELDS,
  loadMatterIndex,
  invalidateMatterIndex,
  matterBindingSelectSql,
  resolveMatterRef,
  type MatterIndex,
} from "./matter-binding.ts";

export type CaseSlugBackfillStatus = "stamped" | "would_stamp" | "ambiguous" | "unresolved";

export interface CaseSlugBackfillRow {
  source_id: string;
  slug: string;
  type: string | null;
  /** The hard references the page carries. */
  refs: string[];
  /** Matters they resolve to. */
  matters: string[];
  /** References that name no matter of the page's source. */
  unresolved_refs: string[];
  status: CaseSlugBackfillStatus;
  deleted: boolean;
}

export interface CaseSlugBackfillReport {
  dry_run: boolean;
  rows: CaseSlugBackfillRow[];
  counts: Record<CaseSlugBackfillStatus, number> & { total: number };
}

const HARD_FIELDS: readonly string[] = [...HARD_SCALAR_REF_FIELDS, ...HARD_LIST_REF_FIELDS];

function refsOf(binding: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (typeof v === "number" && Number.isFinite(v)) out.push(String(v));
    else if (Array.isArray(v)) v.forEach(add);
  };
  for (const k of HARD_FIELDS) add(binding[k]);
  return [...new Set(out)];
}

export async function backfillCaseSlugs(
  engine: BrainEngine,
  opts: { sourceId?: string; apply?: boolean } = {}
): Promise<CaseSlugBackfillReport> {
  const apply = opts.apply === true;
  const params: unknown[] = [];
  let sourceFilter = "";
  if (opts.sourceId) {
    params.push(opts.sourceId);
    sourceFilter = `AND source_id = $${params.length}`;
  }
  const keyList = HARD_FIELDS.map((k) => `'${k}'`).join(", ");
  const candidates = await engine.executeRaw<{
    id: number | string;
    source_id: string;
    slug: string;
    type: string | null;
    deleted: boolean | string | null;
    binding: unknown;
  }>(
    `SELECT id, source_id, slug, type, (deleted_at IS NOT NULL) AS deleted,
            ${matterBindingSelectSql()} AS binding
       FROM pages
      WHERE COALESCE(frontmatter->>'${CANONICAL_CASE_FIELD}', '') = ''
        AND type IS DISTINCT FROM 'legal_case'
        AND frontmatter ?| ARRAY[${keyList}]::text[]
        ${sourceFilter}
      ORDER BY source_id, slug`,
    params
  );

  // Fresh matter lists: the report must not depend on a read-path cache.
  const indexes = new Map<string, MatterIndex>();
  for (const s of new Set(candidates.map((c) => c.source_id))) {
    invalidateMatterIndex(s);
    indexes.set(s, await loadMatterIndex(engine, s));
  }

  const rows: CaseSlugBackfillRow[] = [];
  for (const c of candidates) {
    const binding =
      typeof c.binding === "string"
        ? (JSON.parse(c.binding) as Record<string, unknown>)
        : ((c.binding ?? {}) as Record<string, unknown>);
    const refs = refsOf(binding);
    if (refs.length === 0) continue; // keys present, values empty
    const index = indexes.get(c.source_id)!;
    const matters = new Set<string>();
    const unresolvedRefs: string[] = [];
    for (const ref of refs) {
      const resolved = resolveMatterRef(index, ref);
      if (resolved.length === 0) unresolvedRefs.push(ref);
      for (const m of resolved) matters.add(m);
    }
    let status: CaseSlugBackfillStatus;
    if (unresolvedRefs.length > 0) status = "unresolved";
    else if (matters.size !== 1) status = "ambiguous";
    else status = apply ? "stamped" : "would_stamp";

    if (status === "stamped") {
      const [target] = [...matters];
      const updated = await engine.executeRaw<{ id: number }>(
        `UPDATE pages
            SET frontmatter = jsonb_set(frontmatter, '{${CANONICAL_CASE_FIELD}}', to_jsonb($1::text), true)
          WHERE id = $2
            AND COALESCE(frontmatter->>'${CANONICAL_CASE_FIELD}', '') = ''
          RETURNING id`,
        [target, Number(c.id)]
      );
      // Someone stamped it in between: nothing left to do for this page.
      if (updated.length === 0) continue;
    }
    rows.push({
      source_id: c.source_id,
      slug: c.slug,
      type: c.type,
      refs,
      matters: [...matters],
      unresolved_refs: unresolvedRefs,
      status,
      deleted: c.deleted === true || c.deleted === "t",
    });
  }

  const counts = { stamped: 0, would_stamp: 0, ambiguous: 0, unresolved: 0, total: rows.length };
  for (const r of rows) counts[r.status]++;
  return { dry_run: !apply, rows, counts };
}
