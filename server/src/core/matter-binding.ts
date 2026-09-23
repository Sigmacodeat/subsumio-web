/**
 * Which matter a page belongs to.
 *
 * The matter walls (core/matter-access.ts) deny matter slugs. A page belongs
 * to a matter by its slug path (`legal/cases/a/…`) and by its frontmatter —
 * and writers use more than one frontmatter field for that:
 *
 *   case_slug                      canonical binding (agents, uploads, chats)
 *   case_ref                       legal pipeline, Wiedervorlage, Verhandlungs-
 *                                  mappe, Judikatur-Watch, beA import (external
 *                                  Aktenzeichen), Kanzlei import
 *   matter_slug, case, legal_case  older writers and readers
 *   assigned_case_slug             beA / triage assignment
 *   converted_case_slug            intake request turned into a matter
 *   case_slugs, linked_cases,      pages about several matters (cross-case
 *   related_case_slugs             matrix, invoices, pipeline state)
 *
 * These "hard" references bind a page. A reference can be a slug, a case
 * number ("26-0001", "2026/101", a court number) or a matter title; it is
 * resolved against the source's matters (the MatterIndex below). A hard
 * reference that resolves to no matter is UNRESOLVED: the page is visible
 * only to callers with firm-wide visibility (no matter walls, no allow-list),
 * never to a walled user.
 *
 * "Soft" references (matter, case_number, case_title, case_reference,
 * matter_reference, assigned_case_number, aktenzeichen) are free text on many
 * pages — a booking request's `matter`, a court decision's `case_number`. They
 * bind a page only when it has no hard reference and they resolve to a matter
 * of the page's own source; otherwise they are ignored.
 *
 * A `legal_case` page is bound by its own slug (and case_slug); its other
 * fields describe the matter (its number, related matters) and never make the
 * case page itself part of another matter.
 *
 * `case_slug` stays authoritative: a value that is not a known matter still
 * counts as that matter (as before), it is never unresolved.
 */
import { onMatterAccessChanged } from "./matter-access-db.ts";
import { PRIVATE_CHAT_PREFIX, type MatterScope } from "./matter-access.ts";

export const CANONICAL_CASE_FIELD = "case_slug";
export const HARD_SCALAR_REF_FIELDS = [
  "case_ref",
  "matter_slug",
  "case",
  "legal_case",
  "assigned_case_slug",
  "converted_case_slug",
] as const;
export const HARD_LIST_REF_FIELDS = ["case_slugs", "linked_cases", "related_case_slugs"] as const;
export const SOFT_REF_FIELDS = [
  "matter",
  "case_number",
  "case_title",
  "case_reference",
  "matter_reference",
  "assigned_case_number",
  "aktenzeichen",
] as const;

/** Every frontmatter field that can bind a page to a matter. */
export const MATTER_BINDING_FIELDS: readonly string[] = [
  CANONICAL_CASE_FIELD,
  ...HARD_SCALAR_REF_FIELDS,
  ...HARD_LIST_REF_FIELDS,
  ...SOFT_REF_FIELDS,
];

/** Fields of a legal_case page a reference may name it by. */
const MATTER_NUMBER_FIELDS = [
  "case_number",
  "court_case_number",
  "geschäftszahl",
  "geschaeftszahl",
  "aktenzeichen",
] as const;

/**
 * SQL expression selecting only the binding fields of a page's frontmatter
 * (a small jsonb object, `{}` when there are none). Plain SQL, identical on
 * Postgres and PGLite.
 */
export function matterBindingSelectSql(column = "frontmatter"): string {
  const pairs = MATTER_BINDING_FIELDS.map((k) => `'${k}', ${column}->'${k}'`).join(", ");
  return `jsonb_strip_nulls(jsonb_build_object(${pairs}))`;
}

