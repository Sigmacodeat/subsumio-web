/**
 * Corpus Steward — Shared Library
 *
 * Path-Confinement, Quality-Flags, Audit-Log, Version-History, Diff
 * für das Corpus Steward Dashboard.
 * Alle Dateioperationen sind auf law-corpus/_normalized/ beschränkt.
 *
 * RAW-SYNC-PFLICHT: Jede Schreiboperation (write/create/restore/bulk-edit)
 * MUSS syncToRawCorpus() aufrufen, jede Löschung removeFromRawCorpus().
 * Die Pipeline importiert aus law-corpus/{dir}/ (raw), nicht aus
 * _normalized/. Ohne Sync kommt die Steward-Änderung nie in die DB.
 * Siehe BUG 5 im Audit-Verlauf.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  unlinkSync,
  statSync,
  realpathSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
} from "fs";
import { join, resolve, relative, dirname } from "path";

// ── Atomic Write Helper (BUG 54 + BUG 56) ──────────────────────────────
// Schreibt Dateien atomar via tmp + fsync + rename. Verhindert korrupte
// Dateien bei Abbruch mid-write (BUG 54) UND bei Power-Loss (BUG 56).
// Best Practice laut 0xKiire/thelinuxcode: write tmp → fsync(fd) → rename →
// fsync(dir). Bei 713K juristischen Dokumenten ist Durability kritisch —
// ein rename ohne fsync kann auf Power-Loss zu einer leeren Datei führen.
export function atomicWrite(absPath: string, content: string): void {
  const tmp = `${absPath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, content, "utf-8");
  // BUG 56: fsync vor rename — sonst ist rename sichtbar aber Daten evtl.
  // noch im Page-Cache und bei Power-Loss verloren. Siehe:
  // https://0xkiire.com/crash-consistency-fsync-rename/
  try {
    const fd = openSync(tmp, "r+");
    try {
      fsyncSync(fd);
    } catch {
      /* fsync nicht verfügbar (PGLite/WASM) */
    }
    closeSync(fd);
  } catch {
    /* tmp bereits gelöscht oder cross-platform */
  }
  renameSync(tmp, absPath);
}

// ── Path Confinement ───────────────────────────────────────────────────

const REPO_ROOT = resolve(process.cwd());
export const NORMALIZED_ROOT = join(REPO_ROOT, "law-corpus", "_normalized");
const VERSIONS_DIR = join(NORMALIZED_ROOT, "_versions");

/** Max Versionen pro Datei — älteste werden automatisch gelöscht. */
const MAX_VERSIONS = 50;

/** Max Audit-Log-Einträge — Rotation wenn überschritten. */
const MAX_AUDIT_ENTRIES = 10_000;

/**
 * Validiert und safe-parsed einen Corpus-Pfad. Verhindert Path Traversal
 * und Symlink-Angriffe. Erlaubt nur: law-corpus/_normalized/at-{name}/...
 */
export function safeCorpusPath(relPath: string): string | null {
  const abs = resolve(NORMALIZED_ROOT, relPath);
  const rel = relative(NORMALIZED_ROOT, abs);

  // Muss relativ zu NORMALIZED_ROOT sein (kein ../ escape)
  if (rel.startsWith("..") || rel.includes("..")) return null;
  // BUG 37: vorher nur at-*/at/ — de/ch/eu Pfade wurden abgewiesen.
  // Das war der Root Cause aller at-* Filter in den API-Routes.
  if (
    !rel.startsWith("at-") &&
    !rel.startsWith("at/") &&
    !rel.startsWith("de") &&
    !rel.startsWith("ch") &&
    !rel.startsWith("eu")
  )
    return null;

  // Symlink-Schutz: wenn die Datei existiert, prüfe dass der realPath
  // immer noch innerhalb von NORMALIZED_ROOT liegt. Ein Symlink
  // at-normen/evil.md → /etc/passwd würde sonst gelesen werden.
  try {
    const real = realpathSync(abs);
    const realRel = relative(NORMALIZED_ROOT, real);
    if (realRel.startsWith("..") || realRel.includes("..")) return null;
  } catch {
    // Datei existiert nicht → kein Symlink-Check nötig
  }

  return abs;
}

