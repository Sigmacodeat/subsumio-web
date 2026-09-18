/**
 * Server-only: resolves Austrian case-law citations against the RIS-OGD
 * corpus on disk (law-corpus/at-judikatur*). A hit yields the exact RIS
 * document; a miss is reported unverified with a RIS search link — our corpus
 * does not hold every decision, so "not found" means "check it", not "fake".
 *
 * The corpus filename carries the Geschäftszahl / Rechtssatznummer after the
 * decision date (2001-10-22-1ob49-01i.md, ecli-at-ogh0002-2001-rs0115754.md),
 * so one readdir per court builds the lookup — no DB, no per-file reads until
 * a citation actually matches.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import type { GroundedCitation } from "@/lib/types";
import type { CaseCourt, RawCaseCitation } from "@/lib/case-citations";
import { CORPUS_DIR, parseFrontmatter } from "@/lib/legal-grounding";

const COURT_DIRS: Record<CaseCourt, string> = {
  OGH: "at-judikatur",
  "RIS-Justiz": "at-judikatur",
  VwGH: "at-judikatur-vwgh",
  VfGH: "at-judikatur-vfgh",
};

type CaseIndex = Map<string, string>; // key → filename

const indexCache = new Map<string, Promise<CaseIndex>>();

/** Filename → lookup keys (Geschäftszahl, Rechtssatznummer, or each Zahl of a joined VfGH case). */
export function keysForFilename(file: string): string[] {
  const base = file.replace(/\.md$/i, "").toLowerCase();
  const rs = base.match(/(?:^|-)(rs\d{7})$/);
  if (rs) return [rs[1]];
  const rest = base.startsWith("ecli-")
    ? base.replace(/^ecli-at-[a-z0-9]+-\d{4}-/, "")
    : base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const keys = new Set([rest]);
  // Joined VfGH cases: "a14-01-a15-01" → "a14-01", "a15-01".
  for (const m of rest.matchAll(/([a-z]\d{1,5}-\d{2,4})(?=-[a-z]\d|$)/g)) keys.add(m[1]);
  return [...keys];
}

function loadIndex(dir: string): Promise<CaseIndex> {
  let p = indexCache.get(dir);
  if (!p) {
    p = fs
      .readdir(path.join(CORPUS_DIR, dir))
      .then((names) => {
        const idx: CaseIndex = new Map();
        for (const name of names) {
          if (!name.endsWith(".md")) continue;
          for (const key of keysForFilename(name)) {
            if (!idx.has(key)) idx.set(key, name);
          }
        }
        return idx;
      })
      .catch(() => new Map());
    indexCache.set(dir, p);
  }
  return p;
}

const RIS_DOC_RX = /^https:\/\/www\.ris\.bka\.gv\.at\/[^"'<>\s]*$/;

function excerpt(content: string): string {
  const end = content.startsWith("---") ? content.indexOf("\n---", 3) : -1;
  const body = end !== -1 ? content.slice(end + 4) : content;
  return body
    .split("\n")
    .filter((l) => !/^#{1,6}\s/.test(l))
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 600);
}

export async function groundCaseCitations(raw: RawCaseCitation[]): Promise<GroundedCitation[]> {
  const out: GroundedCitation[] = [];
  for (const c of raw.slice(0, 20)) {
    const dir = COURT_DIRS[c.court];
    const file = (await loadIndex(dir)).get(c.key);
    const base: GroundedCitation = {
      code: c.court,
      paragraph: c.cited,
      verified: false,
      category: "judikatur",
      jurisdiction: "at",
      search_url: c.searchUrl,
    };
    if (!file) {
      out.push({ ...base, unverifiable_reason: "Entscheidung nicht im Korpus" });
      continue;
    }
    try {
      const content = await fs.readFile(path.join(CORPUS_DIR, dir, file), "utf8");
      const fm = parseFrontmatter(content);
      const url = (fm.source_url ?? "").replace(
        /^https?:\/\/(www\.)?ris\.bka\.gv\.at/,
        "https://www.ris.bka.gv.at"
      );
      out.push({
        ...base,
        verified: true,
        source_text: excerpt(content),
        ...(RIS_DOC_RX.test(url) ? { source_url: url } : {}),
        context: [fm.dokumenttyp, fm.entscheidungsdatum].filter(Boolean).join(" · "),
      });
    } catch {
      out.push({ ...base, unverifiable_reason: "Entscheidung nicht lesbar" });
    }
  }
  return out;
}
