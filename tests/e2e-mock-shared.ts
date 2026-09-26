/**
 * Engine behaviour both E2E mock engines (tests/e2e-mock-engine.ts,
 * tests/e2e-workflow-mock-engine.ts) must reproduce exactly, because the web
 * app's fail-closed guards depend on it:
 *
 *  - the conflict check answers in the real engine's shape (`severity`,
 *    `explanation`, per-hit `assessment`) — it IS the real checker
 *    (server/src/core/legal/conflict-check.ts), run over the mock's pages;
 *  - a create-only write (`if_absent`) on a taken slug is refused with
 *    409 `page_exists`;
 *  - page listings are capped at 100 rows and page through `offset` or the
 *    keyset cursor (`x-next-cursor`), like GET /api/pages;
 *  - the atomic array ops (time entries, expenses, billing reservation)
 *    report updated / skipped / not-found ids like page_array_mutate.
 *
 * Pinned by src/test/e2e-mock-contract.test.ts.
 */
import {
  conflictCheck,
  type ConflictResult,
  type ConflictSide,
} from "../server/src/core/legal/conflict-check";

export interface MockPageLike {
  slug: string;
  title: string;
  type: string;
  frontmatter: Record<string, unknown>;
  updated_at?: string;
}

function text(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** The real engine conflict check over the mock's in-memory pages. */
export async function mockConflictCheck(
  store: Iterable<MockPageLike>,
  body: Record<string, unknown>
): Promise<ConflictResult> {
  const all = [...store].filter(
    (p) => p.frontmatter?.status !== "tombstoned" && String(p.frontmatter?.demo ?? "") !== "true"
  );
  const engine = {
    async executeRaw<T>(sql: string): Promise<T[]> {
      if (sql.includes("type = 'person'")) {
        return all
          .filter((p) => p.type === "person" && p.frontmatter?.case_ref)
          .map((p) => ({
            slug: p.slug,
            title: p.title,
            role: text(p.frontmatter.role),
            case_ref: text(p.frontmatter.case_ref),
            aliases: text(p.frontmatter.aliases),
          })) as T[];
      }
      return all
        .filter((p) => p.type === "legal_case" || p.type === "legal_contact")
        .map((p) => ({
          slug: p.slug,
          title: p.title,
          client_name: text(p.frontmatter.client_name),
          opponent_name: text(p.frontmatter.opponent_name),
          additional_opponents: text(p.frontmatter.additional_opponents),
          contact_name: text(p.frontmatter.name),
          contact_company: text(p.frontmatter.company),
          contact_role: text(p.frontmatter.role),
          status: text(p.frontmatter.status),
          page_type: p.type,
        })) as T[];
    },
  };
  return conflictCheck(engine, {
    name: String(body.name ?? ""),
    ...(body.side === "client" || body.side === "opponent"
      ? { side: body.side as ConflictSide }
      : {}),
    ...(typeof body.self_case_slug === "string" ? { selfCaseSlug: body.self_case_slug } : {}),
    ...(Array.isArray(body.own_contact_slugs)
      ? { ownContactSlugs: body.own_contact_slugs.map(String) }
      : {}),
  });
}

/** `if_absent` on a taken slug → the engine's 409, otherwise null. */
export function ifAbsentRejection(
  body: Record<string, unknown>,
  exists: boolean
): { status: 409; body: { error: "page_exists"; message: string } } | null {
  if (body.if_absent !== true || !exists) return null;
  return { status: 409, body: { error: "page_exists", message: "Page already exists." } };
}

// ── Atomic array ops (POST /api/pages/array-append | array-mutate) ─────

export interface ArrayMutationBody {
  match?: Array<string | number | boolean>;
  match_key?: string;
  set?: Record<string, unknown>;
  unset?: string[];
  remove?: boolean;
  unless?: { eq?: Record<string, unknown>; ne?: Record<string, unknown> };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The engine's in-statement skip guard: every eq equal AND every ne different. */
function unlessHit(el: Record<string, unknown>, unless: ArrayMutationBody["unless"]): boolean {
  if (!unless || (!unless.eq && !unless.ne)) return false;
  for (const [k, v] of Object.entries(unless.eq ?? {})) {
    if (!(k in el) || !sameValue(el[k], v)) return false;
  }
  for (const [k, v] of Object.entries(unless.ne ?? {})) {
    if (!(k in el) || el[k] === null || String(el[k]) === String(v)) return false;
  }
  return true;
}

/** Append items to `frontmatter[field]` (engine page_array_append). */
export function applyArrayAppend(
  frontmatter: Record<string, unknown>,
  slug: string,
  field: string,
  items: unknown[]
) {
  const next = [...(Array.isArray(frontmatter[field]) ? (frontmatter[field] as unknown[]) : [])];
  next.push(...items);
  frontmatter[field] = next;
  return { slug, field, appended: items.length, length: next.length, items: next };
}

/** Patch/remove matched elements of `frontmatter[field]` (engine page_array_mutate). */
export function applyArrayMutate(
  frontmatter: Record<string, unknown>,
  slug: string,
  field: string,
  m: ArrayMutationBody
) {
  const key = m.match_key ?? "id";
  const wanted = (m.match ?? []).map(String);
  const list = Array.isArray(frontmatter[field]) ? (frontmatter[field] as unknown[]) : [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const next: unknown[] = [];
  for (const raw of list) {
    const el = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const id = el && el[key] !== undefined && el[key] !== null ? String(el[key]) : null;
    if (!el || id === null || !wanted.includes(id)) {
      next.push(raw);
      continue;
    }
    if (unlessHit(el, m.unless)) {
      skipped.push(id);
      next.push(el);
      continue;
    }
    updated.push(id);
    if (m.remove) continue;
    const out: Record<string, unknown> = { ...el, ...(m.set ?? {}) };
    for (const k of m.unset ?? []) delete out[k];
    next.push(out);
  }
  frontmatter[field] = next;
  const seen = new Set([...updated, ...skipped]);
  return {
    slug,
    field,
    matched_ids: [...seen],
    updated_ids: updated,
    skipped_ids: skipped,
    not_found_ids: wanted.filter((id) => !seen.has(id)),
    items: next,
    length: next.length,
  };
}

/** YYYY-MM-DD n days from now — mock answers never carry a fixed future date. */
export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const MOCK_LIST_MAX = 100;

/**
 * One window of a page listing: newest first, capped at 100, positioned by
 * `cursor` (preferred) or `offset`; `nextCursor` is set while rows remain.
 */
export function listWindow<T extends MockPageLike>(
  items: T[],
  query: URLSearchParams
): { items: T[]; nextCursor: string | null } {
  const limit = Math.max(
    1,
    Math.min(MOCK_LIST_MAX, parseInt(query.get("limit") || "50", 10) || 50)
  );
  const cursor = query.get("cursor");
  const start = Math.max(0, parseInt(cursor ?? query.get("offset") ?? "0", 10) || 0);
  const prefix = query.get("slug_prefix");
  const sorted = (prefix ? items.filter((p) => p.slug.startsWith(prefix)) : [...items]).sort(
    (a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
  );
  const window = sorted.slice(start, start + limit);
  const end = start + window.length;
  return { items: window, nextCursor: end < sorted.length ? String(end) : null };
}
