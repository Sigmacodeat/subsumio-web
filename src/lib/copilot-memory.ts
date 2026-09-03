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
import type { BrainPage } from "@/lib/types";

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
  if (fm.type !== "copilot_memory") return null;
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
  };
}

export async function listMemories(opts?: {
  caseSlug?: string;
  type?: MemoryType;
  pinnedOnly?: boolean;
}): Promise<CopilotMemoryEntry[]> {
  const pages = await api.brain.listPages({ type: "copilot_memory", limit: 200 });
  let memories = (pages as BrainPage[])
    .map(parseMemoryPage)
    .filter((m): m is CopilotMemoryEntry => m !== null);

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

export async function createMemory(opts: {
  type: MemoryType;
  key: string;
  value: string;
  source?: MemorySource;
  caseSlug?: string;
  pinned?: boolean;
  entities?: string[];
  validFrom?: string;
  validTo?: string;
}): Promise<CopilotMemoryEntry> {
  const id = generateId();
  const slug = memorySlug(id);
  const now = new Date().toISOString();

  await api.brain.createPage({
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
      created_at: now,
      updated_at: now,
    },
  });

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
  };
}

export async function updateMemory(
  id: string,
  updates: Partial<Pick<CopilotMemoryEntry, "value" | "pinned" | "type">>
): Promise<void> {
  const slug = memorySlug(id);
  const existing = await api.brain.getPage(slug);
  if (!existing) throw new Error("Memory not found");

  const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  await api.brain.updatePage({
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
  });
}

export async function deleteMemory(id: string): Promise<void> {
  const slug = memorySlug(id);
  await api.brain.deletePage(slug);
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
export async function supersedeMemory(oldId: string, newId: string): Promise<void> {
  const slug = memorySlug(oldId);
  const existing = await api.brain.getPage(slug);
  if (!existing) throw new Error("Memory not found");

  const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;

  await api.brain.updatePage({
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
  });
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
export async function createMemoryWithSupersession(opts: {
  type: MemoryType;
  key: string;
  value: string;
  source?: MemorySource;
  caseSlug?: string;
  pinned?: boolean;
  entities?: string[];
  validFrom?: string;
  validTo?: string;
}): Promise<{ memory: CopilotMemoryEntry; superseded: string[] }> {
  // Check for existing memories with the same type + key
  const existing = await listMemories({ caseSlug: opts.caseSlug, type: opts.type });
  const conflicts = existing.filter(
    (m) => m.key === opts.key && !m.supersededBy && m.value !== opts.value
  );

  const created = await createMemory(opts);

  // Supersede all conflicting memories
  const superseded: string[] = [];
  for (const conflict of conflicts) {
    await supersedeMemory(conflict.id, created.id);
    superseded.push(conflict.id);
  }

  return { memory: created, superseded };
}

export async function incrementReference(id: string): Promise<void> {
  const slug = memorySlug(id);
  const existing = await api.brain.getPage(slug);
  if (!existing) return;

  const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
  const count = Number(fm.times_referenced ?? 0) + 1;

  await api.brain.updatePage({
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
  });
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
export async function searchMemories(opts: {
  query: string;
  caseSlug?: string;
  limit?: number;
}): Promise<CopilotMemoryEntry[]> {
  const limit = opts.limit ?? 10;

  // Use the engine's hybrid search to find memory pages semantically.
  // The search covers ALL brain pages; we filter to copilot/memory/ slugs.
  try {
    const results = await api.brain.search(opts.query, limit * 3);
    const memorySlugs = results
      .filter((r) => r.slug.startsWith(MEMORY_TYPE_PREFIX + "/"))
      .map((r) => r.slug);

    if (memorySlugs.length === 0) {
      // No semantic hits — fall back to pinned + recent
      return listMemories({ caseSlug: opts.caseSlug, pinnedOnly: false }).then((m) =>
        m.slice(0, limit)
      );
    }

    // Hydrate the memory entries from the search results
    const pages = await api.brain.getPages(memorySlugs.slice(0, limit * 2));
    let memories = memorySlugs
      .map((slug) => {
        const page = pages[slug];
        if (!page) return null;
        return parseMemoryPage(page);
      })
      .filter((m): m is CopilotMemoryEntry => m !== null);

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
    const allMemories = await listMemories({ caseSlug: opts.caseSlug, pinnedOnly: true });
    const existingIds = new Set(filtered.map((m) => m.id));
    const pinnedNotInResults = allMemories.filter((m) => !existingIds.has(m.id));

    return [...filtered, ...pinnedNotInResults].slice(0, limit);
  } catch {
    // Search failed — fall back to recent + pinned
    return listMemories({ caseSlug: opts.caseSlug }).then((m) => m.slice(0, limit));
  }
}

/**
 * Build a memory context string for injection into the system prompt.
 *
 * P0.2: When a query is provided, uses semantic search to find only
 * relevant memories instead of loading all 200 and dumping 20.
 * Pinned memories are always included.
 */
export async function buildMemoryContext(opts?: {
  caseSlug?: string;
  maxEntries?: number;
  query?: string;
}): Promise<string> {
  const max = opts?.maxEntries ?? 20;

  let selected: CopilotMemoryEntry[];

  if (opts?.query && opts.query.trim().length > 3) {
    // P0.2: Semantic search — find memories relevant to the current query
    selected = await searchMemories({
      query: opts.query,
      caseSlug: opts.caseSlug,
      limit: max,
    });
  } else {
    // Fallback: pinned + recent (legacy behavior)
    const all = await listMemories({ caseSlug: opts?.caseSlug });
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