/** Any engine that runs raw SQL (BrainEngine, or a narrower test double). */
export interface RawEngine {
  executeRaw<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

// ── Matter index ──────────────────────────────────────────────

export interface MatterIndex {
  /** Slugs of the source's (not deleted) legal_case pages. */
  slugs: Set<string>;
  /** Normalized case numbers, titles and last slug segments → matter slugs. */
  byKey: Map<string, string[]>;
}

export interface MatterIndexRow {
  slug: string;
  title?: string | null;
  numbers?: Array<string | null | undefined>;
}

/** Case numbers, titles: lower case, letters and digits only. */
export function normalizeMatterRef(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Shorter keys ("a", "12") would match too much. */
const MIN_KEY_LENGTH = 4;

export function buildMatterIndex(rows: MatterIndexRow[]): MatterIndex {
  const slugs = new Set<string>();
  const byKey = new Map<string, string[]>();
  const add = (raw: string | null | undefined, slug: string) => {
    if (typeof raw !== "string") return;
    const key = normalizeMatterRef(raw);
    if (key.length < MIN_KEY_LENGTH) return;
    const list = byKey.get(key) ?? [];
    if (!list.includes(slug)) list.push(slug);
    byKey.set(key, list);
  };
  for (const row of rows) {
    if (!row.slug) continue;
    slugs.add(row.slug);
    add(row.slug.split("/").pop(), row.slug);
    add(row.title, row.slug);
    for (const n of row.numbers ?? []) add(n, row.slug);
  }
  return { slugs, byKey };
}

/**
 * The matters a reference names: the matter itself or one above it in the
 * slug tree, else every matter whose number, title or slug tail matches.
 * Empty = unresolved.
 */
export function resolveMatterRef(index: MatterIndex, ref: string): string[] {
  const r = ref.trim();
  if (!r) return [];
  if (index.slugs.has(r)) return [r];
  const parts = r.split("/");
  for (let i = parts.length - 1; i > 0; i--) {
    const ancestor = parts.slice(0, i).join("/");
    if (index.slugs.has(ancestor)) return [ancestor];
  }
  const key = normalizeMatterRef(r);
  if (key.length < MIN_KEY_LENGTH) return [];
  return [...(index.byKey.get(key) ?? [])];
}

const INDEX_TTL_MS = 10_000;
interface CachedIndex {
  at: number;
  gen: number;
  index: Promise<MatterIndex>;
}
const indexCache = new WeakMap<object, Map<string, CachedIndex>>();
const sourceGen = new Map<string, number>();
let globalGen = 0;

function genOf(sourceId: string): number {
  return globalGen * 1_000_003 + (sourceGen.get(sourceId) ?? 0);
}

/** Forget the cached matter index of one source (or of all sources). */
export function invalidateMatterIndex(sourceId?: string): void {
  if (sourceId === undefined) globalGen++;
  else sourceGen.set(sourceId, (sourceGen.get(sourceId) ?? 0) + 1);
}
// A changed case page (web API, agent private area) clears the index too.
onMatterAccessChanged((sourceId) => invalidateMatterIndex(sourceId));

async function queryMatterIndex(engine: RawEngine, sourceId: string): Promise<MatterIndex> {
  const numberCols = MATTER_NUMBER_FIELDS.map((f, i) => `frontmatter->>'${f}' AS n${i}`).join(", ");
  const rows = await engine.executeRaw<Record<string, string | null>>(
    `SELECT slug, title, ${numberCols}
       FROM pages
      WHERE source_id = $1
        AND type = 'legal_case'
        AND deleted_at IS NULL`,
    [sourceId]
  );
  return buildMatterIndex(
    rows.map((r) => ({
      slug: String(r.slug ?? ""),
      title: r.title,
      numbers: MATTER_NUMBER_FIELDS.map((_, i) => r[`n${i}`]),
    }))
  );
}

/**
 * The matters of one source, cached for a few seconds per engine. A stale
 * index can only miss a matter created a moment ago — its references then
 * read as unresolved, which hides rather than shows.
 */
export function loadMatterIndex(engine: RawEngine, sourceId: string): Promise<MatterIndex> {
  let perEngine = indexCache.get(engine);
  if (!perEngine) {
    perEngine = new Map();
    indexCache.set(engine, perEngine);
  }
  const gen = genOf(sourceId);
  const hit = perEngine.get(sourceId);
  if (hit && hit.gen === gen && Date.now() - hit.at < INDEX_TTL_MS) return hit.index;
  const index = queryMatterIndex(engine, sourceId);
  const entry: CachedIndex = { at: Date.now(), gen, index };
  perEngine.set(sourceId, entry);
  // A failed load must not be served from the cache.
  index.catch(() => {
    if (perEngine!.get(sourceId) === entry) perEngine!.delete(sourceId);
  });
  return index;
}

// ── Binding of one page ───────────────────────────────────────

export interface MatterBinding {
  /** Canonical matter slugs the page belongs to (besides its slug path). */
  matters: string[];
  /** Hard references that name no matter: fail closed. */
  unresolved: string[];
}

export interface BindablePage {
  slug?: string;
  type?: string | null;
  frontmatter?: unknown;
  /** Search rows carry the projected case_slug instead of frontmatter. */
  case_slug?: unknown;
}

function asObject(v: unknown): Record<string, unknown> {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (typeof v === "number" && Number.isFinite(v)) return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => strings(x));
  return [];
}

/** True when the frontmatter carries any field that can bind a matter. */
export function hasMatterBindingFields(frontmatter: unknown): boolean {
  const fm = asObject(frontmatter);
  return MATTER_BINDING_FIELDS.some((k) => strings(fm[k]).length > 0);
}

/**
 * The matters `page` belongs to. Without an index (no database at hand) every
 * hard reference other than the page's own case_slug is unresolved — the
 * safe answer.
 */
export function pageMatterBinding(page: BindablePage, index?: MatterIndex): MatterBinding {
  const fm = asObject(page.frontmatter);
  const matters = new Set<string>();
  const unresolved: string[] = [];
  const canonical = strings(fm[CANONICAL_CASE_FIELD]);
  if (canonical.length === 0) canonical.push(...strings(page.case_slug));
  for (const c of canonical) {
    matters.add(c);
    if (index) for (const m of resolveMatterRef(index, c)) matters.add(m);
  }
  const type = page.type ?? (typeof fm.type === "string" ? fm.type : undefined);
  if (type === "legal_case") return { matters: [...matters], unresolved };

  const hard = [
    ...HARD_SCALAR_REF_FIELDS.flatMap((k) => strings(fm[k])),
    ...HARD_LIST_REF_FIELDS.flatMap((k) => strings(fm[k])),
  ];
  for (const ref of hard) {
    if (canonical.includes(ref)) continue;
    const resolved = index ? resolveMatterRef(index, ref) : [];
    if (resolved.length === 0) unresolved.push(ref);
    for (const m of resolved) matters.add(m);
  }
  if (matters.size === 0 && unresolved.length === 0 && index) {
    for (const ref of SOFT_REF_FIELDS.flatMap((k) => strings(fm[k]))) {
      for (const m of resolveMatterRef(index, ref)) matters.add(m);
    }
  }
  return { matters: [...matters], unresolved };
}

// ── Scope decision ────────────────────────────────────────────

function underPrefix(prefix: string, candidate: string): boolean {
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

/**
 * Firm-wide visibility: everything allowed, nothing denied except colleagues'
 * private conversations (which every web caller's scope denies).
 */
export function scopeIsFirmWide(scope: MatterScope | undefined): boolean {
  if (scope === undefined || scope === "all") return true;
  if (!scope.includes("*")) return false;
  return scope.every(
    (e) => e === "*" || (e.startsWith("!") && e.slice(1).startsWith(PRIVATE_CHAT_PREFIX))
  );
}

/**
 * The one visibility decision for a page: no deny entry may cover its slug or
 * any of its matters; an allow-list must cover every matter (or, for an
 * unbound page, the slug); an unresolved reference needs firm-wide visibility.
 */
export function pageBindingAllowed(
  scope: MatterScope | undefined,
  slug: string,
  binding: MatterBinding
): boolean {
  if (scope === undefined || scope === "all") return true;
  if (scope.length === 0) return false;
  let allowAll = false;
  const allow: string[] = [];
  for (const entry of scope) {
    if (entry === "*") allowAll = true;
    else if (entry.startsWith("!")) {
      const denied = entry.slice(1);
      if (underPrefix(denied, slug)) return false;
      if (binding.matters.some((m) => underPrefix(denied, m))) return false;
      if (binding.unresolved.some((u) => underPrefix(denied, u))) return false;
    } else allow.push(entry);
  }
  if (binding.unresolved.length > 0) return scopeIsFirmWide(scope);
  if (allowAll) return true;
  if (binding.matters.length > 0) {
    return binding.matters.every((m) => allow.some((a) => underPrefix(a, m)));
  }
  return allow.some((a) => underPrefix(a, slug));
}

/** Convenience: decide for a page whose frontmatter is at hand. */
export function pageInMatterScope(
  scope: MatterScope | undefined,
  page: BindablePage,
  index?: MatterIndex
): boolean {
  return pageBindingAllowed(scope, page.slug ?? "", pageMatterBinding(page, index));
}

// ── Bulk resolution for read paths ────────────────────────────

export interface BindingRow {
  slug?: string;
  page_id?: number;
  source_id?: string;
  type?: string | null;
  frontmatter?: unknown;
  case_slug?: unknown;
}

interface StoredBinding {
  source_id: string;
  slug: string;
  type: string | null;
  frontmatter: Record<string, unknown>;
}

function hasFrontmatter(row: BindingRow): boolean {
  return row.frontmatter !== undefined && row.frontmatter !== null;
}

/**
 * The binding of every row, in one pass: rows that carry their frontmatter
 * are used as they are; the others (search hits, graph slugs) get their
 * current binding fields from the database in one query by page id and one by
 * slug — never from a cached projection. Matter indexes are loaded once per
 * source. A slug that exists in several of `sources` must pass for every copy,
 * so the bindings of all copies are merged.
 */
export async function resolveRowBindings(
  engine: RawEngine,
  rows: readonly BindingRow[],
  opts: { sourceId?: string; sources?: readonly string[] } = {}
): Promise<MatterBinding[]> {
  const fallbackSource = opts.sourceId ?? "default";
  const byId = new Map<number, StoredBinding>();
  const bySlug = new Map<string, StoredBinding[]>();

  const needIds = [
    ...new Set(
      rows
        .filter((r) => !hasFrontmatter(r) && Number.isFinite(r.page_id))
        .map((r) => Number(r.page_id))
    ),
  ];
  if (needIds.length > 0) {
    const found = await engine.executeRaw<{
      id: number | string;
      source_id: string;
      slug: string;
      type: string | null;
      binding: unknown;
    }>(
      `SELECT id, source_id, slug, type, ${matterBindingSelectSql()} AS binding
         FROM pages WHERE id = ANY($1::bigint[])`,
      [needIds]
    );
    for (const f of found) {
      byId.set(Number(f.id), {
        source_id: f.source_id,
        slug: f.slug,
        type: f.type,
        frontmatter: asObject(f.binding),
      });
    }
  }
  const needSlugs = [
    ...new Set(
      rows
        .filter(
          (r) =>
            !hasFrontmatter(r) &&
            !(Number.isFinite(r.page_id) && byId.has(Number(r.page_id))) &&
            typeof r.slug === "string" &&
            r.slug.length > 0
        )
        .map((r) => r.slug as string)
    ),
  ];
  if (needSlugs.length > 0) {
    const sources = [
      ...new Set([
        ...(opts.sources ?? []),
        fallbackSource,
        ...rows.map((r) => r.source_id).filter((s): s is string => typeof s === "string"),
      ]),
    ];
    const found = await engine.executeRaw<{
      source_id: string;
      slug: string;
      type: string | null;
      binding: unknown;
    }>(
      `SELECT source_id, slug, type, ${matterBindingSelectSql()} AS binding
         FROM pages
        WHERE slug = ANY($1::text[]) AND source_id = ANY($2::text[]) AND deleted_at IS NULL`,
      [needSlugs, sources]
    );
    for (const f of found) {
      const list = bySlug.get(f.slug) ?? [];
      list.push({
        source_id: f.source_id,
        slug: f.slug,
        type: f.type,
        frontmatter: asObject(f.binding),
      });
      bySlug.set(f.slug, list);
    }
  }

  // What each row is decided on: its own frontmatter, or the stored copies.
  const candidates: StoredBinding[][] = rows.map((r) => {
    const source = r.source_id ?? fallbackSource;
    if (hasFrontmatter(r)) {
      const fm = asObject(r.frontmatter);
      const projected = typeof r.case_slug === "string" && r.case_slug ? r.case_slug : undefined;
      return [
        {
          source_id: source,
          slug: r.slug ?? "",
          type: r.type ?? null,
          frontmatter:
            projected && strings(fm[CANONICAL_CASE_FIELD]).length === 0
              ? { ...fm, [CANONICAL_CASE_FIELD]: projected }
              : fm,
        },
      ];
    }
    const stored = Number.isFinite(r.page_id) ? byId.get(Number(r.page_id)) : undefined;
    if (stored) return [stored];
    const copies = (r.slug ? bySlug.get(r.slug) : undefined) ?? [];
    const sameSource = r.source_id ? copies.filter((c) => c.source_id === r.source_id) : copies;
    if (sameSource.length > 0) return sameSource;
    // Not in the database (or not readable): decide on what the row says.
    return [
      {
        source_id: source,
        slug: r.slug ?? "",
        type: r.type ?? null,
        frontmatter:
          typeof r.case_slug === "string" && r.case_slug
            ? { [CANONICAL_CASE_FIELD]: r.case_slug }
            : {},
      },
    ];
  });

  const indexSources = new Set<string>();
  for (const list of candidates) {
    for (const c of list) if (hasMatterBindingFields(c.frontmatter)) indexSources.add(c.source_id);
  }
  const indexes = new Map<string, MatterIndex>();
  await Promise.all(
    [...indexSources].map(async (s) => indexes.set(s, await loadMatterIndex(engine, s)))
  );

  return candidates.map((list) => {
    const matters = new Set<string>();
    const unresolved: string[] = [];
    for (const c of list) {
      const b = pageMatterBinding(
        { slug: c.slug, type: c.type, frontmatter: c.frontmatter },
        indexes.get(c.source_id)
      );
      for (const m of b.matters) matters.add(m);
      unresolved.push(...b.unresolved);
    }
    return { matters: [...matters], unresolved };
  });
}

/**
 * Keep the rows `scope` may see. Loads bindings and matter indexes in bulk
 * (see resolveRowBindings); an unrestricted scope costs nothing.
 */
export async function filterRowsByMatterBinding<T extends BindingRow>(
  engine: RawEngine,
  rows: T[],
  scope: MatterScope | undefined,
  opts: { sourceId?: string; sources?: readonly string[] } = {}
): Promise<T[]> {
  if (scope === undefined || scope === "all") return rows;
  if (scope.length === 0) return [];
  if (rows.length === 0) return rows;
  const bindings = await resolveRowBindings(engine, rows, opts);
  return rows.filter((r, i) => pageBindingAllowed(scope, r.slug ?? "", bindings[i]!));
}

/**
 * The canonical case_slug a writer should stamp on a page that names its
 * matter only through other fields: the one matter all its hard references
 * resolve to. Undefined when the page already has a case_slug, is a case page,
 * has no hard reference, or its references are unresolved or name several
 * matters (those stay for the read-time resolution and the operator report).
 */
export function canonicalCaseSlugFor(
  page: { type?: string | null; frontmatter?: unknown },
  index: MatterIndex
): string | undefined {
  const fm = asObject(page.frontmatter);
  if (strings(fm[CANONICAL_CASE_FIELD]).length > 0) return undefined;
  const type = page.type ?? (typeof fm.type === "string" ? fm.type : undefined);
  if (type === "legal_case") return undefined;
  const hard = [
    ...HARD_SCALAR_REF_FIELDS.flatMap((k) => strings(fm[k])),
    ...HARD_LIST_REF_FIELDS.flatMap((k) => strings(fm[k])),
  ];
  if (hard.length === 0) return undefined;
  const matters = new Set<string>();
  for (const ref of hard) {
    const resolved = resolveMatterRef(index, ref);
    if (resolved.length === 0) return undefined;
    for (const m of resolved) matters.add(m);
  }
  return matters.size === 1 ? [...matters][0] : undefined;
}

// ── Writers ───────────────────────────────────────────────────

/**
 * `page` with `case_slug` stamped when one of its hard references is exactly
 * `caseSlug` (the matter the writer works for) and it has no case_slug yet.
 * Case pages and pages about other matters are left unchanged.
 */
export function stampCaseSlugFrom<
  T extends { type?: string | null; frontmatter?: Record<string, unknown> },
>(page: T, caseSlug: string): T {
  if (!caseSlug) return page;
  const fm = page.frontmatter ?? {};
  if (strings(fm[CANONICAL_CASE_FIELD]).length > 0) return page;
  const type = page.type ?? (typeof fm.type === "string" ? fm.type : undefined);
  if (type === "legal_case") return page;
  const hard = [
    ...HARD_SCALAR_REF_FIELDS.flatMap((k) => strings(fm[k])),
    ...HARD_LIST_REF_FIELDS.flatMap((k) => strings(fm[k])),
  ];
  if (!hard.includes(caseSlug)) return page;
  return { ...page, frontmatter: { ...fm, [CANONICAL_CASE_FIELD]: caseSlug } };
}

interface PagePutter {
  putPage(slug: string, page: never, opts?: never): Promise<unknown>;
}

/**
 * An engine whose putPage stamps `case_slug` on every page bound to
 * `caseSlug` by another field (see stampCaseSlugFrom) — for writers that work
 * for one matter, like the legal pipeline. Everything else passes through to
 * the engine unchanged (methods bound to it), transactions included.
 */
export function withCaseSlugStamp<E extends PagePutter>(engine: E, caseSlug: string): E {
  return new Proxy(engine, {
    get(target, prop) {
      if (prop === "putPage") {
        return (
          slug: string,
          page: { type?: string | null; frontmatter?: Record<string, unknown> },
          opts?: unknown
        ) =>
          (target.putPage as (s: string, p: unknown, o?: unknown) => Promise<unknown>).call(
            target,
            slug,
            stampCaseSlugFrom(page, caseSlug),
            opts
          );
      }
      if (prop === "transaction") {
        const tx = Reflect.get(target, prop, target) as unknown;
        if (typeof tx !== "function") return tx;
        return (fn: (e: unknown) => Promise<unknown>) =>
          (tx as (f: (e: unknown) => Promise<unknown>) => Promise<unknown>).call(target, (inner) =>
            fn(withCaseSlugStamp(inner as PagePutter, caseSlug))
          );
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
