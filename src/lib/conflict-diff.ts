import type { BrainPage } from "./types";
import type { QueuedMutation } from "./offline-store";

export interface FieldDiff {
  field: string;
  local: string;
  server: string;
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Feld-Level-Vergleich lokaler Queue-Payload vs. Server-Version —
 *  zeigt dem Anwalt WELCHE Felder sich unterscheiden (title, content,
 *  einzelne Frontmatter-Keys), nicht nur "Konflikt". */
export function diffConflictFields(mut: QueuedMutation, server: BrainPage): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const p = mut.payload;
  if (typeof p.title === "string" && p.title !== server.title) {
    diffs.push({ field: "title", local: p.title, server: server.title });
  }
  if (typeof p.content === "string" && p.content !== server.content) {
    diffs.push({
      field: "content",
      local: `${p.content.length} Zeichen`,
      server: `${server.content.length} Zeichen`,
    });
  }
  const localFm = (p.frontmatter ?? {}) as Record<string, unknown>;
  const serverFm = server.frontmatter ?? {};
  const keys = new Set([...Object.keys(localFm), ...Object.keys(serverFm)]);
  for (const k of keys) {
    if (fmt(localFm[k]) !== fmt(serverFm[k])) {
      diffs.push({ field: `frontmatter.${k}`, local: fmt(localFm[k]), server: fmt(serverFm[k]) });
    }
  }
  return diffs;
}
