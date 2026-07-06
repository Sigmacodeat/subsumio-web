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
 * Build a memory context string for injection into the system prompt.
 * Returns pinned and recent memories formatted as context.
 */
export async function buildMemoryContext(opts?: {
  caseSlug?: string;
  maxEntries?: number;
}): Promise<string> {
  const max = opts?.maxEntries ?? 20;
  const all = await listMemories({ caseSlug: opts?.caseSlug });

  // Always include pinned, then fill with recent
  const pinned = all.filter((m) => m.pinned);
  const unpinned = all.filter((m) => !m.pinned);
  const selected = [...pinned, ...unpinned].slice(0, max);

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
  const lower = message.toLowerCase();

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