/**
 * Synced Raw-Root — das Verzeichnis law-corpus/ (ohne _normalized).
 * Die Pipeline importiert aus law-corpus/{dir}/, der Steward bearbeitet
 * law-corpus/_normalized/{dir}/. Ohne Sync kommt die Steward-Änderung
 * nie in die DB (BUG 5).
 */
const RAW_ROOT = join(REPO_ROOT, "law-corpus");

/**
 * Synchronisiert eine Datei von _normalized/{path} nach law-corpus/{path}.
 * Wird nach write/create/restore aufgerufen, damit der Pipeline-Import
 * (der aus law-corpus/{dir} liest) die Änderung sieht und needsImport
 * (mtime-basiert) anschlägt.
 *
 * Wenn die Raw-Datei nicht existiert, wird sie angelegt (create-Fall).
 * Wenn _normalized die Datei nicht hat (sollte nicht passieren), ist das
 * ein No-Op. Fehler beim Sync sind nicht fatal — die Pipeline hat einen
 * eigenen Reconcile-Schritt der Lücken findet.
 */
export function syncToRawCorpus(relPath: string, content: string): boolean {
  const rawAbs = resolve(RAW_ROOT, relPath);
  const rawRel = relative(RAW_ROOT, rawAbs);

  // Path-Confinement: muss innerhalb law-corpus/ liegen und mit einer
  // bekannten Jurisdiktion beginnen. BUG 39: vorher startsWith("at")
  // matchte auch "atlas/" — strikter Check auf "at-" oder "at/".
  if (rawRel.startsWith("..") || rawRel.includes("..")) return false;
  if (
    !rawRel.startsWith("at-") &&
    !rawRel.startsWith("at/") &&
    !rawRel.startsWith("de") &&
    !rawRel.startsWith("ch") &&
    !rawRel.startsWith("eu")
  )
    return false;

  try {
    mkdirSync(dirname(rawAbs), { recursive: true });
    atomicWrite(rawAbs, content);
    return true;
  } catch {
    // Raw-Verzeichnis nicht vorhanden (z.B. Web-Container ohne law-corpus Volume)
    return false;
  }
}

/**
 * Entfernt eine Datei aus law-corpus/{path} (Raw-Sync bei delete).
 * Wenn die Datei nicht existiert, ist das ein No-Op.
 */
export function removeFromRawCorpus(relPath: string): boolean {
  const rawAbs = resolve(RAW_ROOT, relPath);
  const rawRel = relative(RAW_ROOT, rawAbs);

  if (rawRel.startsWith("..") || rawRel.includes("..")) return false;
  // BUG 39: strikter Jurisdiktions-Check (at- oder at/, nicht nur "at")
  if (
    !rawRel.startsWith("at-") &&
    !rawRel.startsWith("at/") &&
    !rawRel.startsWith("de") &&
    !rawRel.startsWith("ch") &&
    !rawRel.startsWith("eu")
  )
    return false;

  try {
    if (existsSync(rawAbs)) {
      unlinkSync(rawAbs);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// ── Frontmatter Parsing ────────────────────────────────────────────────

interface ParsedDoc {
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

/**
 * Parst eine Markdown-Datei mit YAML-Frontmatter.
 */
export function parseDoc(content: string): ParsedDoc {
  // Normalize CRLF to LF — sonst matcht der Frontmatter-Regex nicht
  // und der gesamte Inhalt wird als Body geparst (Frontmatter-Verlust).
  const normalized = content.includes("\r\n") ? content.replace(/\r\n/g, "\n") : content;
  // Regex matcht `---` nur zwischen Newlines (sicherer als split("---")).
  // Bekannte Limitierung: wenn ein Frontmatter-Wert `---` alleine auf einer
  // Zeile enthält (z.B. in einem Block-Scalar `|`), matcht der Regex zu früh.
  // In juristischen Corpus-Dateien kommt das nicht vor. Für volle YAML-Spec
  // compliance wäre js-yaml nötig — siehe Recherche 2026-01.
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: normalized, raw: normalized };
  }

  const fmText = fmMatch[1];
  const body = fmMatch[2];
  const frontmatter: Record<string, unknown> = {};

  let currentKey = "";

  for (const line of fmText.split("\n")) {
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);

    if (listMatch && currentKey) {
      // Listenelement gefunden — wenn der aktuelle Wert noch ein String ist,
      // in ein Array umwandeln (z.B. "doc_id_alt:" gefolgt von "- NOR1")
      if (!Array.isArray(frontmatter[currentKey])) {
        const prev = frontmatter[currentKey];
        frontmatter[currentKey] = prev === "" || prev === undefined ? [] : [prev];
      }
      (frontmatter[currentKey] as unknown[]).push(parseValue(listMatch[1]));
    } else if (kvMatch) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim();

      if (val === "[]") {
        frontmatter[key] = [];
        currentKey = "";
      } else if (val === "") {
        // Leerer Wert (z.B. "title:") — könnte ein Array-Start sein
        // (wenn nächste Zeile "- item"). Vorerst leerer String;
        // listMatch-Branch wandelt es bei Bedarf in ein Array um.
        frontmatter[key] = "";
        currentKey = key;
      } else {
        frontmatter[key] = parseValue(val);
        currentKey = "";
      }
    }
  }

  return { frontmatter, body, raw: content };
}

