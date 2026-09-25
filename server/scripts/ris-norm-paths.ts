/**
 * The one path convention of the Austrian federal norm corpus (at-normen/).
 *
 * The full fetch (ris-xml-fetch-normen.ts), the daily delta
 * (ris-delta-watcher.ts), the citation check and the norm reader
 * (src/lib/legal-grounding.ts via corpus-meta.json) must all agree on where a
 * norm lives — otherwise an amendment written by the delta lands next to the
 * old file and never reaches the check:
 *
 *   at-normen/<abk-slug>/<key>.md           law with an abbreviation (abgb/p-1295.md)
 *   at-normen/<abk-slug>-<gnr>/<key>.md     abbreviation shared by several laws
 *   at-normen/gnr-<gnr>/<key>.md            law without an abbreviation
 *   <key>-nor<id>.md                        key used by several norms of one law
 *
 * No network, no database — pure path logic plus reading the corpus folders.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Normalisiert die ArtikelParagraphAnlage-Bezeichnung auf einen Dateischlüssel.
 * Zusammengesetzte Bezeichnungen werden VOLLSTÄNDIG abgebildet:
 * "Art. 4 § 1" → "art-4-p-1". § 0 (Inhaltsverzeichnis ohne Normtext) wird
 * bewusst nicht abgebildet.
 */
export function normKey(apa: string | null): string | null {
  if (!apa) return null;
  const s = apa.trim();
  if (/^§+\s*0\s*$/.test(s)) return null;
  const teile: string[] = [];
  const rx = /(§+|Art\.?|Anl\.?)\s*([0-9]+[a-zA-Z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s)) !== null) {
    const art = m[1].toLowerCase();
    const praefix = art.startsWith("§") ? "p" : art.startsWith("art") ? "art" : "anl";
    teile.push(`${praefix}-${m[2].toLowerCase()}`);
  }
  if (teile.length === 0) return null;
  return teile.join("-");
}

/**
 * Folder of a federal law. `abkShared` says whether the abbreviation's slug
 * is used by more than one Gesetzesnummer (then the number is appended).
 */
export function bundesnormDirName(
  abk: string | null | undefined,
  gnr: string,
  abkShared: boolean
): string {
  if (!abk) return `gnr-${gnr}`;
  const s = slugify(abk);
  return abkShared ? `${s}-${gnr}` : s;
}

/** File key of one norm: the NOR id is appended when the key is used twice in the law. */
export function normFileKey(basisKey: string, norId: string, keyShared: boolean): string {
  return keyShared ? `${basisKey}-${norId.toLowerCase()}` : basisKey;
}

/** Gesetzesnummer of a corpus folder, read from the frontmatter of its first norm. */
export function gesetzesnummerOfDir(dir: string): string | null {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".md"));
  } catch {
    return null;
  }
  for (const name of names.slice(0, 5)) {
    try {
      const head = readFileSync(join(dir, name), "utf8").slice(0, 2000);
      const gnr = head.match(/^gesetzesnummer:\s*["']?(\d+)/m)?.[1];
      if (gnr) return gnr;
    } catch {
      // unreadable file: try the next one
    }
  }
  return null;
}

/**
 * Folder for a norm the delta reports, resolved against the corpus as the
 * full fetch laid it out. The delta sees one law at a time and cannot know
 * whether an abbreviation is shared, so the existing folders decide:
 *   1. "<slug>-<gnr>" exists              → the shared-abbreviation folder
 *   2. "<slug>" exists for this gnr       → that folder
 *   3. "<slug>" exists for another gnr    → "<slug>-<gnr>"
 *   4. neither                            → "<slug>" (a new law)
 * Without an abbreviation: "gnr-<gnr>", as in the full fetch.
 */
export function resolveBundesnormDir(
  corpusDir: string,
  abk: string | null | undefined,
  gnr: string
): string {
  if (!abk) return `gnr-${gnr}`;
  const s = slugify(abk);
  if (existsSync(join(corpusDir, `${s}-${gnr}`))) return `${s}-${gnr}`;
  const plain = join(corpusDir, s);
  if (existsSync(plain)) {
    const owner = gesetzesnummerOfDir(plain);
    return owner && owner !== gnr ? `${s}-${gnr}` : s;
  }
  return s;
}

/**
 * File name (without folder) for a norm in an existing law folder: the
 * NOR-suffixed form when the folder already keeps this key per NOR id,
 * otherwise the plain key (a newer version replaces the older one).
 */
export function resolveNormFileName(dir: string, basisKey: string, norId: string): string {
  const nor = norId.toLowerCase();
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return `${basisKey}.md`;
  }
  const own = `${basisKey}-${nor}.md`;
  if (names.includes(own)) return own;
  const perNor = new RegExp(`^${basisKey.replace(/[-]/g, "\\-")}-nor\\d+\\.md$`, "i");
  return names.some((n) => perNor.test(n)) ? own : `${basisKey}.md`;
}
