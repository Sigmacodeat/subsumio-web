/**
 * The on-disk form of one RIS decision, shared by the full-scan fetcher and
 * its tests. Pure functions only — no network, no RIS lock.
 *
 * The normalizer (scripts/normalize/normalize-corpus.ts) reads `normen` and
 * `entscheidungsart` from this frontmatter into cited_norms and decision_type.
 * Without them a decision cannot say which provisions it applies.
 */

import { closeSync, existsSync, openSync, readdirSync, readSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

export interface JudikaturDoc {
  id: string;
  court: string;
  date: string;
  az: string;
  ecli?: string;
  legalArea: string;
  keywords: string[];
  /** Cited provisions as RIS lists them, e.g. "BEinstG §14 Abs1". */
  normen: string[];
  /** Erkenntnis, Beschluss, … from the court-specific metadata block. */
  decisionType?: string;
  text: string;
  url: string;
  title: string;
}

/** RIS keywords sometimes carry <br/> line breaks inside one entry. */
export function cleanKeyword(k: string): string {
  return k
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Entscheidungsart sits in the court's own block (Bvwg, Vwgh, Justiz, …). */
export function decisionTypeOf(ref: Record<string, unknown>): string | undefined {
  const meta = ((ref.Data as Record<string, unknown> | undefined)?.Metadaten ?? {}) as Record<
    string,
    unknown
  >;
  const jud = (meta.Judikatur ?? {}) as Record<string, unknown>;
  for (const v of Object.values(jud)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const art = (v as Record<string, unknown>).Entscheidungsart;
      if (typeof art === "string" && art.trim()) return art.trim();
    }
  }
  return undefined;
}

export function buildMarkdown(doc: JudikaturDoc, courtKey: string): string {
  const title = `${doc.court} — ${doc.az || "Entscheidung"}`;
  const fm: Record<string, unknown> = {
    type: "court_decision",
    jurisdiction: "at",
    court_type: courtKey,
    title,
    court: doc.court,
    date: doc.date,
    decision_date: doc.date,
    ecli: doc.ecli ?? "",
    case_number: doc.az,
    legal_area: doc.legalArea,
    keywords: doc.keywords.map(cleanKeyword).filter(Boolean),
  };
  // One string, "; "-separated: the form the normalizer's toList() splits.
  if (doc.normen.length > 0) fm.normen = doc.normen.join("; ");
  if (doc.decisionType) fm.entscheidungsart = doc.decisionType;
  fm.source = "ris-ogd";
  fm.source_url = doc.url;
  const frontmatter = yamlDump(fm, { lineWidth: -1, noRefs: true }).trimEnd();

  const text = doc.text || "*Volltext nicht abrufbar — siehe Quelle.*";

  return `---
${frontmatter}
---

# ${title}

${text}

---
*Quelle: [RIS-OGD](${doc.url})*
`;
}

/** The RIS document number in a source URL (…Dokumentnummer=BVWGT_…). */
export function dokumentnummerOf(url: string): string | null {
  const m = url.match(/Dokumentnummer=([^&\s"']+)/) ?? url.match(/\/Dokumente\/[^/]+\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * What is already on disk. The RIS document number (from source_url) is the
 * identity. File names only count for files without one (very old fetches):
 * "2016-12-27-g309-2126636-1" and the undated "g309-2126636-1".
 *
 * A case number alone never identifies a document: one OGH or VwGH decision
 * has several Rechtssätze under the same Geschäftszahl, and when the name
 * counted, every Rechtssatz after the first was taken as already present and
 * never fetched.
 */
export interface ExistingDocs {
  dokNrs: Set<string>;
  /** Names of files without a readable RIS document number. */
  fileKeys: Set<string>;
  undatedKeys: Set<string>;
}

export function loadExistingDocs(outDir: string): ExistingDocs {
  const out: ExistingDocs = { dokNrs: new Set(), fileKeys: new Set(), undatedKeys: new Set() };
  if (!existsSync(outDir)) return out;
  const buf = Buffer.alloc(2048);
  for (const file of readdirSync(outDir)) {
    if (!file.endsWith(".md")) continue;
    const key = file.slice(0, -3);
    let dok: string | null = null;
    let fd: number | undefined;
    try {
      fd = openSync(join(outDir, file), "r");
      const n = readSync(fd, buf, 0, buf.length, 0);
      const head = buf.toString("utf8", 0, n);
      const url = head.match(/^source_url:\s*["']?([^\s"']+)/m)?.[1];
      dok = url ? dokumentnummerOf(url) : null;
    } catch {
      /* unreadable file: the name keys apply */
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    if (dok) {
      out.dokNrs.add(dok);
    } else {
      out.fileKeys.add(key);
      out.undatedKeys.add(key.replace(/^\d{4}-\d{2}-\d{2}-/, ""));
    }
  }
  return out;
}

export function isAlreadyOnDisk(
  existing: ExistingDocs,
  risId: string,
  url: string,
  fileKey: string,
  slugAz: string
): boolean {
  const dok = dokumentnummerOf(url);
  return (
    existing.dokNrs.has(risId) ||
    (dok !== null && existing.dokNrs.has(dok)) ||
    existing.fileKeys.has(fileKey) ||
    existing.undatedKeys.has(slugAz)
  );
}

export function rememberOnDisk(existing: ExistingDocs, risId: string, url: string): void {
  existing.dokNrs.add(risId);
  const dok = dokumentnummerOf(url);
  if (dok) existing.dokNrs.add(dok);
}

/**
 * File name of a newly fetched decision: its RIS document number, unique by
 * construction (case numbers are not — see ExistingDocs).
 */
export function decisionFileName(dokNr: string): string {
  return `${dokNr.toLowerCase()}.md`;
}

// ---------------------------------------------------------------------------
// Metadata backfill: add cited norms / decision type to files written before
// the fetcher kept them. Body text is never touched.
// ---------------------------------------------------------------------------

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/** True when a raw or canonical file already carries at least one cited norm. */
export function hasCitedNorms(content: string): boolean {
  const fm = content.match(FM_RE)?.[1] ?? "";
  if (/^normen:\s*\S/m.test(fm)) return true;
  if (/^cited_norms:\s*\n\s+-\s/m.test(fm)) return true;
  return false;
}

/** Raw fetch output: add `normen` and `entscheidungsart` lines to the frontmatter. */
export function patchRawNormen(content: string, normen: string[], decisionType?: string): string {
  const m = content.match(FM_RE);
  if (!m || normen.length === 0) return content;
  let fm = m[1];
  const add: string[] = [];
  if (!/^normen:\s*\S/m.test(fm)) {
    fm = fm.replace(/^normen:.*$/m, "").replace(/\n{2,}/g, "\n");
    add.push(`normen: ${JSON.stringify(normen.join("; "))}`);
  }
  if (decisionType && !/^entscheidungsart:\s*\S/m.test(fm)) {
    add.push(`entscheidungsart: ${JSON.stringify(decisionType)}`);
  }
  if (add.length === 0) return content;
  return content.replace(FM_RE, () => `---\n${fm.trimEnd()}\n${add.join("\n")}\n---`);
}

/** Canonical schema v1 file: fill `cited_norms: []` and `decision_type: null` in place. */
export function patchCanonicalNormen(
  content: string,
  normen: string[],
  decisionType?: string
): string {
  const m = content.match(FM_RE);
  if (!m || normen.length === 0) return content;
  let fm = m[1];
  fm = fm.replace(
    /^cited_norms: \[\]$/m,
    `cited_norms:\n${normen.map((n) => `  - ${JSON.stringify(n)}`).join("\n")}`
  );
  if (decisionType)
    fm = fm.replace(/^decision_type: null$/m, `decision_type: ${JSON.stringify(decisionType)}`);
  return content.replace(FM_RE, () => `---\n${fm}\n---`);
}