function parseValue(val: string): unknown {
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    // Double-quoted YAML: de-escape. BUG 57: Reihenfolge korrigiert —
    // zuerst \\ → \ (escaped backslash), DANN \n/\r/\t/\" de-escapen.
    // Vorher wurde \\n zuerst zu newline, dann \\ zu \ — aber das \n
    // das gerade erzeugt wurde blieb unberührt. Korrekte YAML-De-Escaping
    // Reihenfolge: backslash zuerst, dann escape-sequences.
    // Siehe: https://yaml.org/spec/1.2.2/#57-escaped-characters
    return val
      .slice(1, -1)
      .replace(/\\\\/g, "\x00") // placeholder für escaped backslash
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\x00/g, "\\");
  }
  if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
    // Single-quoted YAML: '' → ' (doubled single quote = escaped quote)
    return val.slice(1, -1).replace(/''/g, "'");
  }
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === "null") return null;
  if (val === "[]") return [];
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  // JSON object/array inline (z.B. nested: {"a":1})
  if ((val.startsWith("{") && val.endsWith("}")) || (val.startsWith("[") && val.endsWith("]"))) {
    try {
      return JSON.parse(val);
    } catch {
      /* not JSON, return as-is */
    }
  }
  return val;
}

/**
 * Serialisiert Frontmatter + Body zurück zu Markdown.
 */
export function serializeDoc(frontmatter: Record<string, unknown>, body: string): string {
  const fmLines: string[] = [];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (Array.isArray(val)) {
      if (val.length === 0) {
        fmLines.push(`${key}: []`);
      } else {
        fmLines.push(`${key}:`);
        for (const item of val) {
          fmLines.push(`  - ${formatValue(item)}`);
        }
      }
    } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      // Nested object → JSON-String (YAML nested mapping wäre komplexer und
      // die bestehenden Dateien verwenden auch keine nested objects)
      fmLines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      fmLines.push(`${key}: ${formatValue(val)}`);
    }
  }
  return `---\n${fmLines.join("\n")}\n---\n${body}`;
}

