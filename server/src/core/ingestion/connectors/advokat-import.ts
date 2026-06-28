/**
 * ADVOKAT local bridge.
 *
 * ADVOKAT does not publish a generally available REST API contract. This
 * connector therefore watches a read-only export/document mirror mounted from
 * the ADVOKAT Windows environment (SMB, scheduled export or partner bridge).
 * The first directory segment is treated as the matter reference.
 *
 * Setup:
 *   gbrain connector add advokat-import \
 *     --filters '{"watch_dir":"/imports/advokat"}' --poll-interval 60000
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { dump as yamlDump } from "js-yaml";
import { readSafeZipEntries, type ArchiveBudget } from "../../archive-upload.ts";
import {
  extractDocumentText,
  isDocumentFilePath,
  synthesizeDocumentMarkdown,
} from "../../extract-document.ts";
import { isImageFilePath } from "../../sync.ts";
import { ocrImageBuffer } from "../../import-file.ts";
import { inspectUploadBytes } from "../../upload-security.ts";
import { persistFileBuffer } from "../../file-store.ts";
import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";

const TEXT_EXTS = new Set([".md", ".txt", ".html", ".htm", ".json", ".xml"]);
const MAX_FILES_PER_SCAN = 20_000;
const MAX_CURSOR_FILES = 20_000;

interface AdvokatItem extends ConnectorItem {
  filePath: string;
  relativePath: string;
  matterReference: string;
  extractedContent: string;
  warnings: string[];
}

export class AdvokatImportConnector extends BaseConnector {
  private readonly watchDir: string;
  private readonly targetSourceId: string;

  constructor(config: ConnectorConfig = {}) {
    super("advokat-import", config);
    this.watchDir = String(config.filters?.watch_dir ?? "");
    this.targetSourceId = String(
      config.filters?.target_source_id ?? process.env.ADVOKAT_TARGET_SOURCE_ID ?? "default"
    );
    if (!this.watchDir) {
      throw new Error("advokat-import requires filters.watch_dir");
    }
  }

  getApiRateLimit() {
    return { capacity: 1_000, windowMs: 1_000 };
  }

  async refreshToken(): Promise<void> {
    // Local read-only bridge; no credentials are stored in Subsumio.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    if (!existsSync(this.watchDir)) {
      this._ctx?.logger.warn(`[${this.id}] ADVOKAT mirror does not exist: ${this.watchDir}`);
      return { items: [], nextCursor: cursor };
    }

    const previous = parseCursor(cursor);
    const next: Record<string, string> = { ...previous };
    const items: AdvokatItem[] = [];
    const files = await walkFiles(this.watchDir);
    const batchSize = Math.max(1, Math.min(this._config.batch_size ?? 250, 1_000));

    for (const filePath of files) {
      const relativePath = relative(this.watchDir, filePath).split(sep).join("/");
      if (!isSupportedAdvokatFile(relativePath)) continue;
      const info = await stat(filePath);
      const fingerprint = `${info.mtimeMs}:${info.size}`;
      if (previous[relativePath] === fingerprint) continue;
      if (items.length >= batchSize) break;
      next[relativePath] = fingerprint;

      try {
        const warnings: string[] = [];
        const data = await readFile(filePath);
        const security = await inspectUploadBytes(relativePath, data);
        if (!security.ok) {
          this._ctx?.logger.warn(`[${this.id}] ${relativePath} rejected: ${security.code}`);
          continue;
        }
        const extractedContent = await this.extractFile(data, relativePath, warnings);
        if (!extractedContent.trim()) continue;
        items.push({
          id: createHash("sha256").update(`${relativePath}:${fingerprint}`).digest("hex"),
          title: basename(relativePath, extname(relativePath)),
          modified_at: new Date(info.mtimeMs).toISOString(),
          content: extractedContent,
          content_type: "text/markdown",
          filePath,
          relativePath,
          matterReference: matterFromPath(relativePath),
          extractedContent,
          warnings,
        });
      } catch (error) {
        this._ctx?.logger.warn(
          `[${this.id}] ${relativePath} skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const bounded = Object.fromEntries(Object.entries(next).slice(-MAX_CURSOR_FILES));
    return { items, nextCursor: JSON.stringify({ files: bounded }) };
  }

  private async extractFile(
    data: Buffer,
    relativePath: string,
    warnings: string[],
    depth = 0,
    budget?: ArchiveBudget
  ): Promise<string> {
    const ext = extname(relativePath).toLowerCase();
    if (ext === ".zip") {
      const archive = await readSafeZipEntries(data, { depth, budget });
      const sections: string[] = [];
      for (const entry of archive.entries) {
        if (!isSupportedAdvokatFile(entry.name)) {
          warnings.push(`ZIP entry skipped: ${entry.name}`);
          continue;
        }
        try {
          const content = await this.extractFile(
            entry.data,
            entry.name,
            warnings,
            depth + 1,
            archive.budget
          );
          if (content.trim()) sections.push(`## Archivdatei: ${entry.name}\n\n${content}`);
        } catch (error) {
          warnings.push(
            `ZIP entry ${entry.name} skipped: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return sections.join("\n\n");
    }
    if (isDocumentFilePath(relativePath)) {
      const extracted = await extractDocumentText(data, ext, { filename: basename(relativePath) });
      warnings.push(...extracted.warnings);
      return stripFrontmatter(synthesizeDocumentMarkdown(relativePath, extracted));
    }
    if (isImageFilePath(relativePath)) {
      if (!this._ctx?.engine) {
        warnings.push(`Image OCR deferred: ${relativePath}`);
        return `[Bilddatei: ${relativePath}]`;
      }
      const result = await ocrImageBuffer(this._ctx.engine, data, ext);
      return result.text || `[Bilddatei ohne erkannten Text: ${relativePath}]`;
    }
    if (TEXT_EXTS.has(ext)) return data.toString("utf8");
    return "";
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const doc = item as AdvokatItem;
    const frontmatter = yamlDump(
      {
        title: doc.title,
        type: "advokat_document",
        matter_reference: doc.matterReference,
        source_file: doc.relativePath,
        source_system: "ADVOKAT",
        modified_at: doc.modified_at,
        extraction_warnings: doc.warnings,
      },
      { lineWidth: -1, noRefs: true }
    ).trimEnd();
    const content = `---\n${frontmatter}\n---\n\n${doc.extractedContent}\n`;
    const slug = `legal/advokat/${slugPart(doc.matterReference)}/${slugPart(doc.relativePath)}`;
    if (this._ctx?.engine) {
      const original = await readFile(doc.filePath);
      await persistFileBuffer({
        data: original,
        filename: basename(doc.relativePath),
        pageSlug: slug,
        sourceId: this.targetSourceId,
        zone: "clean",
      });
    }
    return {
      source_id: this.id,
      source_kind: "connector",
      source_uri: `file://${doc.filePath}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content,
      content_hash: this.hashContent(content),
      metadata: {
        slug,
        title: doc.title,
        matter_reference: doc.matterReference,
        target_source_id: this.targetSourceId,
      },
    };
  }
}

function parseCursor(cursor?: string): Record<string, string> {
  if (!cursor) return {};
  try {
    return (JSON.parse(cursor) as { files?: Record<string, string> }).files ?? {};
  } catch {
    return {};
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (dir: string, depth: number) => {
    if (depth > 12 || files.length >= MAX_FILES_PER_SCAN) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await visit(path, depth + 1);
      else if (info.isFile()) files.push(path);
      if (files.length >= MAX_FILES_PER_SCAN) return;
    }
  };
  await visit(root, 0);
  return files.sort();
}

function isSupportedAdvokatFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === ".zip" || TEXT_EXTS.has(ext) || isDocumentFilePath(path) || isImageFilePath(path);
}

function matterFromPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : "nicht-zugeordnet";
}

function slugPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "dokument"
  );
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
}
