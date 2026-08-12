#!/usr/bin/env bun
/**
 * Targeted normalizer — re-normalizes ONLY the refetched files.
 *
 * Liest die Refetch-Logs (/tmp/refetch-defective-*.jsonl) und normalisiert
 * nur die dort gelisteten Dateien neu. Schreibt nach _normalized/.
 *
 *   bun server/scripts/normalize/normalize-refetched.ts --dry-run
 *   bun server/scripts/normalize/normalize-refetched.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const LOGS = args.find((a) => !a.startsWith("--")) ?? "/tmp/refetch-defective-normen.jsonl,/tmp/refetch-defective-landesrecht.jsonl";

const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "..", "law-corpus");
const OUT_ROOT = process.env.NORMALIZED_ROOT ?? join(CORPUS_ROOT, "_normalized");

const hash16 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);

// ── Refetch-Logs lesen ─────────────────────────────────────────────────
interface RefetchEntry {
  slug: string;
  status: string;
  norId?: string;
  docId?: string;
  oldHash?: string;
  newHash?: string;
}

function readRefetchLog(path: string): RefetchEntry[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RefetchEntry)
    .filter((e) => e.status === "refetched");
}

// ── Slug → Dateipfad ───────────────────────────────────────────────────
function slugToPath(slug: string): { raw: string; normalized: string; corpus: string } | null {
  let corpus: string;
  let relPath: string;

  if (slug.startsWith("legal/statutes/at/landesrecht/")) {
    corpus = "at-landesrecht";
    relPath = slug.replace("legal/statutes/at/landesrecht/", "") + ".md";
  } else if (slug.startsWith("legal/statutes/at/")) {
    corpus = "at-normen";
    relPath = slug.replace("legal/statutes/at/", "") + ".md";
  } else {
    return null;
  }

  return {
    raw: join(CORPUS_ROOT, corpus, relPath),
    normalized: join(OUT_ROOT, corpus, relPath),
    corpus,
  };
}

// ── Inline parser (same logic as normalize-corpus.ts, no side effects) ──
interface Raw {
  fm: Record<string, string>;
  list: Record<string, string[]>;
  body: string;
}

function parseRaw(text: string): Raw {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, list: {}, body: text };
  const fm: Record<string, string> = {};
  const list: Record<string, string[]> = {};
  let currentKey: string | null = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentKey) {
      (list[currentKey] ??= []).push(item[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      fm[kv[1]] = kv[2];
      if (kv[2].trim() === "") list[kv[1]] ??= [];
    }
  }
  return { fm, list, body: text.slice(m[0].length) };
}

const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ");

// ── normalizeBody (identisch zu normalize-corpus.ts) ──
function normalizeBody(body: string): string {
  // 1. Frontmatter-Marker im Body entfernen (falls vorhanden)
  let t = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  // 2. Markdown-Heading-Normalisierung
  t = t.replace(/^(#{1,6})\s*(.+?)\s*$/gm, (_, h, title) => `${h} ${title}`);
  // 3. Multiple Leerzeilen reduzieren
  t = t.replace(/\n{4,}/g, "\n\n\n");
  // 4. Trailing whitespace pro Zeile
  t = t.replace(/[ \t]+\n/g, "\n");
  // 5. Section alias normalization (## Norm → ## Norm)
  const SECTION_ALIASES: Record<string, string> = {
    "norm": "Norm",
    "text": "Text",
    "spruch": "Spruch",
    "entscheidungsgründe": "Entscheidungsgründe",
    "entscheidungssatz": "Entscheidungssatz",
    "begründung": "Begründung",
    "tatbestand": "Tatbestand",
    "tenor": "Tenor",
  };
  const lines = t.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (!m) continue;
    const key = m[2].toLowerCase().replace(/\s+/g, " ").trim();
    const canon = SECTION_ALIASES[key];
    if (canon) lines[i] = `${m[1]} ${canon}`;
  }
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

function assertBodyUnchanged(before: string, after: string): string | null {
  const textOf = (s: string) =>
    s.split("\n").filter((l) => !/^#{1,6}\s/.test(l)).join("\n").replace(/\s+/g, " ").trim();
  const a = textOf(before);
  const b = textOf(after);
  if (a === b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `Normtext verändert an Position ${i}: "${a.slice(Math.max(0, i - 40), i + 40)}" → "${b.slice(Math.max(0, i - 40), i + 40)}"`;
    }
  }
  return "Normtext-Länge verändert";
}

// ── Canonical frontmatter builder (minimal — just what we need for output) ──
function buildCanonical(raw: Raw, slug: string): Record<string, unknown> {
  const fm = raw.fm;
  const out: Record<string, unknown> = {};

  // Required fields
  out.title = clean(fm.title) ?? clean(fm.titel) ?? clean(fm.statute) ?? slug;
  out.type = clean(fm.type) ?? "law";
  out.jurisdiction = clean(fm.jurisdiction) ?? "at";

  // Source fields
  const url = clean(fm.source_url) ?? "";
  if (url) out.source_url = url;
  const source = clean(fm.source) ?? "ris-ogd";
  if (source) out.source = source;
  const sourceFormat = clean(fm.source_format);
  if (sourceFormat) out.source_format = sourceFormat;

  // Document IDs
  const docId = clean(fm.document_id) ?? clean(fm.doc_id) ?? clean(fm.nor_id);
  if (docId) out.document_id = docId;
  const id = clean(fm.id);
  if (id) out.id = id;

  // Statute fields
  const statute = clean(fm.statute);
  if (statute) out.statute = statute;
  const paragraph = clean(fm.paragraph);
  if (paragraph) out.paragraph = paragraph;
  const abbreviation = clean(fm.abbreviation);
  if (abbreviation) out.abbreviation = abbreviation;
  const gesetzesnummer = clean(fm.gesetzesnummer);
  if (gesetzesnummer) out.gesetzesnummer = gesetzesnummer;
  const kundmachungsorgan = clean(fm.kundmachungsorgan);
  if (kundmachungsorgan) out.kundmachungsorgan = kundmachungsorgan;
  const inkrafttretensdatum = clean(fm.inkrafttretensdatum);
  if (inkrafttretensdatum) out.inkrafttretensdatum = inkrafttretensdatum;
  const eli = clean(fm.eli);
  if (eli) out.eli = eli;
  const indizes = clean(fm.indizes);
  if (indizes) out.indizes = indizes;
  const schlagworte = clean(fm.schlagworte);
  if (schlagworte) out.schlagworte = schlagworte;
  const zuletzt_aktualisiert = clean(fm.zuletzt_aktualisiert);
  if (zuletzt_aktualisiert) out.zuletzt_aktualisiert = zuletzt_aktualisiert;

  // Landesrecht-specific
  const bundesland = clean(fm.bundesland) ?? clean(fm.state);
  if (bundesland) out.bundesland = bundesland;

  // License
  const license = clean(fm.license);
  if (license) out.license = license;
  const retrieved_at = clean(fm.retrieved_at);
  if (retrieved_at) out.retrieved_at = retrieved_at;

  return out;
}

function serializeFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined || value === "") continue;
    const str = String(value);
    // Quote values that contain special characters
    if (/[:#\-?\[\]{}|>&!'"`]/.test(str) || str.includes("\n")) {
      lines.push(`${key}: "${str.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}: "${str}"`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  const logs = LOGS.split(",");
  const entries: RefetchEntry[] = [];
  for (const log of logs) {
    entries.push(...readRefetchLog(log));
  }

  console.log(`Refetch-Logs: ${logs.join(", ")}`);
  console.log(`Refetched Dateien: ${entries.length}`);
  console.log(`${DRY ? "[DRY-RUN — nichts wird geschrieben]" : ""}`);
  console.log("─".repeat(78));

  let ok = 0, rejected = 0, notFound = 0, skipped = 0;
  const issues: Record<string, number> = {};

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const paths = slugToPath(entry.slug);
    if (!paths) {
      skipped++;
      continue;
    }

    if (!existsSync(paths.raw)) {
      notFound++;
      continue;
    }

    let text: string;
    try { text = readFileSync(paths.raw, "utf8"); }
    catch { notFound++; continue; }

    const raw = parseRaw(text);
    const newBody = normalizeBody(raw.body);

    // SICHERUNG: Normtext darf sich nicht verändern
    const drift = assertBodyUnchanged(raw.body, newBody);
    if (drift) {
      rejected++;
      issues["body_drift"] = (issues["body_drift"] ?? 0) + 1;
      if (i < 5) console.log(`  REJECTED: ${entry.slug} — ${drift.slice(0, 80)}`);
      continue;
    }

    // Canonical frontmatter
    const fm = buildCanonical(raw, entry.slug);
    fm.content_hash = hash16(text.trim());
    fm.body_hash = hash16(newBody);

    const fmStr = serializeFrontmatter(fm);
    const output = `${fmStr}\n\n${newBody.replace(/^\n+/, "")}`;

    ok++;
    if (!DRY) {
      mkdirSync(dirname(paths.normalized), { recursive: true });
      writeFileSync(paths.normalized, output, "utf8");
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  ${i + 1}/${entries.length}  ok=${ok} rejected=${rejected} notFound=${notFound} skipped=${skipped}`);
    }
  }

  console.log("─".repeat(78));
  console.log(`GESAMT: ${ok}/${entries.length} normalisiert, ${rejected} abgelehnt, ${notFound} nicht gefunden, ${skipped} übersprungen`);
  if (Object.keys(issues).length) {
    console.log("\nAblehnungsgründe:");
    for (const [k, n] of Object.entries(issues).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${String(n).padStart(7)}  ${k}`);
    }
  }
}

main();
