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

export interface ContentDiff {
  /** Zeilen die sich geändert haben — lokale vs. Server-Variante der
   *  geänderten Region (Prefix/Suffix-gleiche Zeilen sind entfernt). */
  localLines: string[];
  serverLines: string[];
  /** Unveränderte Zeilen vor/hinter der geänderten Region. */
  unchangedBefore: number;
  unchangedAfter: number;
  /** true wenn die geänderte Region gekappt wurde (> maxChanged Zeilen). */
  truncated: boolean;
}

const MAX_CHANGED_LINES = 8;

/** Zeilen-Diff via Prefix/Suffix-Trim: entfernt identische Anfangs- und
 *  Endzeilen und zeigt die geänderte Region beider Versionen. Für
 *  anwaltliche Edits (einfügen/streichen/umschreiben eines Blocks) ist
 *  das die relevante Region — voller LCS wäre hier Overkill. */
export function diffContentLines(local: string, server: string): ContentDiff | null {
  if (local === server) return null;
  const a = local.split("\n");
  const b = server.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const localMid = a.slice(start, endA);
  const serverMid = b.slice(start, endB);
  const truncated = localMid.length > MAX_CHANGED_LINES || serverMid.length > MAX_CHANGED_LINES;
  return {
    localLines: localMid.slice(0, MAX_CHANGED_LINES),
    serverLines: serverMid.slice(0, MAX_CHANGED_LINES),
    unchangedBefore: start,
    unchangedAfter: a.length - endA,
    truncated,
  };
}
