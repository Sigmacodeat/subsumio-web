/**
 * What a chunk looks like on its way to the embedding model, and which
 * chunks are worth sending at all.
 *
 * Both the ongoing top-up run (`scripts/auto-embed-pg.ts`) and a run that
 * fills a second column for a model switch (`scripts/embed-into-column.ts`)
 * must build the identical string for a given chunk. If they drift, the
 * vectors in the two columns describe subtly different texts, and the
 * difference only shows up as worse answers long after the money is spent.
 * So the rule and the wrapping live here once.
 */

import {
  buildContextualPrefix,
  buildLegalContextualPrefix,
  isCourtDecisionPage,
  isLegalPage,
  sanitizeTitle,
  wrapChunkForEmbedding,
} from "./embedding-context.ts";

/**
 * Chunks too short to carry a legal statement. Measured on 2026-09-20:
 * 47,941 live chunks fall under this, almost all of them list artefacts —
 * "Kein RS", "vgl", or a bare citation header ("TE OGH 1986-06-17 10 Os
 * 38/86"). Embedded they cost money and come back as noise on unrelated
 * questions.
 */
export const MIN_EMBED_CHARS = 80;

/** The same rule as SQL, for the candidate queries. `alias` is the chunk table's. */
export function noiseFilterSql(alias = "c"): string {
  return `length(btrim(${alias}.chunk_text)) >= ${MIN_EMBED_CHARS}`;
}

/** pgvector wants "[1,2,3]", not JSON. */
export function toVectorStr(arr: Float32Array): string {
  return "[" + Array.from(arr).join(",") + "]";
}

export interface PendingChunk {
  id: number;
  chunk_text: string;
  chunk_source: string | null;
  page_id: number;
}

interface MinimalEngine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
}

interface PageRow {
  id: number;
  title: string | null;
  type: string | null;
  frontmatter: Record<string, unknown> | null;
}

/**
 * The context line a page contributes to each of its chunks — the string
 * that turns "§ 1295" into "AT ABGB § 1295". The legal test is the one the
 * prefix builder expects; anything looser sends statutes through the
 * generic builder and loses the law's name.
 */
export function pagePrefix(page: Pick<PageRow, "title" | "type" | "frontmatter">): string | null {
  const fm = page.frontmatter ?? {};
  const safeTitle = sanitizeTitle(page.title ?? "");
  const legal =
    isLegalPage(fm) ||
    isCourtDecisionPage(fm) ||
    ["law", "statute", "court_decision", "judgement"].includes(page.type ?? "");
  return legal
    ? buildLegalContextualPrefix(safeTitle, fm, null)
    : buildContextualPrefix(safeTitle, null);
}

/** Every chunk of the batch, wrapped in its page's context, ready to embed. */
export async function wrapWithPageContext(
  engine: MinimalEngine,
  chunks: PendingChunk[]
): Promise<string[]> {
  const pageIds = [...new Set(chunks.map((c) => c.page_id))];
  const rows = (await engine.executeRaw(
    `SELECT id, title, type, frontmatter FROM pages WHERE id = ANY($1::int[])`,
    [pageIds]
  )) as PageRow[];

  const prefixByPage = new Map<number, string | null>();
  for (const p of rows) prefixByPage.set(p.id, pagePrefix(p));

  return chunks.map((c) =>
    wrapChunkForEmbedding(c.chunk_text, prefixByPage.get(c.page_id) ?? null, c.chunk_source)
  );
}

// ---- Promotion safety -------------------------------------------------

/** What the database says about a scaffold column about to be promoted. */
export interface PromotionState {
  /** Model signature read off the column comment; absent means not ours. */
  signature?: string;
  /** Rows that already carry a vector in the scaffold column. */
  filledRows: number;
  /** Embeddable rows still empty (live pages, above the noise threshold). */
  openCandidates: number;
  /** Rows whose recorded model is not the column's signature. */
  strayModelRows: number;
  /** Indexes the live column carries that the scaffold does not have yet. */
  missingIndexes: string[];
  /** Vectors whose page changed after they were written — made from other text. */
  staleRows?: number;
  /** `format_type` of scaffold and live column, e.g. "vector(1536)". */
  scaffoldType?: string;
  liveType?: string;
  /** Operator accepted promoting before every chunk is embedded. */
  allowPartial: boolean;
}

export interface PromotionVerdict {
  /** Reasons to refuse. Empty means the swap may proceed. */
  blockers: string[];
  /** Worth saying out loud, but not a reason to stop. */
  warnings: string[];
}

/**
 * Whether a scaffold column may take the live column's place.
 *
 * The swap drops the column search runs on, so it is the one step in the
 * model migration that cannot be undone by running something again. These
 * checks are what stands between a finished migration and a product that
 * answers nothing — which is why they live here, tested, rather than as
 * inline ifs in a script that runs once.
 */
export function promotionVerdict(state: PromotionState): PromotionVerdict {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const n = (x: number) => x.toLocaleString("de-AT");

  if (!state.signature) {
    blockers.push(
      "Die Spalte trägt keine Modell-Signatur — sie stammt nicht aus einem Embedding-Lauf."
    );
  }

  // An empty column would take search down completely, and --allow-partial
  // must not be a way to do that by accident.
  if (state.filledRows === 0) {
    blockers.push(
      "Die Ersatzspalte ist leer. Sie an die Stelle der Live-Spalte zu setzen hieße, " +
        "die Suche abzuschalten."
    );
  }

  if (state.strayModelRows > 0) {
    blockers.push(
      `${n(state.strayModelRows)} Zeilen halten Vektoren eines anderen Modells. ` +
        "Vektoren zweier Modelle in einer Spalte ergeben keinen Abstand, sondern Rauschen."
    );
  }

  if (state.openCandidates > 0) {
    if (!state.allowPartial) {
      blockers.push(
        `${n(state.openCandidates)} Chunks sind noch nicht eingebettet. ` +
          "Erst den Lauf zu Ende bringen, oder bewusst --allow-partial setzen."
      );
    } else {
      const total = state.filledRows + state.openCandidates;
      const share = total > 0 ? (state.openCandidates / total) * 100 : 0;
      warnings.push(
        `${n(state.openCandidates)} Chunks (${share.toLocaleString("de-AT", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })} %) bleiben ohne Vektor und ` +
          "sind nach dem Umschalten für die Vektorsuche unsichtbar."
      );
    }
  }

  // A vector made from text that has since changed answers a different
  // question than the one the chunk now poses. The sweep clears them and the
  // run re-embeds them; promoting before that bakes the mismatch in.
  if ((state.staleRows ?? 0) > 0) {
    blockers.push(
      `${n(state.staleRows ?? 0)} Vektoren sind älter als ihre Seite und damit aus anderem ` +
        "Text gemacht. Erst `guard-scaffold-embedding.ts --sweep`, dann den Lauf fertig laufen lassen."
    );
  }

  if (state.missingIndexes.length > 0) {
    blockers.push(
      `Es fehlen die Indizes ${state.missingIndexes.join(", ")}. Ohne sie durchsucht die ` +
        "Datenbank nach dem Umschalten Millionen Vektoren einzeln."
    );
  }

  const tidy = (t?: string) => t?.replace(/\s/g, "");
  if (state.scaffoldType && state.liveType && tidy(state.scaffoldType) !== tidy(state.liveType)) {
    warnings.push(
      `Die Ersatzspalte ist ${state.scaffoldType}, die bisherige ${state.liveType}. ` +
        "Das Schema deklariert vector(1536) — vor der nächsten Migration prüfen."
    );
  }

  return { blockers, warnings };
}
