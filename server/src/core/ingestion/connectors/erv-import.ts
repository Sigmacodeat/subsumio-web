/**
 * ErvImportConnector — import ERV-Rückverkehr (Austria) from export files (Gap G).
 *
 * The österreichische elektronische Rechtsverkehr (ERV, §§ 89a ff GOG) has no
 * public REST API — Kanzleien receive Rückverkehr (gerichtliche Erledigungen,
 * Zustellungen, Ladungen) through their Übermittlungsstelle (webERV client,
 * ADVOKAT, etc.), which can export the messages as XML files. This connector
 * watches an export directory (same pattern as the German beA connector),
 * parses each XML tolerantly, and turns it into a brain page.
 *
 * The winning move over a plain document import: the connector computes the
 * ZUSTELLFIKTION deterministically. § 89d Abs 2 GOG (for deliveries under
 * § 89a Abs 2 GOG) — "Als Zustellungszeitpunkt … gilt jeweils der auf das
 * Einlangen in den elektronischen Verfügungsbereich des Empfängers folgende
 * Werktag, wobei Samstage nicht als Werktage gelten." (RIS, Fassung ab
 * 1.5.2012). That Zustelldatum is THE fristauslösende Ereignis; the page
 * carries both dates so the Frist-Engine and the deadline pipeline start
 * from the legally correct day.
 *
 * When the export carries no readable Einlangen date the Zustelldatum is
 * UNKNOWN — it is never derived from the import day. The page says so and
 * asks for the date to be entered by hand; deadlines are suggestions only.
 *
 * Setup:
 *   gbrain connector add erv-import --filters '{"watch_dir":"/imports/erv"}'
 *   gbrain connector sync erv-import
 *
 * Security note: every extracted value is attacker-controlled (opposing
 * counsel writes the Betreff). Frontmatter is serialized via js-yaml so no
 * value can break the YAML block. The GZ is validated structurally
 * (gz-validate.ts) and the result recorded — OCR/typo artifacts surface
 * instead of silently propagating into the Akt.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { dump as yamlDump } from "js-yaml";
import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";
import { zustellungERV } from "../../legal/frist-engine.ts";
import { validiereGZ } from "../../legal/gz-validate.ts";

interface ErvMessageItem extends ConnectorItem {
  filePath: string;
  messageId: string;
  gericht: string;
  geschaeftszahl: string;
  erledigungsart: string;
  /** ISO date the message arrived in the elektronischer Verfügungsbereich; null when the export has none. */
  einlangenDatum: string | null;
  /** ISO date of the Zustellfiktion (§ 89d Abs 2 GOG); null when the Einlangen date is unknown. */
  zustellDatum: string | null;
  betreff: string;
  body: string;
  gzGueltig: boolean;
  gzBefunde: string[];
  attachments: Array<{ name: string; size: number }>;
}

const MAX_TRACKED_FILES = 5000;

