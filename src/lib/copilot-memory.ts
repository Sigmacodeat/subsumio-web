/**
 * Copilot Memory — Persistent user-specific memory entries
 *
 * Stores user preferences, recurring topics, important facts, and
 * interaction patterns that persist across sessions and enrich the
 * system prompt with personalized context.
 *
 * Memory types:
 * - preference: User-stated preferences (language, detail level, etc.)
 * - fact: Important facts about the user or their practice
 * - topic: Recurring topics the user frequently asks about
 * - instruction: Standing instructions for the Copilot
 * - case_note: Cross-session notes about specific cases
 */

import { api } from "@/lib/api";
import { pageTypeOf } from "@/lib/types";
import type { BrainPage } from "@/lib/types";

// Deliberately NOT importing ENGINE_URL from "@/lib/engine": that module
// pulls in `next/headers` (server-only) and, transitively, `node:fs` via
// src/lib/plans.ts — fine for a server-only file, but this module is also
// imported client-side (session-memory.ts -> chat-panel.tsx), and a static
// import breaks the client bundle even though the code only runs when
// `headers` is passed (server-side). Same constant, same env var, just
// without the heavy import.
const ENGINE_URL = process.env.SUBSUMIO_API_URL || "http://localhost:3001";

/**
 * `api.brain.*` resolves against the engine directly (not through this
 * app's own `/api/*` proxy) whenever it runs server-side — see BASE_URL in
 * `@/lib/api.ts`. That's fine when the caller is a browser (cookies carry
 * the session), but this module is also called from `/api/copilot/memory`
 * itself, a server Route Handler — there the client sent no engine auth at
 * all and every call failed with "Invalid or missing API key" (401 from
 * `server/src/commands/web-api.ts`), surfaced to lawyers as the memory
 * settings page silently showing nothing.
 *
 * `headers` is optional and only needed for that server-side path — pass
 * `ctx.headers` there (see `cockpit.ts`'s `fetchPagesByType` for the same
 * pattern). Callers that already run in the browser (the live chat) omit it
 * and keep using the `api.brain.*` client as before.
 */
type EngineHeaders = Record<string, string> | undefined;

async function enginePagesList(
  headers: EngineHeaders,
  params: { type: string; limit: number }
): Promise<BrainPage[]> {
  // Cursor-paginated on both paths: a bare listPages call stops silently at
  // the engine's 100-row cap. (This file is also imported client-side, so it
  // must not pull @/lib/engine-pages — that module is server-only.)
  if (!headers) return api.brain.listAllPages({ type: params.type, max: params.limit });
  const out = new Map<string, BrainPage>();
  let fetched = 0;
  let cursor: string | undefined;
  let iterations = 0;
  for (;;) {
    if (++iterations > 1000) break;
    const want = Math.min(100, params.limit - fetched);
    if (want <= 0) break;
    const pageParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : `&offset=${fetched}`;
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=${encodeURIComponent(params.type)}&limit=${want}${pageParam}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`engine_pages_list_failed_${res.status}`);
    const data = (await res.json()) as unknown;
    const batch = Array.isArray(data) ? (data as BrainPage[]) : [];
    fetched += batch.length;
    for (const p of batch) if (p?.slug) out.set(p.slug, p);
    const next = res.headers.get("x-next-cursor");
    if (next && next !== cursor) {
      cursor = next;
      continue;
    }
    if (batch.length < want) break;
  }
  return [...out.values()];
}

async function enginePageGet(headers: EngineHeaders, slug: string): Promise<BrainPage | null> {
  if (!headers) return api.brain.getPage(slug);
  const path = slug.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return (await res.json()) as BrainPage;
}

async function enginePagesBatch(
  headers: EngineHeaders,
  slugs: string[]
): Promise<Record<string, BrainPage>> {
  if (slugs.length === 0) return {};
  if (!headers) return api.brain.getPages(slugs);
  const res = await fetch(`${ENGINE_URL}/api/pages/batch`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ slugs }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`engine_pages_batch_failed_${res.status}`);
  const data = (await res.json()) as { pages: Record<string, BrainPage> };
  return data.pages;
}