function formatValue(val: unknown): string {
  if (val === null) return "null";
  if (val === true) return "true";
  if (val === false) return "false";
  if (typeof val === "string") {
    // Quote if the string contains YAML-special chars or newlines/CR
    // BUG 50: \n und \r müssen escaped werden — sonst entsteht invalides
    // YAML mit einer literalen Newline im quoted string. parseValue macht
    // \\n → \n De-Escaping; ohne dieses Escaping ist der Roundtrip broken.
    // Siehe: https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2281
    // (exakt derselbe Bug in einem anderen Projekt).
    if (
      /[:#\[\]{}&*?|<>=!%@`,"']/.test(val) ||
      val.includes("\n") ||
      val.includes("\r") ||
      val.trim() !== val
    ) {
      return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
    }
    return val;
  }
  if (typeof val === "number") return String(val);
  return String(val);
}

// ── Quality Flags ──────────────────────────────────────────────────────

export type QualityFlag = "verified" | "needs_review" | "defective" | "unreviewed" | "archived";

interface FlagEntry {
  flag: QualityFlag;
  note?: string;
  flaggedBy: string;
  flaggedAt: string;
}

const FLAGS_FILE = join(NORMALIZED_ROOT, "_steward-flags.json");

let flagsCache: Record<string, FlagEntry> | null = null;

function loadFlags(): Record<string, FlagEntry> {
  if (flagsCache) return flagsCache;
  try {
    if (existsSync(FLAGS_FILE)) {
      flagsCache = JSON.parse(readFileSync(FLAGS_FILE, "utf-8"));
      return flagsCache!;
    }
  } catch {
    // corrupt — start fresh
  }
  flagsCache = {};
  return flagsCache;
}

function saveFlags(flags: Record<string, FlagEntry>): void {
  flagsCache = flags;
  // BUG 43: atomic write (tmp + rename) — verhindert korrupte Flag-Datei
  // bei Abbruch mid-write. Bei 713K Dateien kann die Datei mehrere MB groß sein.
  const tmp = `${FLAGS_FILE}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(flags, null, 2), "utf-8");
  renameSync(tmp, FLAGS_FILE);
}

export function getFlag(relPath: string): FlagEntry | null {
  const flags = loadFlags();
  return flags[relPath] ?? null;
}

export function getFlagsBulk(relPaths: string[]): Record<string, FlagEntry> {
  const flags = loadFlags();
  const result: Record<string, FlagEntry> = {};
  for (const p of relPaths) {
    if (flags[p]) result[p] = flags[p];
  }
  return result;
}

export function setFlag(
  relPath: string,
  flag: QualityFlag,
  note: string | undefined,
  user: string
): FlagEntry {
  const flags = loadFlags();
  const entry: FlagEntry = { flag, note, flaggedBy: user, flaggedAt: new Date().toISOString() };
  flags[relPath] = entry;
  saveFlags(flags);
  auditLog({ action: "set_flag", path: relPath, user, details: { flag, note } });
  return entry;
}

export function setFlagsBulk(relPaths: string[], flag: QualityFlag, user: string): number {
  const flags = loadFlags();
  const ts = new Date().toISOString();
  for (const p of relPaths) {
    flags[p] = { flag, flaggedBy: user, flaggedAt: ts };
  }
  saveFlags(flags);
  auditLog({ action: "bulk_set_flag", paths: relPaths.length, user, details: { flag } });
  return relPaths.length;
}

function deleteFlag(relPath: string, user: string): void {
  const flags = loadFlags();
  delete flags[relPath];
  saveFlags(flags);
  auditLog({ action: "delete_flag", path: relPath, user });
}

// ── Audit Log ──────────────────────────────────────────────────────────

const AUDIT_FILE = join(NORMALIZED_ROOT, "_steward-audit.jsonl");

interface AuditEntry {
  action: string;
  path?: string;
  paths?: number;
  user: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export function auditLog(entry: Omit<AuditEntry, "timestamp">): void {
  const full: AuditEntry = { ...entry, timestamp: new Date().toISOString() };
  appendFileSync(AUDIT_FILE, JSON.stringify(full) + "\n", "utf-8");

  // Rotation: wenn die Datei zu groß wird (>MAX_AUDIT_ENTRIES Zeilen),
  // behalte nur die letzten MAX_AUDIT_ENTRIES. Verhindert unendliches
  // Wachstum (713K Dateien × 10 Edits = 7.1M Audit-Einträge → mehrere GB).
  // Check nur alle 100 Writes (statSync ist billig, aber nicht gratis).
  if (Math.random() < 0.01) {
    try {
      const stat = statSync(AUDIT_FILE);
      // Grobe Schätzung: ~200 Bytes pro Eintrag → 10K Einträge ≈ 2MB
      if (stat.size > 5 * 1024 * 1024) {
        rotateAuditLog();
      }
    } catch {
      /* ignore */
    }
  }
}

/** Rotiert das Audit-Log: behalte nur die letzten MAX_AUDIT_ENTRIES Zeilen. */
function rotateAuditLog(): void {
  try {
    const lines = readFileSync(AUDIT_FILE, "utf-8").trim().split("\n");
    if (lines.length <= MAX_AUDIT_ENTRIES) return;
    const kept = lines.slice(lines.length - MAX_AUDIT_ENTRIES);
    // BUG 52: atomic write (tmp + rename) — verhindert korruptes Audit-Log
    const tmp = `${AUDIT_FILE}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, kept.join("\n") + "\n", "utf-8");
    renameSync(tmp, AUDIT_FILE);
  } catch {
    /* ignore */
  }
}

