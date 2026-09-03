/**
 * P1.5: Session Memory Layer — 3-Layer Memory Architecture
 *
 * Implements the separation documented in server/docs/guides/brain-vs-memory.md:
 * - Layer 1: Session Context (ephemeral, conversation-scoped)
 * - Layer 2: Agent Memory (operational state, cross-session preferences)
 * - Layer 3: GBrain (world knowledge, facts about external entities)
 *
 * Session Memory lives in-memory (or Redis in production) and captures
 * transient context within a single conversation: topics discussed, questions
 * asked, documents referenced. It is NOT persisted to the Brain — it dies
 * when the session ends.
 *
 * Agent Memory is the existing CopilotMemory (copilot-memory.ts) — persistent
 * user preferences, instructions, and facts that survive across sessions.
 *
 * GBrain is the existing knowledge graph — world knowledge, legal facts,
 * case data, entity relationships.
 */

import { buildMemoryContext, type CopilotMemoryEntry } from "@/lib/copilot-memory";

export type MemoryLayer = "session" | "agent" | "brain";

export interface SessionMemoryEntry {
  key: string;
  value: string;
  timestamp: string;
  type: "topic" | "question" | "reference" | "decision";
}

interface SessionMemoryState {
  sessionId: string;
  entries: SessionMemoryEntry[];
  topicHistory: string[];
  referencedDocuments: string[];
  createdAt: string;
  lastActivity: string;
}

// In-memory store — in production this would be Redis or a session DB table
const sessionStore = new Map<string, SessionMemoryState>();
const MAX_SESSION_ENTRIES = 50;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, state] of sessionStore) {
    if (now - new Date(state.lastActivity).getTime() > SESSION_TTL_MS) {
      sessionStore.delete(id);
    }
  }
}

export function createSessionMemory(sessionId: string): SessionMemoryState {
  cleanupExpiredSessions();
  const now = new Date().toISOString();
  const state: SessionMemoryState = {
    sessionId,
    entries: [],
    topicHistory: [],
    referencedDocuments: [],
    createdAt: now,
    lastActivity: now,
  };
  sessionStore.set(sessionId, state);
  return state;
}

export function getSessionMemory(sessionId: string): SessionMemoryState | null {
  cleanupExpiredSessions();
  return sessionStore.get(sessionId) ?? null;
}

export function addToSessionMemory(
  sessionId: string,
  entry: Omit<SessionMemoryEntry, "timestamp">
): void {
  let state = sessionStore.get(sessionId);
  if (!state) {
    state = createSessionMemory(sessionId);
  }

  const now = new Date().toISOString();
  state.entries.push({ ...entry, timestamp: now });
  state.lastActivity = now;

  // Track topics and references
  if (entry.type === "topic" && !state.topicHistory.includes(entry.value)) {
    state.topicHistory.push(entry.value);
  }
  if (entry.type === "reference" && !state.referencedDocuments.includes(entry.value)) {
    state.referencedDocuments.push(entry.value);
  }

  // Cap entries to prevent unbounded growth
  if (state.entries.length > MAX_SESSION_ENTRIES) {
    state.entries = state.entries.slice(-MAX_SESSION_ENTRIES);
  }

  sessionStore.set(sessionId, state);
}

export function clearSessionMemory(sessionId: string): void {
  sessionStore.delete(sessionId);
}

/**
 * Build session context for the system prompt.
 * This is Layer 1 — ephemeral context from the current conversation.
 */
export function buildSessionContext(sessionId: string): string {
  const state = sessionStore.get(sessionId);
  if (!state || state.entries.length === 0) return "";

  const lines: string[] = ["## SESSION-KONTEXT (flüchtig)"];

  if (state.topicHistory.length > 0) {
    lines.push(`Themen dieser Session: ${state.topicHistory.slice(-5).join(", ")}`);
  }

  if (state.referencedDocuments.length > 0) {
    lines.push(`Referenzierte Dokumente: ${state.referencedDocuments.slice(-5).join(", ")}`);
  }

  const recentDecisions = state.entries.filter((e) => e.type === "decision").slice(-3);
  if (recentDecisions.length > 0) {
    lines.push("Letzte Entscheidungen:");
    for (const d of recentDecisions) {
      lines.push(`  - ${d.value}`);
    }
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

/**
 * Build the full 3-layer memory context for the system prompt.
 *
 * Layer 1: Session Context (ephemeral, current conversation)
 * Layer 2: Agent Memory (persistent user preferences and instructions)
 * Layer 3: GBrain (world knowledge — handled by the engine's search)
 *
 * This function combines Layers 1 and 2. Layer 3 is injected separately
 * by the engine's think endpoint via hybrid search.
 */
export async function buildFullMemoryContext(opts: {
  sessionId?: string;
  caseSlug?: string;
  query?: string;
  maxEntries?: number;
}): Promise<string> {
  const parts: string[] = [];

  // Layer 1: Session Context
  if (opts.sessionId) {
    const sessionCtx = buildSessionContext(opts.sessionId);
    if (sessionCtx) parts.push(sessionCtx);
  }

  // Layer 2: Agent Memory (semantic search when query is available)
  const agentCtx = await buildMemoryContext({
    caseSlug: opts.caseSlug,
    query: opts.query,
    maxEntries: opts.maxEntries,
  });
  if (agentCtx) parts.push(agentCtx);

  return parts.join("\n\n");
}

/**
 * Promote a session memory entry to persistent agent memory.
 * Called when a session-level pattern is confirmed as a lasting preference.
 */
export async function promoteSessionMemoryToAgent(
  sessionId: string,
  entryKey: string,
  opts: {
    type: CopilotMemoryEntry["type"];
    key: string;
    value: string;
    caseSlug?: string;
  }
): Promise<void> {
  const state = sessionStore.get(sessionId);
  if (!state) return;

  // Mark the entry as promoted
  const entry = state.entries.find((e) => e.key === entryKey);
  if (entry) {
    entry.type = "decision";
    entry.value = `[PROMOTED] ${entry.value}`;
  }

  // The actual persistence is handled by the caller via createMemory
}

/**
 * Track a user message in session memory — extract topics and references.
 */
export function trackMessageInSession(sessionId: string, message: string): void {
  if (!message || message.trim().length === 0) return;

  // Simple topic extraction — the LLM extraction handles deeper analysis
  const topicPatterns = [
    /(?:über|bezüglich|wegen) (.+)/i,
    /(?:frage zu[mr]?|frage(?:n)? nach) (.+)/i,
    /(?:was ist|was sind|erkläre) (.+)/i,
  ];

  for (const pattern of topicPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      addToSessionMemory(sessionId, {
        key: `topic_${Date.now()}`,
        value: match[1].trim().slice(0, 100),
        type: "topic",
      });
      break;
    }
  }
}