async function enginePageWrite(
  headers: EngineHeaders,
  page: {
    slug: string;
    title: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  },
  opts: { merge: boolean }
): Promise<void> {
  if (!headers) {
    if (opts.merge) await api.brain.updatePage(page);
    else await api.brain.createPage(page);
    return;
  }
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(opts.merge ? { ...page, merge: true } : page),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`engine_page_write_failed_${res.status}`);
}

async function enginePageDelete(headers: EngineHeaders, slug: string): Promise<void> {
  if (!headers) {
    await api.brain.deletePage(slug);
    return;
  }
  const path = slug.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
    method: "DELETE",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`engine_page_delete_failed_${res.status}`);
}

async function engineSearch(
  headers: EngineHeaders,
  query: string,
  limit: number
): Promise<Array<{ slug: string }>> {
  if (!headers) return api.brain.search(query, limit);
  const res = await fetch(
    `${ENGINE_URL}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`engine_search_failed_${res.status}`);
  return (await res.json()) as Array<{ slug: string }>;
}

export type MemoryType = "preference" | "fact" | "topic" | "instruction" | "case_note";

export type MemorySource = "user_explicit" | "inferred" | "system";

export interface CopilotMemoryEntry {
  id: string;
  type: MemoryType;
  key: string;
  value: string;
  source: MemorySource;
  caseSlug?: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  timesReferenced: number;
  entities?: string[];
  supersededBy?: string;
  validFrom?: string;
  validTo?: string;
  /** WP-5.30: user who owns this entry. Missing on legacy firm-shared rows. */
  ownerId?: string;
}

/** Who is acting on a memory — drives the per-user ownership check. */
export interface MemoryActor {
  userId: string;
  isAdmin: boolean;
}

/**
 * Per-user visibility: entries with an `owner_id` are private to that user;
 * legacy rows without an owner stay firm-shared (pre-WP-5.30 behaviour).
 */
export function memoryVisibleTo(m: CopilotMemoryEntry, userId: string | undefined): boolean {
  if (!m.ownerId) return true;
  if (!userId) return false;
  return m.ownerId === userId;
}

function assertCanMutate(m: CopilotMemoryEntry, actor?: MemoryActor): void {
  if (!actor || !m.ownerId) return;
  if (m.ownerId !== actor.userId && !actor.isAdmin) {
    throw new Error("memory_forbidden");
  }
}

const MEMORY_TYPE_PREFIX = "copilot/memory";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function memorySlug(id: string): string {
  return `${MEMORY_TYPE_PREFIX}/${id}`;
}

function parseMemoryPage(page: BrainPage): CopilotMemoryEntry | null {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  if (pageTypeOf(page) !== "copilot_memory") return null;
  const entities = Array.isArray(fm.entities)
    ? fm.entities.filter((e): e is string => typeof e === "string")
    : undefined;
  return {
    id: String(fm.memory_id ?? page.slug.split("/").pop() ?? ""),
    type: String(fm.memory_type ?? "fact") as MemoryType,
    key: String(fm.memory_key ?? ""),
    value: page.content ?? String(fm.memory_value ?? ""),
    source: String(fm.memory_source ?? "user_explicit") as MemorySource,
    caseSlug: fm.case_slug ? String(fm.case_slug) : undefined,
    createdAt: page.created_at ?? new Date().toISOString(),
    updatedAt: page.updated_at ?? new Date().toISOString(),
    pinned: fm.pinned === true,
    timesReferenced: Number(fm.times_referenced ?? 0),
    entities: entities && entities.length > 0 ? entities : undefined,
    supersededBy: fm.superseded_by ? String(fm.superseded_by) : undefined,
    validFrom: fm.valid_from ? String(fm.valid_from) : undefined,
    validTo: fm.valid_to ? String(fm.valid_to) : undefined,
    ownerId: fm.owner_id ? String(fm.owner_id) : undefined,
  };
}

export async function listMemories(
  opts?: {
    caseSlug?: string;
    type?: MemoryType;
    pinnedOnly?: boolean;
    /** WP-5.30: restrict to entries this user may see (own + firm-shared). */
    userId?: string;
    /** Only rows owned by this user — for GDPR export/deletion. */
    ownedOnly?: boolean;
  },
  headers?: EngineHeaders
): Promise<CopilotMemoryEntry[]> {
  const pages = await enginePagesList(headers, { type: "copilot_memory", limit: 200 });
  let memories = (pages as BrainPage[])
    .map(parseMemoryPage)
    .filter((m): m is CopilotMemoryEntry => m !== null);

  if (opts?.ownedOnly) {
    memories = memories.filter((m) => m.ownerId === opts.userId);
  } else if (opts?.userId) {
    memories = memories.filter((m) => memoryVisibleTo(m, opts.userId));
  }

  if (opts?.caseSlug) {
    memories = memories.filter((m) => m.caseSlug === opts.caseSlug);
  }
  if (opts?.type) {
    memories = memories.filter((m) => m.type === opts.type);
  }
  if (opts?.pinnedOnly) {
    memories = memories.filter((m) => m.pinned);
  }

  // Sort: pinned first, then by updatedAt desc
  memories.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return memories;
}

export async function createMemory(
  opts: {
    type: MemoryType;
    key: string;
    value: string;
    source?: MemorySource;
    caseSlug?: string;
    pinned?: boolean;
    entities?: string[];
    validFrom?: string;
    validTo?: string;
    ownerId?: string;
  },
  headers?: EngineHeaders
): Promise<CopilotMemoryEntry> {
  const id = generateId();
  const slug = memorySlug(id);
  const now = new Date().toISOString();

  await enginePageWrite(
    headers,
    {
      slug,
      title: `Memory: ${opts.key}`,
      type: "copilot_memory",
      content: opts.value,
      frontmatter: {
        type: "copilot_memory",
        memory_id: id,
        memory_type: opts.type,
        memory_key: opts.key,
        memory_value: opts.value,
        memory_source: opts.source ?? "user_explicit",
        case_slug: opts.caseSlug,
        pinned: opts.pinned ?? false,
        times_referenced: 0,
        entities: opts.entities ?? [],
        valid_from: opts.validFrom,
        valid_to: opts.validTo,
        owner_id: opts.ownerId,
        created_at: now,
        updated_at: now,
      },
    },
    { merge: false }
  );

  return {
    id,
    type: opts.type,
    key: opts.key,
    value: opts.value,
    source: opts.source ?? "user_explicit",
    caseSlug: opts.caseSlug,
    createdAt: now,
    updatedAt: now,
    pinned: opts.pinned ?? false,
    timesReferenced: 0,
    entities: opts.entities && opts.entities.length > 0 ? opts.entities : undefined,
    validFrom: opts.validFrom,
    validTo: opts.validTo,
    ownerId: opts.ownerId,
  };
}

export async function updateMemory(
  id: string,
  updates: Partial<Pick<CopilotMemoryEntry, "value" | "pinned" | "type">>,
  headers?: EngineHeaders,
  actor?: MemoryActor
): Promise<void> {
  const slug = memorySlug(id);
  const existing = await enginePageGet(headers, slug);
  if (!existing) throw new Error("Memory not found");
  const parsed = parseMemoryPage(existing);
  if (parsed) assertCanMutate(parsed, actor);

  const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  await enginePageWrite(
    headers,
    {
      slug,
      title: existing.title ?? `Memory: ${fm.memory_key ?? id}`,
      type: "copilot_memory",
      content: updates.value ?? existing.content ?? "",
      frontmatter: {
        ...fm,
        type: "copilot_memory",
        memory_type: updates.type ?? fm.memory_type ?? "fact",
        memory_value: updates.value ?? fm.memory_value ?? "",
        pinned: updates.pinned ?? fm.pinned ?? false,
        updated_at: now,
      },
    },
    { merge: true }
  );
}

export async function deleteMemory(
  id: string,
  headers?: EngineHeaders,
  actor?: MemoryActor
): Promise<void> {
  const slug = memorySlug(id);
  if (actor) {
    const existing = await enginePageGet(headers, slug);
    const parsed = existing ? parseMemoryPage(existing) : null;
    if (parsed) assertCanMutate(parsed, actor);
  }
  await enginePageDelete(headers, slug);
}

/**
 * WP-5.30 / DSGVO Art. 17: delete every memory owned by a user — called
 * when their account is erased. Firm-shared rows (no owner) stay untouched.
 * Returns the number of deleted entries.
 */
export async function deleteMemoriesOfUser(
  userId: string,
  headers?: EngineHeaders
): Promise<number> {
  const own = await listMemories({ userId, ownedOnly: true }, headers);
  for (const m of own) {
    await enginePageDelete(headers, memorySlug(m.id));
  }
  return own.length;
}

/**
 * P1.4: Temporal Supersession — mark an old memory as superseded by a new one.
 *
 * Instead of deleting or updating the old memory (which loses history),
 * we mark it with `superseded_by` pointing to the new memory's ID.
 * This follows mem0's ADD-only philosophy: memories accumulate, conflicts
 * are resolved by supersession chains, not overwrites.
 *
 * Superseded memories are filtered out during search but retained for
 * audit trail and temporal reasoning.
 */
export async function supersedeMemory(
  oldId: string,
  newId: string,
  headers?: EngineHeaders
): Promise<void> {
  const slug = memorySlug(oldId);
  const existing = await enginePageGet(headers, slug);
  if (!existing) throw new Error("Memory not found");

  const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;

  await enginePageWrite(
    headers,
    {
      slug,
      title: existing.title ?? `Memory: ${fm.memory_key ?? oldId}`,
      type: "copilot_memory",
      content: existing.content ?? "",
      frontmatter: {
        ...fm,
        type: "copilot_memory",
        superseded_by: newId,
        superseded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    },
    { merge: true }
  );
}

/**
 * P1.4: Detect and resolve supersession when creating a new memory.
 *
 * When a new memory has the same type + key as an existing one, the old
 * memory is superseded (not deleted). This handles preference changes like
 * "Ich bevorzuge kurze Antworten" → later "Ich bevorzuge detaillierte Antworten".
 *
 * Returns the created memory and any superseded memory IDs.
 */
export async function createMemoryWithSupersession(
  opts: {
    type: MemoryType;
    key: string;
    value: string;
    source?: MemorySource;
    caseSlug?: string;
    pinned?: boolean;
    entities?: string[];
    validFrom?: string;
    validTo?: string;
    ownerId?: string;
  },
  headers?: EngineHeaders
): Promise<{ memory: CopilotMemoryEntry; superseded: string[] }> {
  // Conflicts are only detected among the caller's own entries — a new
  // personal memory never supersedes a colleague's or a firm-shared one.
  const existing = await listMemories(
    { caseSlug: opts.caseSlug, type: opts.type, userId: opts.ownerId, ownedOnly: !!opts.ownerId },
    headers
  );
  const conflicts = existing.filter(
    (m) => m.key === opts.key && !m.supersededBy && m.value !== opts.value
  );

  const created = await createMemory(opts, headers);

  // Supersede all conflicting memories
  const superseded: string[] = [];
  for (const conflict of conflicts) {
    await supersedeMemory(conflict.id, created.id, headers);
    superseded.push(conflict.id);
  }

  return { memory: created, superseded };
}

export async function incrementReference(id: string, headers?: EngineHeaders): Promise<void> {
  const slug = memorySlug(id);
  const existing = await enginePageGet(headers, slug);
  if (!existing) return;

  const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
  const count = Number(fm.times_referenced ?? 0) + 1;

  await enginePageWrite(
    headers,
    {
      slug,
      title: existing.title ?? `Memory: ${fm.memory_key ?? id}`,
      type: "copilot_memory",
      content: existing.content ?? "",
      frontmatter: {
        ...fm,
        type: "copilot_memory",
        times_referenced: count,
        updated_at: new Date().toISOString(),
      },
    },
    { merge: true }
  );
}

/**
 * P1.3: Count how many of a memory's entities match the query words.
 * Used for entity-based search boosting.
 */
function countEntityMatches(entities: string[] | undefined, queryWords: Set<string>): number {
  if (!entities || entities.length === 0 || queryWords.size === 0) return 0;
  let count = 0;
  for (const entity of entities) {
    const entityLower = entity.toLowerCase();
    for (const word of queryWords) {
      if (entityLower.includes(word)) {
        count++;
        break;
      }
    }
  }
  return count;
}

/**
 * P0.2 — Semantic search across memories using the engine's hybrid search.
 *
 * Leverages the GBrain engine's 4-arm RRF (keyword + vector + relational +
 * cross-modal) to find relevant memories, then filters to copilot_memory
 * pages. This replaces the old approach of loading all 200 memories and
 * dumping 20 into the prompt.
 *
 * Falls back to listMemories (recent + pinned) when the engine search
 * returns no memory pages or is unavailable.
 */
export async function searchMemories(
  opts: {
    query: string;
    caseSlug?: string;
    limit?: number;
    userId?: string;
  },
  headers?: EngineHeaders
): Promise<CopilotMemoryEntry[]> {
  const limit = opts.limit ?? 10;

  // Use the engine's hybrid search to find memory pages semantically.
  // The search covers ALL brain pages; we filter to copilot/memory/ slugs.
  try {
    const results = await engineSearch(headers, opts.query, limit * 3);
    const memorySlugs = results
      .filter((r) => r.slug.startsWith(MEMORY_TYPE_PREFIX + "/"))
      .map((r) => r.slug);

    if (memorySlugs.length === 0) {
      // No semantic hits — fall back to pinned + recent
      return listMemories(
        { caseSlug: opts.caseSlug, pinnedOnly: false, userId: opts.userId },
        headers
      ).then((m) => m.slice(0, limit));
    }

    // Hydrate the memory entries from the search results
    const pages = await enginePagesBatch(headers, memorySlugs.slice(0, limit * 2));
    let memories = memorySlugs
      .map((slug) => {
        const page = pages[slug];
        if (!page) return null;
        return parseMemoryPage(page);
      })
      .filter((m): m is CopilotMemoryEntry => m !== null);

    // WP-5.30: per-user scope — other people's private memories never leak
    // into this user's search/context even when the engine search hits them.
    if (opts.userId) {
      memories = memories.filter((m) => memoryVisibleTo(m, opts.userId));
    }

    // P1.4: Filter out superseded memories (ADD-only philosophy — don't delete, just deprecate)
    memories = memories.filter((m) => !m.supersededBy);

    // P1.4: Temporal validity — exclude memories outside their valid date range
    const now = Date.now();
    memories = memories.filter((m) => {
      if (m.validFrom && new Date(m.validFrom).getTime() > now) return false;
      if (m.validTo && new Date(m.validTo).getTime() < now) return false;
      return true;
    });

    // P1.3: Entity-based boost — memories with entities matching the query get priority
    const queryLower = opts.query.toLowerCase();
    const queryWords = new Set(queryLower.split(/\s+/).filter((w) => w.length > 2));
    memories.sort((a, b) => {
      const aMatch = countEntityMatches(a.entities, queryWords);
      const bMatch = countEntityMatches(b.entities, queryWords);
      if (bMatch !== aMatch) return bMatch - aMatch;
      // Preserve original search rank order for ties
      return 0;
    });

    // Filter by caseSlug if provided
    const filtered = opts.caseSlug
      ? memories.filter((m) => m.caseSlug === opts.caseSlug)
      : memories;

    // Always include pinned memories that weren't in the search results
    const allMemories = await listMemories(
      { caseSlug: opts.caseSlug, pinnedOnly: true, userId: opts.userId },
      headers
    );
    const existingIds = new Set(filtered.map((m) => m.id));
    const pinnedNotInResults = allMemories.filter((m) => !existingIds.has(m.id));

    return [...filtered, ...pinnedNotInResults].slice(0, limit);
  } catch {
    // Search failed — fall back to recent + pinned
    return listMemories({ caseSlug: opts.caseSlug, userId: opts.userId }, headers).then((m) =>
      m.slice(0, limit)
    );
  }
}

/**
 * Build a memory context string for injection into the system prompt.
 *
 * P0.2: When a query is provided, uses semantic search to find only
 * relevant memories instead of loading all 200 and dumping 20.
 * Pinned memories are always included.
 */
export async function buildMemoryContext(
  opts?: {
    caseSlug?: string;
    maxEntries?: number;
    query?: string;
    userId?: string;
  },
  headers?: EngineHeaders
): Promise<string> {
  const max = opts?.maxEntries ?? 20;

  let selected: CopilotMemoryEntry[];

  if (opts?.query && opts.query.trim().length > 3) {
    // P0.2: Semantic search — find memories relevant to the current query
    selected = await searchMemories(
      {
        query: opts.query,
        caseSlug: opts.caseSlug,
        limit: max,
        userId: opts.userId,
      },
      headers
    );
  } else {
    // Fallback: pinned + recent (legacy behavior)
    const all = await listMemories({ caseSlug: opts?.caseSlug, userId: opts?.userId }, headers);
    const now = Date.now();
    const active = all.filter((m) => {
      if (m.supersededBy) return false;
      if (m.validFrom && new Date(m.validFrom).getTime() > now) return false;
      if (m.validTo && new Date(m.validTo).getTime() < now) return false;
      return true;
    });
    const pinned = active.filter((m) => m.pinned);
    const unpinned = active.filter((m) => !m.pinned);
    selected = [...pinned, ...unpinned].slice(0, max);
  }

  if (selected.length === 0) return "";

  const lines: string[] = ["## GEDÄCHTNIS — Persönliche Kontextinformationen"];
  for (const m of selected) {
    const prefix = m.pinned ? "[WICHTIG] " : "";
    const typeLabel = {
      preference: "Präferenz",
      fact: "Fakt",
      topic: "Thema",
      instruction: "Anweisung",
      case_note: "Aktennotiz",
    }[m.type];
    lines.push(`- ${prefix}[${typeLabel}] ${m.key}: ${m.value}`);
  }
  lines.push(
    "Beziehe dich auf diese Informationen, wenn relevant. Verwende Präferenzen für Antwortstil und Format."
  );

  return lines.join("\n");
}

/**
 * Infer memory entries from user messages.
 * Detects patterns like "Ich bevorzuge...", "Denk daran, dass...", "Ab jetzt immer..."
 */
export function inferMemoriesFromMessage(
  message: string
): Array<{ type: MemoryType; key: string; value: string }> {
  const inferred: Array<{ type: MemoryType; key: string; value: string }> = [];
  const _lower = message.toLowerCase();

  // Preference patterns
  const prefPatterns = [
    /(?:ich )?(?:bevorzuge|möchte|will) (?:antworten|antworten)?(?:in|auf) (\w+)/i,
    /(?:ich )?(?:mag|will|möchte) (?:kurze|knappe|detaillierte|ausführliche) antworten/i,
    /(?:antwort|answer) (?:immer )?(?:auf )?(\w+)/i,
  ];
  for (const pattern of prefPatterns) {
    const match = message.match(pattern);
    if (match) {
      inferred.push({
        type: "preference",
        key: "answer_style",
        value: match[0],
      });
    }
  }

  // Instruction patterns
  const instrPatterns = [
    /(?:denk|merke) daran,? dass (.+)/i,
    /(?:ab sofort|ab jetzt|immer) (.+)/i,
    /(?:vergiss nicht,? dass) (.+)/i,
    /(?:erinnere mich an) (.+)/i,
  ];
  for (const pattern of instrPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      inferred.push({
        type: "instruction",
        key: `instruction_${generateId().slice(-6)}`,
        value: match[1].trim(),
      });
    }
  }

  // Fact patterns
  const factPatterns = [
    /(?:ich bin|ich arbeite als|meine kanzlei heißt|meine kanzlei ist) (.+)/i,
    /(?:ich habe .* jahre erfahrung mit) (.+)/i,
  ];
  for (const pattern of factPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      inferred.push({
        type: "fact",
        key: `user_fact_${generateId().slice(-6)}`,
        value: match[1].trim(),
      });
    }
  }

  return inferred;
}
