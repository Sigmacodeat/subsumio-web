/**
 * BeaImportConnector — import electronic legal correspondence from beA (Germany).
 *
 * beA (elektronischer Rechtsverkehr) does not offer a public REST API.
 * This connector processes XML export files downloaded from the beA web interface.
 *
 * Setup:
 *   gbrain connector add bea-import --watch-dir ~/Downloads/bea
 *   gbrain connector sync bea-import
 *
 * The connector monitors a directory for new .xml files, parses them with a
 * real XML parser (namespaces, CDATA, entities), and creates brain pages with
 * the message content, sender, recipient, subject, and attachments.
 *
 * Security note: every value extracted from the XML is attacker-controlled
 * (opposing counsel writes the subject line). Frontmatter is serialized via
 * js-yaml so no value can break out of the YAML block.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { dump as yamlDump } from "js-yaml";
import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";

interface BeaMessageItem extends ConnectorItem {
  filePath: string;
  messageId: string;
  sender: string;
  recipient: string;
  subject: string;
  sentDate: string;
  body: string;
  attachments: Array<{ name: string; size: number }>;
  caseReference?: string;
}

/** Cap for the processed-files cursor so it can't grow unboundedly. */
const MAX_TRACKED_FILES = 5000;

export class BeaImportConnector extends BaseConnector {
  private watchDir: string;
  private processedFiles: Set<string> = new Set();
  private parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false, // keep everything as strings — dates/ids must not be coerced
    processEntities: true,
    htmlEntities: true, // beA exports use numeric entities (&#252; = ü)
  });

  constructor(config: ConnectorConfig = {}) {
    super("bea-import", config);
    this.watchDir =
      (config.filters?.watch_dir as string) ?? join(process.env.HOME ?? "/tmp", "Downloads", "bea");
  }

  getApiRateLimit() {
    // Local file processing — no API calls.
    return { capacity: 1000, windowMs: 1000 };
  }

  async refreshToken(): Promise<void> {
    // No authentication needed for local file processing.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const items: BeaMessageItem[] = [];

    if (!existsSync(this.watchDir)) {
      this._ctx?.logger.warn(`[${this.id}] Watch directory does not exist: ${this.watchDir}`);
      return { items: [] };
    }

    // Load processed files from cursor (persisted state)
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
        const message = await this.parseBeaXml(filePath);
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

    // Keep the cursor bounded: oldest entries fall out first. A re-import of
    // a >5000-files-old file is deduped downstream by content_hash anyway.
    const tracked = Array.from(this.processedFiles);
    const bounded =
      tracked.length > MAX_TRACKED_FILES
        ? tracked.slice(tracked.length - MAX_TRACKED_FILES)
        : tracked;
    const nextCursor = JSON.stringify({ processed: bounded });
    return { items, nextCursor };
  }

  private async parseBeaXml(filePath: string): Promise<BeaMessageItem | null> {
    const xml = await readFile(filePath, "utf-8");
    return this.parseBeaXmlContent(xml, filePath);
  }

  /**
   * Parse a beA export XML from an in-memory string. Public so the web-api
   * upload path can route a tenant-uploaded beA export through the same
   * parser (the directory-watcher sync is install-global; SaaS tenants
   * import via dashboard upload instead). Returns null when the XML does
   * not look like a beA message (no beA-typical tag present) — callers then
   * fall back to generic document import.
   */
  parseBeaXmlContent(xml: string, filePath: string): BeaMessageItem | null {
    const doc = this.parser.parse(xml) as Record<string, unknown>;

    // beA export structures vary by client version — walk the whole tree and
    // pick the first occurrence of each known tag (German + English aliases).
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

    // Detection gate: a beA export carries at least one of these tags with a
    // value. Arbitrary XML (sitemaps, exports from other tools) does not —
    // those must NOT be mangled into a pseudo-beA page.
    const rawMessageId = pick("nachrichtenID", "messageId", "nachrichtenId");
    const rawSender = pick("absender", "sender", "von");
    const rawSubject = pick("betreff", "subject");
    if (!rawMessageId && !rawSender && !rawSubject) return null;

    const messageId = rawMessageId || basename(filePath, ".xml");
    const sender = rawSender || "Unbekannt";
    const recipient = pick("empfaenger", "recipient", "an") || "Unbekannt";
    const subject = rawSubject || "Kein Betreff";
    const rawDate = pick("sendeDatum", "sendedatum", "date", "datum");
    const body = pick("inhalt", "body", "text", "nachrichtentext");
    const caseReference = pick("aktenzeichen", "caseNumber") || undefined;

    const parsedDate = rawDate ? new Date(rawDate) : new Date();
    const sentDate = isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString();

    // Attachments: collect every <anlage>/<attachment> node in the tree.
    const attachments: Array<{ name: string; size: number }> = [];
    for (const node of collectNodes(doc, ["anlage", "attachment", "anhang"])) {
      if (!node || typeof node !== "object") continue;
      const att = node as Record<string, unknown>;
      const name = String(att.name ?? att.dateiname ?? att.filename ?? "Unbekannt");
      const size = parseInt(String(att.groesse ?? att.size ?? "0"), 10) || 0;
      attachments.push({ name, size });
    }

    return {
      id: messageId,
      title: `beA: ${subject}`,
      modified_at: sentDate,
      content: body,
      content_type: "text/markdown",
      filePath,
      messageId,
      sender,
      recipient,
      subject,
      sentDate,
      body,
      attachments,
      caseReference,
    };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const msg = item as BeaMessageItem;
    const dateStr = msg.sentDate.split("T")[0];

    // js-yaml quotes/escapes every value — attacker-controlled subjects
    // (colons, newlines, leading dashes) cannot inject frontmatter keys.
    const frontmatter = yamlDump(
      {
        title: `beA: ${msg.subject}`,
        type: "bea_message",
        sender: msg.sender,
        recipient: msg.recipient,
        sent_date: msg.sentDate,
        subject: msg.subject,
        case_reference: msg.caseReference ?? "",
        attachments: msg.attachments.map((a) => a.name),
        source_file: basename(msg.filePath),
      },
      { lineWidth: -1, noRefs: true }
    ).trimEnd();

    const content = `---
${frontmatter}
---

# ${msg.subject}

**Von:** ${msg.sender}
**An:** ${msg.recipient}
**Datum:** ${msg.sentDate}
**Aktenzeichen:** ${msg.caseReference || "—"}

## Nachricht

${msg.body}

${msg.attachments.length > 0 ? `## Anhänge (${msg.attachments.length})\n${msg.attachments.map((a) => `- ${a.name} (${Math.round(a.size / 1024)} KB)`).join("\n")}` : ""}
`;

    return {
      source_id: this.id,
      source_kind: "connector",
      source_uri: `file://${msg.filePath}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content,
      content_hash: this.hashContent(content),
      metadata: {
        slug: `legal/bea/${dateStr}-${slugifyId(msg.messageId)}`,
        title: `beA: ${msg.subject}`,
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

/** Message IDs come from external XML — keep slugs filesystem/URL-safe. */
function slugifyId(id: string): string {
  return (
    id
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "message"
  );
}
