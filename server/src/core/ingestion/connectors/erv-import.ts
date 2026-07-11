/**
 * ErvImportConnector — import ERV-Rückverkehr (Austria) from export files (Gap G).
 *
 * The österreichische elektronische Rechtsverkehr (ERV, § 89a ff GOG) has no
 * public REST API — Kanzleien receive Rückverkehr (gerichtliche Erledigungen,
 * Zustellungen, Ladungen) through their Übermittlungsstelle (webERV client,
 * ADVOKAT, etc.), which can export the messages as XML files. This connector
 * watches an export directory (same pattern as the German beA connector),
 * parses each XML tolerantly, and turns it into a brain page.
 *
 * The winning move over a plain document import: the connector computes the
 * ZUSTELLFIKTION deterministically. § 89a Abs 2 GOG — an ERV delivery counts
 * as zugestellt on the Werktag following its arrival in the elektronischer
 * Verfügungsbereich (Saturday is not a Werktag). That Zustelldatum is THE
 * fristauslösende Ereignis; the page carries both dates so the Frist-Engine
 * and the deadline pipeline start from the legally correct day.
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
  /** ISO date the message arrived in the elektronischer Verfügungsbereich. */
  einlangenDatum: string;
  /** ISO date of the Zustellfiktion (§ 89a Abs 2 GOG). */
  zustellDatum: string;
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
    const rawEinlangen = pick(
      "einlangen",
      "eingangsdatum",
      "uebermittlungsdatum",
      "datum",
      "sendedatum"
    );
    let einlangenDatum: string;
    const parsedDate = rawEinlangen ? new Date(rawEinlangen) : new Date();
    einlangenDatum = isNaN(parsedDate.getTime())
      ? new Date().toISOString().slice(0, 10)
      : parsedDate.toISOString().slice(0, 10);
    // § 89a Abs 2 GOG: zugestellt am folgenden Werktag (Samstag zählt nicht).
    const zustellDatum = zustellungERV(einlangenDatum);

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
      modified_at: `${einlangenDatum}T00:00:00.000Z`,
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
        zustellfiktion: "§ 89a Abs 2 GOG",
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
**Einlangen (elektr. Verfügungsbereich):** ${msg.einlangenDatum}
**Zustelldatum (§ 89a Abs 2 GOG):** ${msg.zustellDatum} ← fristauslösendes Ereignis

${msg.gzBefunde.length > 0 ? `> ⚠ GZ-Prüfung: ${msg.gzBefunde.join("; ")}\n` : ""}
## Inhalt

${msg.body || "_(kein Textinhalt — siehe Anhänge)_"}

${msg.attachments.length > 0 ? `## Anhänge (${msg.attachments.length})\n${msg.attachments.map((a) => `- ${a.name} (${Math.round(a.size / 1024)} KB)`).join("\n")}` : ""}
`;

    const dateStr = msg.einlangenDatum;
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
