/**
 * Builds the link to the official Austrian RIS text for a cited norm.
 * Client-safe (no node:fs) — the grounding route fills `source_url` with it,
 * and the citation UI only renders what this module produced.
 *
 * Preference order:
 *   1. Bundesnorm with Gesetzesnummer + § / Art → NormDokument.wxe, which RIS
 *      always resolves to the version in force today (a NOR id pins one
 *      historical version, so it can go stale after an amendment).
 *   2. ELI of the corpus document (Landesrecht, older Bundesnormen).
 *   3. The corpus source_url, served as HTML instead of the raw XML.
 *   4. The whole law in its current version (Gesetzesnummer only).
 * Only https URLs on ris.bka.gv.at are ever returned.
 */

export interface RisNormMeta {
  gesetzesnummer?: string;
  nor_id?: string;
  doc_id?: string;
  eli?: string;
  source_url?: string;
}

const RIS_ORIGIN = "https://www.ris.bka.gv.at";

export interface ParsedNormRef {
  kind: "par" | "art";
  num: string;
}

/** "§ 1295", "§§ 1295 f", "§ 16 Abs. 1", "Art. 7", "Artikel 10" → kind + number. */
export function parseNormRef(paragraph: string): ParsedNormRef | null {
  const p = paragraph.trim();
  const isArt = /^(Artikel|Article|Art\.?)\s*/i.test(p);
  const rest = p.replace(/^(§§?|Artikel|Article|Art\.?)\s*/i, "");
  const m = rest.match(/^(\d+[a-z]*)/i);
  if (!m) return null;
  return { kind: isArt ? "art" : "par", num: m[1].toLowerCase() };
}

function onRisHost(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.hostname !== "ris.bka.gv.at" && u.hostname !== "www.ris.bka.gv.at") return null;
    u.protocol = "https:";
    u.hostname = "www.ris.bka.gv.at";
    return u;
  } catch {
    return null;
  }
}

export function buildRisNormUrl(meta: RisNormMeta, paragraph: string): string | null {
  const gnr = (meta.gesetzesnummer ?? "").trim();
  const ref = parseNormRef(paragraph);
  const isBundesnorm = /^NOR\d+$/i.test(meta.nor_id ?? meta.doc_id ?? "");

  if (/^\d+$/.test(gnr) && ref && (isBundesnorm || !meta.doc_id)) {
    const u = new URL("/NormDokument.wxe", RIS_ORIGIN);
    u.searchParams.set("Abfrage", "Bundesnormen");
    u.searchParams.set("Gesetzesnummer", gnr);
    u.searchParams.set(ref.kind === "art" ? "Artikel" : "Paragraf", ref.num);
    return u.toString();
  }

  const eli = onRisHost(meta.eli);
  if (eli) return eli.toString();

  const src = onRisHost(meta.source_url);
  if (src) {
    src.pathname = src.pathname.replace(/\.xml$/i, ".html");
    return src.toString();
  }

  if (/^\d+$/.test(gnr) && !meta.doc_id) {
    const u = new URL("/GeltendeFassung.wxe", RIS_ORIGIN);
    u.searchParams.set("Abfrage", "Bundesnormen");
    u.searchParams.set("Gesetzesnummer", gnr);
    return u.toString();
  }

  return null;
}

/** EUR-Lex document link from the corpus source_url; only https on eur-lex.europa.eu. */
export function buildEurLexUrl(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl);
    if (u.hostname !== "eur-lex.europa.eu") return null;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}
