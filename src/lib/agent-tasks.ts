/**
 * WP-7.42 — Agent-Tasks (Harvey-II-Parität): Aufgaben, die dem KI-Agenten
 * statt einer Person zugewiesen sind. Der Cron `api/cron/agent-tasks`
 * nimmt `agentStatus: "pending"` auf, lässt den Agenten mit Aktenkontext
 * arbeiten und stellt das Ergebnis als `needs_review` zurück —
 * anwaltliche Prüfung bleibt Pflicht (Trust-Invariant).
 */

import type { TaskEntry } from "@/lib/legal-types";

export interface EnginePageLike {
  slug: string;
  title?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

export interface PendingAgentTask {
  caseSlug: string;
  caseTitle: string;
  task: TaskEntry;
}

/** Alle Akten-Tasks, die der Agent noch nicht bearbeitet hat. */
export function collectPendingAgentTasks(pages: EnginePageLike[]): PendingAgentTask[] {
  const out: PendingAgentTask[] = [];
  for (const page of pages) {
    const tasks = page.frontmatter?.tasks;
    if (!Array.isArray(tasks)) continue;
    for (const task of tasks as TaskEntry[]) {
      if (
        task &&
        typeof task.id === "string" &&
        task.assigneeType === "agent" &&
        task.agentStatus === "pending" &&
        !task.done
      ) {
        out.push({
          caseSlug: page.slug,
          caseTitle: page.title ?? page.slug,
          task,
        });
      }
    }
  }
  return out;
}

/** Prompt für den Agenten-Lauf — Aufgabe + kompakter Aktenkontext. */
export function buildAgentTaskPrompt(
  task: TaskEntry,
  page: EnginePageLike
): { system: string; prompt: string } {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  const contextLines = [
    `Akte: ${page.title ?? page.slug}`,
    fm.client_name ? `Mandant: ${String(fm.client_name)}` : null,
    fm.legal_area ? `Rechtsgebiet: ${String(fm.legal_area)}` : null,
    fm.status ? `Status: ${String(fm.status)}` : null,
  ].filter(Boolean);
  const excerpt = (page.content ?? "").replace(/\s+/g, " ").slice(0, 3_000);
  return {
    system:
      "Du bist ein juristischer KI-Agent in einer Anwaltssoftware. Bearbeite die zugewiesene Aufgabe " +
      "auf Basis des Aktenkontexts. Liefere ein knappes, überprüfbares Zwischenergebnis " +
      "(max. 400 Wörter). Keine Rechtsberatung als Endfassung — ein Anwalt prüft dein Ergebnis. " +
      "Deutsch, sachlich, mit Verweis auf fehlende Informationen falls nötig.",
    prompt: `${contextLines.join("\n")}\n\nAktenauszug:\n${excerpt || "(kein Inhalt)"}\n\nAufgabe:\n${task.text}`,
  };
}

/**
 * Ergebnis eines Agenten-Laufs in die Taskliste zurückschreiben.
 * Idempotent über task.id — andere Tasks bleiben unangetastet.
 */
export function applyAgentTaskResult(
  tasks: TaskEntry[],
  taskId: string,
  result: string
): TaskEntry[] {
  return tasks.map((t) =>
    t.id === taskId
      ? { ...t, agentStatus: "needs_review" as const, agentResult: result.slice(0, 8_000) }
      : t
  );
}

/** Agenten-Lauf fehlgeschlagen — zurück auf pending, damit der nächste Cron-Lauf es erneut versucht. */
export function markAgentTaskFailed(tasks: TaskEntry[], taskId: string): TaskEntry[] {
  return tasks.map((t) => (t.id === taskId ? { ...t, agentStatus: "pending" as const } : t));
}