export type AuditLogEntry = AuditEntry;

export function getAuditLog(limit: number = 50, pathFilter?: string): AuditLogEntry[] {
  if (!existsSync(AUDIT_FILE)) return [];
  const lines = readFileSync(AUDIT_FILE, "utf-8").trim().split("\n");
  const entries: AuditLogEntry[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as AuditLogEntry;
      if (pathFilter && entry.path !== pathFilter) continue;
      entries.push(entry);
    } catch {
      // skip malformed
    }
  }
  return entries.reverse().slice(0, limit);
}

// ── Version History ────────────────────────────────────────────────────

/**
 * Speichert eine Version einer Datei im _versions/ Verzeichnis.
 * Format: _versions/{hash}/{timestamp}.md
 * Metadaten in _versions/{hash}/meta.json
 */
interface VersionEntry {
  version: number;
  timestamp: string;
  user: string;
  size: number;
  action: "edit" | "create" | "restore" | "delete";
  note?: string;
}

interface VersionDetail extends VersionEntry {
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

function versionDirFor(relPath: string): string {
  // Hash the path to create a stable directory name
  const hash = simpleHash(relPath);
  return join(VERSIONS_DIR, hash);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + "_" + Buffer.from(str).toString("hex").slice(0, 8);
}

function loadVersionMeta(relPath: string): VersionEntry[] {
  const dir = versionDirFor(relPath);
  const metaFile = join(dir, "meta.json");
  if (!existsSync(metaFile)) return [];
  try {
    return JSON.parse(readFileSync(metaFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveVersionMeta(relPath: string, versions: VersionEntry[]): void {
  const dir = versionDirFor(relPath);
  mkdirSync(dir, { recursive: true });
  // BUG 43: atomic write (tmp + rename) — verhindert korrupte meta.json
  const metaPath = join(dir, "meta.json");
  const tmp = `${metaPath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(versions, null, 2), "utf-8");
  renameSync(tmp, metaPath);
}

/**
 * Speichert die aktuelle Version einer Datei vor einer Änderung.
 * (Liest die Datei vom Disk und speichert sie als Version)
 */
export function saveVersion(
  relPath: string,
  user: string,
  action: VersionEntry["action"],
  note?: string
): VersionEntry | null {
  const absPath = safeCorpusPath(relPath);
  if (!absPath || !existsSync(absPath)) return null;

  const content = readFileSync(absPath, "utf-8");
  return saveVersionContent(relPath, content, user, action, note);
}

/**
 * Speichert einen spezifischen Inhalt als neue Version.
 * (Wird nach Write aufgerufen um die NEUE Version zu speichern)
 */
export function saveVersionContent(
  relPath: string,
  content: string,
  user: string,
  action: VersionEntry["action"],
  note?: string
): VersionEntry | null {
  const versions = loadVersionMeta(relPath);
  const versionNum = versions.length + 1;
  const timestamp = new Date().toISOString();

  const dir = versionDirFor(relPath);
  mkdirSync(dir, { recursive: true });
  atomicWrite(join(dir, `${versionNum}.md`), content);

  const entry: VersionEntry = {
    version: versionNum,
    timestamp,
    user,
    size: content.length,
    action,
    note,
  };
  versions.push(entry);

  // Version-Cleanup: max MAX_VERSIONS behalten, älteste löschen.
  // Verhindert unendliches Wachstum (713K Dateien × 10 Edits = 7.1M Version-Dateien).
  if (versions.length > MAX_VERSIONS) {
    const toRemove = versions.slice(0, versions.length - MAX_VERSIONS);
    for (const old of toRemove) {
      try {
        unlinkSync(join(dir, `${old.version}.md`));
      } catch {
        /* schon weg */
      }
    }
    versions.splice(0, versions.length - MAX_VERSIONS);
  }

  saveVersionMeta(relPath, versions);

  return entry;
}

/**
 * Listet alle Versionen einer Datei auf.
 */
export function getVersions(relPath: string): VersionEntry[] {
  return loadVersionMeta(relPath);
}

/**
 * Liest eine spezifische Version einer Datei.
 */
export function getVersion(relPath: string, version: number): VersionDetail | null {
  const versions = loadVersionMeta(relPath);
  const entry = versions.find((v) => v.version === version);
  if (!entry) return null;

  const dir = versionDirFor(relPath);
  const file = join(dir, `${version}.md`);
  if (!existsSync(file)) return null;

  const content = readFileSync(file, "utf-8");
  const parsed = parseDoc(content);

  return { ...entry, content, frontmatter: parsed.frontmatter, body: parsed.body };
}

/**
 * Stellt eine spezifische Version einer Datei wieder her.
 */
export function restoreVersion(relPath: string, version: number, user: string): boolean {
  const detail = getVersion(relPath, version);
  if (!detail) return false;

  const absPath = safeCorpusPath(relPath);
  if (!absPath) return false;

  // Save current as new version first
  saveVersion(relPath, user, "restore", `Restored from v${version}`);

  // Write the old content back
  atomicWrite(absPath, detail.content);

  // RAW-SYNC: Pipeline importiert aus law-corpus/{dir}/. Ohne Sync bleibt
  // die DB auf der alten Version — der Anwalt sieht die restaurierte Fassung
  // im Dashboard, die KI zitiert aber noch die alte. (BUG 5, BUG 28)
  syncToRawCorpus(relPath, detail.content);

  auditLog({ action: "restore_version", path: relPath, user, details: { version } });
  return true;
}

// ── Diff ───────────────────────────────────────────────────────────────

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  oldLine?: number;
  newLine?: number;
  content: string;
}

/**
 * Einfacher Zeilen-Diff zwischen zwei Texten.
 */
function diffTexts(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // LCS-based diff — bei sehr großen Dateien (z.B. 10K+ Zeilen) würde
  // eine m×n Matrix ~800MB Speicher fressen. Begrenze auf 5000 Zeilen
  // pro Seite; darüber wird ein einfacher Zeilenvergleich gemacht.
  const MAX_LINES = 5000;
  const m = Math.min(oldLines.length, MAX_LINES);
  const n = Math.min(newLines.length, MAX_LINES);

  if (oldLines.length > MAX_LINES || newLines.length > MAX_LINES) {
    // Fallback: zeilenweiser Vergleich ohne LCS
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : undefined;
      const newLine = i < newLines.length ? newLines[i] : undefined;
      if (oldLine === newLine) {
        result.push({ type: "unchanged", oldLine: i + 1, newLine: i + 1, content: oldLine ?? "" });
      } else {
        if (oldLine !== undefined)
          result.push({ type: "removed", oldLine: i + 1, content: oldLine });
        if (newLine !== undefined) result.push({ type: "added", newLine: i + 1, content: newLine });
      }
    }
    return result;
  }

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  let i = m,
    j = n;
  const temp: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.unshift({ type: "unchanged", oldLine: i, newLine: j, content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.unshift({ type: "added", newLine: j, content: newLines[j - 1] });
      j--;
    } else if (i > 0) {
      temp.unshift({ type: "removed", oldLine: i, content: oldLines[i - 1] });
      i--;
    }
  }

  return temp;
}

/**
 * Diff zwischen zwei Versionen.
 */
export function diffVersions(relPath: string, v1: number, v2: number): DiffLine[] {
  const d1 = getVersion(relPath, v1);
  const d2 = getVersion(relPath, v2);
  if (!d1 || !d2) return [];
  return diffTexts(d1.content, d2.content);
}

/**
 * Diff zwischen aktueller Datei und einer Version.
 */
export function diffWithCurrent(relPath: string, version: number): DiffLine[] {
  const detail = getVersion(relPath, version);
  if (!detail) return [];

  const absPath = safeCorpusPath(relPath);
  if (!absPath || !existsSync(absPath)) return [];

  const current = readFileSync(absPath, "utf-8");
  return diffTexts(detail.content, current);
}

// ── Backup (legacy, wird durch Version-History ersetzt aber kompatibel gehalten) ─

// ── File Operations (Create / Delete) ──────────────────────────────────

/**
 * Erstellt eine neue Datei im Corpus.
 */
export function createFile(
  relPath: string,
  frontmatter: Record<string, unknown>,
  body: string,
  user: string
): { created: boolean; path: string; size: number } {
  const absPath = safeCorpusPath(relPath);
  if (!absPath) throw new Error("Invalid path");
  if (existsSync(absPath)) throw new Error("File already exists");

  const dir = dirname(absPath);
  mkdirSync(dir, { recursive: true });

  const content = serializeDoc(frontmatter, body);
  atomicWrite(absPath, content);

  // RAW-SYNC: Pipeline importiert aus law-corpus/{dir}/, nicht aus _normalized/.
  // Ohne diesen Sync kommt die neue Datei nie in die DB. (BUG 5, BUG 23)
  syncToRawCorpus(relPath, content);

  // Save initial version
  const versions: VersionEntry[] = [];
  const dir2 = versionDirFor(relPath);
  mkdirSync(dir2, { recursive: true });
  atomicWrite(join(dir2, "1.md"), content);
  versions.push({
    version: 1,
    timestamp: new Date().toISOString(),
    user,
    size: content.length,
    action: "create",
  });
  saveVersionMeta(relPath, versions);

  auditLog({ action: "create_file", path: relPath, user, details: { size: content.length } });

  return { created: true, path: relPath, size: content.length };
}

/**
 * Löscht eine Datei (mit Version-Snapshot).
 */
export function deleteFile(relPath: string, user: string): { deleted: boolean; path: string } {
  const absPath = safeCorpusPath(relPath);
  if (!absPath) throw new Error("Invalid path");
  if (!existsSync(absPath)) throw new Error("File not found");

  // Save version before delete
  saveVersion(relPath, user, "delete");

  unlinkSync(absPath);

  // RAW-SYNC: Pipeline importiert aus law-corpus/{dir}/. Wenn wir die
  // _normalized-Datei löschen, müssen wir auch die raw-Datei löschen,
  // sonst bleibt die gelöschte Norm für immer in der DB. (BUG 5, BUG 23)
  removeFromRawCorpus(relPath);

  // Remove .bak if exists
  const bakPath = absPath + ".bak";
  if (existsSync(bakPath)) unlinkSync(bakPath);

  // Remove flag
  deleteFlag(relPath, user);

  auditLog({ action: "delete_file", path: relPath, user });

  return { deleted: true, path: relPath };
}

/**
 * Löscht mehrere Dateien (Bulk).
 */
export function deleteFilesBulk(
  relPaths: string[],
  user: string
): { deleted: number; failed: number; errors: string[] } {
  let deleted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const p of relPaths) {
    try {
      deleteFile(p, user);
      deleted++;
    } catch (err) {
      failed++;
      errors.push(`${p}: ${(err as Error).message}`);
    }
  }

  auditLog({ action: "bulk_delete", paths: relPaths.length, user, details: { deleted, failed } });
  return { deleted, failed, errors };
}
