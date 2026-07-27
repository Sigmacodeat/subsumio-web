#!/usr/bin/env bun
/**
 * Post-Backfill Quality Verifier
 *
 * After backfill runs, this script verifies that EVERY backfilled file:
 *   1. Has real content (not still a placeholder)
 *   2. The content length is plausible (not truncated)
 *   3. The identity check still passes (case_number/ECLI/CELEX in body)
 *   4. Has legal structure markers (§, Art., Absatz) where expected
 *   5. No encoding artifacts (U+FFFD, double-encoded entities)
 *   6. No HTML residue (stripped tags, script fragments)
 *   7. No RIS navigation chrome in the text
 *   8. Optional: Re-fetch from API and compare character counts
 *
 * Exit codes:
 *   0 = all verified
 *   1 = issues found (printed to stdout)
 *   2 = fatal error
 *
 * Usage:
 *   bun run server/scripts/verify-backfill-quality.ts --dir law-corpus/at-judikatur-vfgh
 *   bun run server/scripts/verify-backfill-quality.ts --dir law-corpus/eu/directives --re-fetch --sample 100
 *   bun run server/scripts/verify-backfill-quality.ts --json /tmp/quality-report.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const DIR = dirIdx >= 0 ? args[dirIdx + 1] : null;
const jsonIdx = args.indexOf("--json");
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const reFetch = args.includes("--re-fetch");
const sampleIdx = args.indexOf("--sample");
const SAMPLE_SIZE = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : 0;
const verbose = args.includes("--verbose");

// ── Thresholds ─────────────────────────────────────────────────────────

const MIN_BODY_CHARS = 200;
const SUSPICIOUS_SHORT_THRESHOLD = 300; // Flag if body is 200-300 chars
const MAX_ENCODING_ARTIFACTS = 3; // Allow a few U+FFFD
const MIN_CONTENT_RATIO = 0.3; // legal_text / total_text ratio

// ── Types ──────────────────────────────────────────────────────────────

type IssueType =
  | "still_placeholder"
  | "body_too_short"
  | "suspiciously_short"
  | "identity_check_failed"
  | "no_legal_structure"
  | "encoding_artifacts"
  | "html_residue"
  | "ris_navigation_chrome"
  | "double_encoded_entities"
  | "truncated_text"
  | "no_section_headings"
  | "fetch_mismatch";

interface FileIssue {
  path: string;
  issues: IssueType[];
  body_chars: number;
  source_url: string;
  case_number: string;
  ecli: string;
  celex: string;
  detail: Record<string, unknown>;
}

interface QualityReport {
  timestamp: string;
  directory: string;
  total_files: number;
  verified: number;
  with_issues: number;
  issues_by_type: Record<string, number>;
  files_with_issues: FileIssue[];
  re_fetch_results?: ReFetchResult[];
}

interface ReFetchResult {
  path: string;
  source_url: string;
  local_chars: number;
  fetched_chars: number;
  char_delta: number;
  match: "exact" | "close" | "mismatch" | "fetch_failed";
  note: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  if (!raw.startsWith("---")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: {}, body: raw };
  const block = raw.slice(3, end);
  const fm: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[m[1]] = v;
  }
  const afterClose = raw.indexOf("\n", end + 1);
  const bodyStart = afterClose === -1 ? raw.length : afterClose + 1;
  return { fm, body: raw.slice(bodyStart) };
}

function isPlaceholder(body: string): boolean {
  return (
    body.includes("Volltext nicht abrufbar") ||
    body.includes("Volltext nicht verfügbar") ||
    body.includes("No full text available") ||
    body.trim().length < 50
  );
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function hasLegalStructure(body: string): boolean {
  // § markers, Art. markers, Absatz markers (1), (2), numbered lists
  return /§|Art\.|Artikel\s+\d|\(\d+[a-z]?\)\s/.test(body);
}

function countEncodingArtifacts(text: string): number {
  return (text.match(/\uFFFD/g) || []).length;
}

function hasHtmlResidue(text: string): boolean {
  return /<\w+[^>]*>|<\/\w+>|<\w+\/>|&lt;|&gt;|&amp;|&nbsp;|&#\d+;/.test(text);
}

function hasRisNavigationChrome(text: string): boolean {
  // Strong indicators: any one of these means RIS chrome leaked through
  const strongPatterns = [
    /Accesskey\s+\d/i,
    /Zum Inhalt\s*\(Accesskey/i,
    /Zur Navigationsleiste/i,
    /Zum Hauptbereich/i,
    /Seitenbereiche:/i,
    /RIS\s*-\s*Startseite/i,
    /Kontakt\s*\(Accesskey/i,
    /Impressum\s*\(Accesskey/i,
  ];
  for (const p of strongPatterns) {
    if (p.test(text)) return true;
  }
  // Pagination headers: "www.ris.bka.gv.at Seite X von Y"
  const pagination = text.match(/www\.ris\.bka\.gv\.at\s+Seite\s+\d+\s+von\s+\d+/gi);
  if (pagination && pagination.length >= 2) return true;
  // RIS document metadata block at end (Gesetzesnummer/Dokumentnummer)
  // This is borderline — it's metadata, not navigation, but it's RIS chrome
  // that shouldn't be in the embedding text.
  const risMeta = text.match(/Gesetzesnummer\d+\nDokumentnummer\S+/);
  if (risMeta) return true;
  return false;
}

function hasDoubleEncodedEntities(text: string): boolean {
  // &amp;amp; &amp;lt; &amp;gt; &amp;quot; etc.
  return /&amp;[a-z]+;|&amp;#\d+;/i.test(text);
}

function detectTruncation(body: string): boolean {
  // Truncation indicators: ends mid-sentence, no closing punctuation
  // BUT: legal texts often end with RIS metadata, Quelle lines, ECLI — not truncation.
  const trimmed = body.trim();
  if (trimmed.length < 100) return false;

  // Strip known suffixes before checking:
  // 1. RIS metadata block (Gesetzesnummer/Dokumentnummer)
  // 2. Quelle line (*Quelle: [RIS-OGD](...)*)
  // 3. ECLI line (ECLI:AT:...)
  let cleaned = trimmed;
  cleaned = cleaned.replace(/\n+\*Quelle:\s*\[[^\]]*\]\([^)]*\)\s*\*?\s*$/s, "");
  cleaned = cleaned.replace(/\n+ECLI:[A-Z:0-9.]+\s*$/s, "");
  cleaned = cleaned.replace(
    /\n+(Gesetzesnummer\d+\nDokumentnummer\S+\n.*|alte Dokumentnummer\S+\n*)$/s,
    ""
  );
  cleaned = cleaned.trim();
  if (cleaned.length < 50) return false; // Was mostly metadata/suffix

  // Check last 50 chars for sentence-ending punctuation or legal endings
  const tail = cleaned.slice(-50).trim();
  const hasEnding =
    /[.!?:)\]}\n]$/.test(tail) ||
    /---\s*$/.test(cleaned) ||
    /\d+$/.test(tail) || // ends with a number (§ reference, date, year)
    /\)$/.test(tail) || // ends with closing paren
    /Anlage\s*\d*$/i.test(tail) ||
    /"?\s*$/.test(tail); // ends with optional quote + whitespace
  return !hasEnding;
}

function extractCaseNumber(fm: Record<string, string>): string {
  return fm.case_number ?? "";
}

function extractEcli(fm: Record<string, string>): string {
  return fm.ecli ?? "";
}

function extractCelex(fm: Record<string, string>): string {
  return fm.celex ?? "";
}

function identityCheck(body: string, fm: Record<string, string>): boolean {
  const normText = normalize(body);
  const caseNum = extractCaseNumber(fm);
  const ecli = extractEcli(fm);
  const celex = extractCelex(fm);

  if (caseNum && normText.includes(normalize(caseNum))) return true;
  if (ecli && normText.includes(normalize(ecli))) return true;
  if (celex) {
    const normCelex = normalize(celex);
    if (normText.includes(normCelex)) return true;
    const celexCore = normCelex.replace(/^3/, "");
    if (celexCore.length > 4 && normText.includes(celexCore)) return true;
  }
  // No identifiers to check — can't verify, assume OK
  if (!caseNum && !ecli && !celex) return true;
  return false;
}

function walkDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

// ── Re-fetch verification ──────────────────────────────────────────────

async function reFetchAndCompare(
  filePath: string,
  fm: Record<string, string>,
  localBody: string
): Promise<ReFetchResult> {
  const sourceUrl = fm.source_url ?? "";
  const result: ReFetchResult = {
    path: relative(CORPUS_ROOT, filePath),
    source_url: sourceUrl,
    local_chars: localBody.trim().length,
    fetched_chars: 0,
    char_delta: 0,
    match: "fetch_failed",
    note: "",
  };

  if (!sourceUrl) {
    result.note = "No source_url in frontmatter";
    return result;
  }

  const isRIS = sourceUrl.includes("ris.bka.gv.at") || sourceUrl.includes("data.bka.gv.at");
  const isEU =
    sourceUrl.includes("publications.europa.eu") || sourceUrl.includes("eur-lex.europa.eu");
  const isDeZip = sourceUrl.includes("gesetze-im-internet.de") && sourceUrl.endsWith(".zip");

  try {
    let fetchedText = "";

    if (isDeZip) {
      // DE laws from gesetze-im-internet.de are XML ZIP files.
      // Must download, unzip, parse XML — same as ingest-law-corpus.ts.
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Subsumio-Quality-Verify/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        try {
          const zipBuf = Buffer.from(await res.arrayBuffer());
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(zipBuf);
          // Find the .xml file inside the zip
          const xmlFile = Object.values(zip.files).find((f) => f.name.endsWith(".xml"));
          if (xmlFile) {
            const xml = await xmlFile.async("string");
            // Strip XML tags to get plain text (rough comparison)
            fetchedText = xml
              .replace(/<[^>]+>/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
              .replace(/\s+/g, " ")
              .trim();
          }
        } catch {
          // JSZip not available or corrupt zip — skip
        }
      }
    } else if (isRIS) {
      // Fetch XML (cleanest source)
      const abfrageMatch = sourceUrl.match(/Abfrage=([^&]+)/);
      const dokNrMatch = sourceUrl.match(/Dokumentnummer=([^&]+)/);
      const directPathMatch = sourceUrl.match(/\/Dokumente\/([^/]+)\/([^/]+)\//);
      const abfrage = abfrageMatch?.[1] || directPathMatch?.[1] || "";
      const dokNr = dokNrMatch?.[1] || directPathMatch?.[2] || "";

      if (abfrage && dokNr) {
        const xmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.xml`;
        const res = await fetch(xmlUrl, {
          headers: { "User-Agent": "Subsumio-Quality-Verify/1.0" },
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const xml = await res.text();
          // Extract nutzdaten (same as backfill-corpus-text.ts)
          const nutz = xml.match(/<nutzdaten>([\s\S]*?)<\/nutzdaten>/);
          if (nutz) {
            let t = nutz[1];
            t = t.replace(/<kzinhalt[^>]*>[\s\S]*?<\/kzinhalt>/g, "");
            t = t.replace(/<fzinhalt[^>]*>[\s\S]*?<\/fzinhalt>/g, "");
            t = t.replace(/<ueberschrift[^>]*>([\s\S]*?)<\/ueberschrift>/g, "\n## $1\n");
            t = t.replace(/<absatz[^>]*>/g, "\n").replace(/<\/absatz>/g, "\n");
            t = t.replace(/<[^>]+>/g, "");
            t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
            t = t.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
            t = t
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'");
            fetchedText = t
              .replace(/[ \t]+\n/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
          }
        }
      }
    } else if (isEU) {
      const cellarId = sourceUrl.split("/cellar/")[1];
      if (cellarId) {
        const contentUrl = `https://publications.europa.eu/resource/cellar/${cellarId}`;
        const res = await fetch(contentUrl, {
          headers: { Accept: "text/html", "Accept-Language": "de" },
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const html = await res.text();
          fetchedText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        }
      }
    } else {
      // Generic fetch
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Subsumio-Quality-Verify/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        fetchedText = (await res.text())
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
      }
    }

    if (fetchedText.length === 0) {
      result.match = "fetch_failed";
      result.note = "API returned empty or fetch failed";
      return result;
    }

    result.fetched_chars = fetchedText.length;
    result.char_delta = Math.abs(fetchedText.length - localBody.trim().length);

    // Compare: allow 10% difference for HTML stripping variance
    const localLen = localBody.trim().length;
    const ratio = Math.min(localLen, fetchedText.length) / Math.max(localLen, fetchedText.length);

    if (ratio > 0.95) {
      result.match = "exact";
      result.note = `Char match: ${Math.round(ratio * 100)}% (delta: ${result.char_delta})`;
    } else if (ratio > 0.8) {
      result.match = "close";
      result.note = `Char match: ${Math.round(ratio * 100)}% (delta: ${result.char_delta}) — acceptable variance from HTML stripping`;
    } else {
      result.match = "mismatch";
      result.note = `Char match: ${Math.round(ratio * 100)}% (local: ${localLen}, fetched: ${fetchedText.length}) — POSSIBLE TRUNCATION OR WRONG CONTENT`;
    }

    // RIS rate limiting
    if (isRIS) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    result.match = "fetch_failed";
    result.note = e instanceof Error ? e.message : String(e);
  }

  return result;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  if (!DIR) {
    console.error(
      "Usage: bun run server/scripts/verify-backfill-quality.ts --dir <corpus-dir> [--re-fetch] [--sample N] [--json path]"
    );
    process.exit(2);
  }

  const absDir = DIR.startsWith("law-corpus/")
    ? join(CORPUS_ROOT, DIR.replace(/^law-corpus\//, ""))
    : DIR;

  if (!existsSync(absDir)) {
    console.error(`Directory not found: ${absDir}`);
    process.exit(2);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Post-Backfill Quality Verifier");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Directory:  ${absDir}`);
  console.log(
    `  Re-fetch:   ${reFetch ? `enabled (sample: ${SAMPLE_SIZE || "all"})` : "disabled"}`
  );
  console.log(`  Timestamp:  ${new Date().toISOString()}`);
  console.log("");

  const allFiles = walkDir(absDir);
  console.log(`  Scanning ${allFiles.length} markdown files...\n`);

  const issues: FileIssue[] = [];
  let verified = 0;
  const issuesByType: Record<string, number> = {};

  for (const filePath of allFiles) {
    const raw = readFileSync(filePath, "utf-8");
    const { fm, body } = parseFrontmatter(raw);
    const bodyTrimmed = body.trim();
    const relPath = relative(CORPUS_ROOT, filePath);

    const fileIssues: IssueType[] = [];
    const detail: Record<string, unknown> = {};

    // 1. Still placeholder?
    if (isPlaceholder(body)) {
      fileIssues.push("still_placeholder");
    }

    // 2. Body too short?
    if (bodyTrimmed.length < MIN_BODY_CHARS && !isPlaceholder(body)) {
      fileIssues.push("body_too_short");
      detail.body_chars = bodyTrimmed.length;
    } else if (bodyTrimmed.length > 0 && bodyTrimmed.length < SUSPICIOUS_SHORT_THRESHOLD) {
      fileIssues.push("suspiciously_short");
      detail.body_chars = bodyTrimmed.length;
    }

    // 3. Identity check
    if (!isPlaceholder(body) && bodyTrimmed.length >= MIN_BODY_CHARS) {
      if (!identityCheck(body, fm)) {
        fileIssues.push("identity_check_failed");
        detail.case_number = extractCaseNumber(fm);
        detail.ecli = extractEcli(fm);
        detail.celex = extractCelex(fm);
      }
    }

    // 4. Legal structure (only for law/decision types)
    const type = fm.type ?? "";
    if (
      !isPlaceholder(body) &&
      bodyTrimmed.length >= MIN_BODY_CHARS &&
      (type === "law" ||
        type === "court_decision" ||
        type === "state_legislation" ||
        type === "landesgesetz")
    ) {
      if (!hasLegalStructure(body)) {
        fileIssues.push("no_legal_structure");
      }
    }

    // 5. Encoding artifacts
    const artifactCount = countEncodingArtifacts(body);
    if (artifactCount > MAX_ENCODING_ARTIFACTS) {
      fileIssues.push("encoding_artifacts");
      detail.encoding_artifacts = artifactCount;
    }

    // 6. HTML residue
    if (!isPlaceholder(body) && bodyTrimmed.length >= MIN_BODY_CHARS) {
      if (hasHtmlResidue(body)) {
        fileIssues.push("html_residue");
      }
    }

    // 7. RIS navigation chrome
    if (hasRisNavigationChrome(body)) {
      fileIssues.push("ris_navigation_chrome");
    }

    // 8. Double-encoded entities
    if (hasDoubleEncodedEntities(body)) {
      fileIssues.push("double_encoded_entities");
    }

    // 9. Truncation detection
    if (!isPlaceholder(body) && bodyTrimmed.length >= MIN_BODY_CHARS) {
      if (detectTruncation(body)) {
        fileIssues.push("truncated_text");
      }
    }

    // 10. Section count check (for laws)
    if (!isPlaceholder(body) && bodyTrimmed.length >= MIN_BODY_CHARS) {
      const type = fm.type ?? "";
      if (
        type === "law" ||
        type === "state_legislation" ||
        type === "landesgesetz" ||
        type === "eu_legislation"
      ) {
        const headed = (body.match(/^#{2,3}\s+§\s+\d+/gm) || []).length;
        const artHeaded = (body.match(/^#{2,3}\s+Art\.?\s+\d+/gm) || []).length;
        const inline = (body.match(/§\.?\s*\d+[a-z]*\s*\./g) || []).length;
        const totalSections = Math.max(headed + artHeaded, inline);
        if (totalSections === 0 && bodyTrimmed.length > 500) {
          fileIssues.push("no_section_headings");
          detail.section_count = 0;
        } else if (totalSections > 0) {
          detail.section_count = totalSections;
        }
      }
    }

    // 11. Absatz marker check (for laws with expected structure)
    if (!isPlaceholder(body) && bodyTrimmed.length >= MIN_BODY_CHARS) {
      const type = fm.type ?? "";
      if (
        type === "law" ||
        type === "state_legislation" ||
        type === "landesgesetz" ||
        type === "eu_legislation"
      ) {
        const absatzCount = (body.match(/^\(\d+[a-z]?\)\s/gm) || []).length;
        detail.absatz_count = absatzCount;
        // Only flag if the law is long enough to expect absatz structure
        // but has zero (likely a structural extraction failure)
        if (absatzCount === 0 && bodyTrimmed.length > 2000) {
          // Don't fail — some laws genuinely have no numbered absätze
          // But record it as a detail for investigation
        }
      }
    }

    if (fileIssues.length === 0) {
      verified++;
    } else {
      issues.push({
        path: relPath,
        issues: fileIssues,
        body_chars: bodyTrimmed.length,
        source_url: fm.source_url ?? "",
        case_number: extractCaseNumber(fm),
        ecli: extractEcli(fm),
        celex: extractCelex(fm),
        detail,
      });
      for (const iss of fileIssues) {
        issuesByType[iss] = (issuesByType[iss] ?? 0) + 1;
      }
    }
  }

  // Print summary
  console.log(
    "┌────────────────────────────────────────────────────────────────────────────────────┐"
  );
  console.log(
    "│ QUALITY VERIFICATION REPORT                                                         │"
  );
  console.log(
    "├────────────────────────────────────────────────────────────────────────────────────┤"
  );
  console.log(
    `│ Total files:         ${String(allFiles.length).padStart(10)}                                           │`
  );
  console.log(
    `│ ✅ Verified:         ${String(verified).padStart(10)}  (${Math.round((verified / allFiles.length) * 1000) / 10}%)                              │`
  );
  console.log(
    `│ ⚠️  With issues:      ${String(issues.length).padStart(10)}  (${Math.round((issues.length / allFiles.length) * 1000) / 10}%)                              │`
  );
  console.log(
    "├────────────────────────────────────────────────────────────────────────────────────┤"
  );
  console.log(
    "│ Issues by type:                                                                     │"
  );
  for (const [type, count] of Object.entries(issuesByType).sort((a, b) => b[1] - a[1])) {
    console.log(
      `│   ${type.padEnd(28)} ${String(count).padStart(8)}                                                 │`
    );
  }
  console.log(
    "└────────────────────────────────────────────────────────────────────────────────────┘"
  );

  // Show sample issues
  if (issues.length > 0) {
    const showCount = Math.min(issues.length, verbose ? 50 : 20);
    console.log(`\n⚠️  Files with issues (showing ${showCount} of ${issues.length}):\n`);
    for (const iss of issues.slice(0, showCount)) {
      console.log(`  ${iss.path}`);
      console.log(`    Issues: ${iss.issues.join(", ")}`);
      console.log(`    Body: ${iss.body_chars} chars | URL: ${iss.source_url.slice(0, 80)}`);
      if (Object.keys(iss.detail).length > 0) {
        console.log(`    Detail: ${JSON.stringify(iss.detail)}`);
      }
      console.log("");
    }
    if (issues.length > showCount) {
      console.log(`  ... and ${issues.length - showCount} more (use --verbose or --json)`);
    }
  }

  // Re-fetch verification
  let reFetchResults: ReFetchResult[] | undefined;
  if (reFetch) {
    // Only re-fetch files that have real content (not placeholders).
    // Re-fetching a placeholder and comparing to API is meaningless.
    const candidates = allFiles
      .map((f) => {
        const raw = readFileSync(f, "utf-8");
        const { fm, body } = parseFrontmatter(raw);
        return {
          path: relative(CORPUS_ROOT, f),
          isPlaceholder: isPlaceholder(body),
          body,
          fm,
        };
      })
      .filter((c) => !c.isPlaceholder);

    const sampleCount =
      SAMPLE_SIZE > 0 ? Math.min(SAMPLE_SIZE, candidates.length) : Math.min(100, candidates.length);
    const step = Math.max(1, Math.floor(candidates.length / sampleCount));
    const sample = candidates.filter((_, i) => i % step === 0).slice(0, sampleCount);

    console.log(`\n🔍 Re-fetch verification: sampling ${sample.length} files from API...\n`);

    reFetchResults = [];
    let exact = 0,
      close = 0,
      mismatch = 0,
      failed = 0;

    for (const s of sample) {
      const fullPath = join(CORPUS_ROOT, s.path);
      const result = await reFetchAndCompare(fullPath, s.fm, s.body);
      reFetchResults.push(result);

      const icon =
        result.match === "exact"
          ? "✅"
          : result.match === "close"
            ? "🟡"
            : result.match === "mismatch"
              ? "❌"
              : "⏭️";
      console.log(`  ${icon} ${s.path.slice(0, 60)} — ${result.note}`);

      if (result.match === "exact") exact++;
      else if (result.match === "close") close++;
      else if (result.match === "mismatch") mismatch++;
      else failed++;
    }

    console.log(
      `\n  Re-fetch Summary: ${exact} exact, ${close} close, ${mismatch} mismatch, ${failed} failed\n`
    );

    if (mismatch > 0) {
      console.log("  ❌ MISMATCH DETECTED — some files may have truncated or wrong content!");
      console.log("  → Re-run backfill for mismatched files\n");
    }
  }

  // JSON output
  if (JSON_OUT) {
    const report: QualityReport = {
      timestamp: new Date().toISOString(),
      directory: DIR,
      total_files: allFiles.length,
      verified,
      with_issues: issues.length,
      issues_by_type: issuesByType,
      files_with_issues: issues,
      re_fetch_results: reFetchResults,
    };
    writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
    console.log(`📄 Full report: ${JSON_OUT}`);
  }

  if (issues.length > 0) {
    console.log(`\n❌ ${issues.length} files have quality issues — backfill is NOT verified`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${allFiles.length} files passed quality verification`);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