export class ErvImportConnector extends BaseConnector {
  private watchDir: string;
  private processedFiles: Set<string> = new Set();
  private parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false, // keep everything as strings — GZ/dates must not be coerced
    processEntities: true,
    htmlEntities: true,
  });

  constructor(config: ConnectorConfig = {}) {
    super("erv-import", config);
    this.watchDir =
      (config.filters?.watch_dir as string) ?? join(process.env.HOME ?? "/tmp", "Downloads", "erv");
  }

  getApiRateLimit() {
    // Local file processing — no API calls.
    return { capacity: 1000, windowMs: 1000 };
  }

  async refreshToken(): Promise<void> {
    // No authentication needed for local file processing.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const items: ErvMessageItem[] = [];

    if (!existsSync(this.watchDir)) {
      this._ctx?.logger.warn(`[${this.id}] Watch directory does not exist: ${this.watchDir}`);
      return { items: [] };
    }

    if (cursor) {
      try {
        const parsed = JSON.parse(cursor) as { processed: string[] };
        this.processedFiles = new Set(parsed.processed ?? []);
      } catch {
        /* ignore */
      }
    }

    const files = await readdir(this.watchDir);
    const xmlFiles = files.filter((f) => extname(f).toLowerCase() === ".xml");

    for (const file of xmlFiles) {
      const filePath = join(this.watchDir, file);
      if (this.processedFiles.has(filePath)) continue;
      try {
        const xml = await readFile(filePath, "utf-8");
        const message = this.parseErvXmlContent(xml, filePath);
        if (message) {
          items.push(message);
          this.processedFiles.add(filePath);
        }
      } catch (err) {
        this._ctx?.logger.warn(
          `[${this.id}] Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const tracked = Array.from(this.processedFiles);
    const bounded =
      tracked.length > MAX_TRACKED_FILES
        ? tracked.slice(tracked.length - MAX_TRACKED_FILES)
        : tracked;
    return { items, nextCursor: JSON.stringify({ processed: bounded }) };
  }

  /**
   * True when the XML carries tags only Austrian ERV-Rückverkehr uses
   * (Geschäftszahl, Erledigungsart, Einlangen). German beA exports name the
   * file number "Aktenzeichen" — the upload path uses this to route an ERV
   * export to this parser instead of the beA one.
   */
  isErvXml(xml: string): boolean {
    let doc: Record<string, unknown>;
    try {
      doc = this.parser.parse(xml) as Record<string, unknown>;
    } catch {
      return false;
    }
    const index = new Map<string, unknown>();
    indexTree(doc, index);
    return ERV_MARKER_TAGS.some((t) => index.has(t));
  }

  /**
   * Parse an ERV-Rückverkehr XML from an in-memory string. Public so the
   * web-api upload path can route a tenant-uploaded export through the same
   * parser. Returns null when the XML does not look like an ERV message.
   */
  parseErvXmlContent(xml: string, filePath: string): ErvMessageItem | null {
    const doc = this.parser.parse(xml) as Record<string, unknown>;
    const index = new Map<string, unknown>();
    indexTree(doc, index);

    const pick = (...tags: string[]): string => {
      for (const tag of tags) {
        const v = index.get(tag.toLowerCase());
        if (v !== undefined && v !== null && typeof v !== "object") {
          const s = String(v).trim();
          if (s) return s;
        }
      }
      return "";
    };

    // Detection gate: ERV-Rückverkehr carries at least a Geschäftszahl or an
    // Erledigungsart or a Gericht. Arbitrary XML does not.
    const gz = pick("geschaeftszahl", "aktenzeichen", "gz");
    const gericht = pick("gericht", "absender", "dienststelle");
    const erledigungsart = pick("erledigungsart", "dokumentart", "art", "schriftsatzart");
    if (!gz && !gericht && !erledigungsart) return null;

    const messageId =
      pick("nachrichtenid", "erledigungsid", "messageid") || basename(filePath, ".xml");
    const betreff = pick("betreff", "subject", "bezeichnung") || erledigungsart || "ERV-Erledigung";
    const body = pick("inhalt", "text", "anmerkung", "body");

    // Einlangen in den elektronischen Verfügungsbereich → Zustellfiktion.
    // Only tags that name the arrival; a generic "Datum" is usually the date
    // of the decision and must not start the Zustellfiktion.
    const einlangenDatum = parseEinlangenDatum(
      pick("einlangen", "einlangedatum", "eingangsdatum", "uebermittlungsdatum", "sendedatum")
    );
    // § 89d Abs 2 GOG: zugestellt am folgenden Werktag (Samstag, Sonntag und
    // gesetzliche Feiertage sind keine Werktage). Unknown arrival → unknown
    // Zustelldatum, never "today".
    const zustellDatum = einlangenDatum ? zustellungERV(einlangenDatum) : null;

    // GZ structural validation (Gap I) — surface OCR/typo artifacts.
    let gzGueltig = true;
    let gzBefunde: string[] = [];
    if (gz) {
      const v = validiereGZ(gz);
      gzGueltig = v.gueltig;
      gzBefunde = v.befunde.map((b) => `${b.schwere}: ${b.meldung}`);
    }

    const attachments: Array<{ name: string; size: number }> = [];
    for (const node of collectNodes(doc, ["anlage", "anhang", "attachment", "dokument"])) {
      if (!node || typeof node !== "object") continue;
      // Tag-Case variiert je Übermittlungsstelle (Dateiname vs dateiname) —
      // case-insensitive lookup.
      const att = new Map<string, unknown>();
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        att.set(k.toLowerCase(), v);
      }
      const name = String(
        att.get("name") ?? att.get("dateiname") ?? att.get("filename") ?? "Unbekannt"
      );
      const size = parseInt(String(att.get("groesse") ?? att.get("size") ?? "0"), 10) || 0;
      attachments.push({ name, size });
    }

    return {
      id: messageId,
      title: `ERV: ${betreff}`,
      modified_at: einlangenDatum ? `${einlangenDatum}T00:00:00.000Z` : new Date().toISOString(),
      content: body,
      content_type: "text/markdown",
      filePath,
      messageId,
      gericht: gericht || "Unbekannt",
      geschaeftszahl: gz,
      erledigungsart: erledigungsart || "Erledigung",
      einlangenDatum,
      zustellDatum,
      betreff,
      body,
      gzGueltig,
      gzBefunde,
      attachments,
    };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const msg = item as ErvMessageItem;

    // js-yaml quotes/escapes every value — attacker-controlled Betreff
    // cannot inject frontmatter keys.
    const frontmatter = yamlDump(
      {
        title: `ERV: ${msg.betreff}`,
        type: "erv_message",
        gericht: msg.gericht,
        geschaeftszahl: msg.geschaeftszahl,
        erledigungsart: msg.erledigungsart,
        einlangen_datum: msg.einlangenDatum,
        zustell_datum: msg.zustellDatum,
        zustellfiktion: "§ 89d Abs 2 GOG",
        ...(msg.zustellDatum ? {} : { zustelldatum_unbekannt: true, frist_nur_vorschlag: true }),
        gz_gueltig: msg.gzGueltig,
        gz_befunde: msg.gzBefunde,
        attachments: msg.attachments.map((a) => a.name),
        source_file: basename(msg.filePath),
        fristausloeser: true,
      },
      { lineWidth: -1, noRefs: true }
    ).trimEnd();

    const content = `---
${frontmatter}
---

# ${msg.betreff}

**Gericht:** ${msg.gericht}
**Geschäftszahl:** ${msg.geschaeftszahl || "—"}
**Erledigungsart:** ${msg.erledigungsart}
**Einlangen (elektr. Verfügungsbereich):** ${msg.einlangenDatum ?? "unbekannt"}
**Zustelldatum (§ 89d Abs 2 GOG):** ${msg.zustellDatum ? `${msg.zustellDatum} ← fristauslösendes Ereignis` : "unbekannt"}
${msg.zustellDatum ? "" : "\n> ⚠ Der Export enthält kein lesbares Einlangedatum. Das Zustelldatum muss manuell eingetragen werden; daraus berechnete Fristen sind nur Vorschläge.\n"}
${msg.gzBefunde.length > 0 ? `> ⚠ GZ-Prüfung: ${msg.gzBefunde.join("; ")}\n` : ""}
## Inhalt

${msg.body || "_(kein Textinhalt — siehe Anhänge)_"}

${msg.attachments.length > 0 ? `## Anhänge (${msg.attachments.length})\n${msg.attachments.map((a) => `- ${a.name} (${Math.round(a.size / 1024)} KB)`).join("\n")}` : ""}
`;

    const dateStr = msg.einlangenDatum ?? "undatiert";
    return {
      source_id: this.id,
      source_kind: "connector",
      source_uri: `file://${msg.filePath}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content,
      content_hash: this.hashContent(content),
      metadata: {
        slug: `legal/erv/${dateStr}-${slugifyId(msg.messageId)}`,
        title: `ERV: ${msg.betreff}`,
      },
    };
  }
}

/** Tags that only ERV-Rückverkehr carries (lower-case, as indexed). */
const ERV_MARKER_TAGS = ["geschaeftszahl", "erledigungsart", "einlangen", "einlangedatum"];

/**
 * The calendar day (Vienna) of the Einlangen value, or null when it is
 * missing or unreadable. Accepts ISO dates/timestamps and "TT.MM.JJJJ".
 */
export function parseEinlangenDatum(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let iso: string | null = null;
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s|$)/);
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (de) {
    iso = `${de[3]}-${de[2]!.padStart(2, "0")}-${de[1]!.padStart(2, "0")}`;
  } else if (isoDate) {
    iso = s;
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
    if (!hasZone) {
      iso = s.slice(0, 10); // local wall-clock time as exported
    } else {
      const t = new Date(s);
      if (isNaN(t.getTime())) return null;
      iso = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Vienna",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(t);
    }
  }
  if (!iso) return null;
  const check = new Date(`${iso}T00:00:00Z`);
  return !isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Walk the parsed XML tree, recording the FIRST value seen per tag name. */
function indexTree(node: unknown, index: Map<string, unknown>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) indexTree(child, index);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (!index.has(lower)) index.set(lower, value);
    indexTree(value, index);
  }
}

/** Collect every node in the tree whose tag matches one of `tags`. */
function collectNodes(node: unknown, tags: string[]): unknown[] {
  const out: unknown[] = [];
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const child of n) walk(child);
      return;
    }
    for (const [key, value] of Object.entries(n as Record<string, unknown>)) {
      if (wanted.has(key.toLowerCase())) {
        if (Array.isArray(value)) out.push(...value);
        else out.push(value);
      }
      walk(value);
    }
  };
  walk(node);
  return out;
}

function slugifyId(id: string): string {
  return (
    id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "msg"
  );
}
