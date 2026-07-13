/**
 * LAB-DACH v3 — Agent Tools
 *
 * Tools available to the agent during task execution.
 * No bash, no network — only structured legal research tools.
 *
 * Tools:
 *   search_law       — Search statute corpus by query
 *   search_judikatur — Search court decisions (AT: OGH, DE: BGH)
 *   read_law         — Read a specific law file by slug
 *   read_document    — Read a case file from the sandbox
 *   write_deliverable — Write an output file (memo, Schriftsatz, etc.)
 *   list_laws        — List available law files for a jurisdiction
 *   calculate_frist  — Calculate a legal deadline using frist-engine
 */

import type { TaskSandbox } from "./sandbox.ts";
import {
  readSandboxFile,
  writeDeliverable,
  listSandboxFiles,
  validateSandboxPath,
} from "./sandbox.ts";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import {
  berechneFristAuto,
  resolveFristArt,
  FRISTEN_REGISTRY,
} from "../../core/legal/frist-engine.ts";

// ── Tool Types ────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolContext {
  sandbox: TaskSandbox;
  /** Law corpus root directory (e.g. /Users/msc/subsumio-web/law-corpus) */
  corpusRoot: string;
  /** Jurisdiction for this task */
  jurisdiction: "DE" | "AT" | "CH" | "EU";
  /** Search function (injected — uses hybrid search in production) */
  searchFn?: (query: string, opts: SearchOpts) => Promise<SearchResult[]>;
  /** Frist calculation function (injected — uses frist-engine in production) */
  fristFn?: (fristKey: string, startDate: string) => FristResult | null;
}

export interface SearchOpts {
  jurisdiction?: string;
  limit?: number;
  source?: string;
}

export interface SearchResult {
  slug: string;
  title: string;
  text: string;
  score: number;
  law?: string;
  paragraph?: string;
}

export interface FristResult {
  frist_key: string;
  fristbeginn: string;
  fristende: string;
  vorfrist: string;
  notfrist: boolean;
  tage: number;
  regime: string;
  hemmung: boolean;
  hinweise: string[];
  rechtsgrundlage: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ── Tool Definitions ──────────────────────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_law",
    description:
      "Search the statute corpus for legal provisions matching a query. Returns relevant law chunks with § numbers and text.",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "Natural language search query (e.g. 'Welche Pflichten hat der Verkäufer?')",
        required: true,
      },
      {
        name: "limit",
        type: "number",
        description: "Maximum number of results (default 8, max 20)",
        required: false,
      },
    ],
  },
  {
    name: "search_judikatur",
    description: "Search court decisions (OGH for AT, BGH for DE) for relevant case law.",
    parameters: [
      { name: "query", type: "string", description: "Search query for case law", required: true },
      {
        name: "limit",
        type: "number",
        description: "Maximum number of results (default 5, max 10)",
        required: false,
      },
    ],
  },
  {
    name: "read_law",
    description: "Read the full text of a specific law file by its slug (e.g. 'law/de/bgb').",
    parameters: [
      {
        name: "slug",
        type: "string",
        description: "Law file slug (e.g. 'law/de/bgb', 'law/at/abgb')",
        required: true,
      },
    ],
  },
  {
    name: "read_document",
    description: "Read a case file from the sandbox documents directory.",
    parameters: [
      {
        name: "filename",
        type: "string",
        description: "Filename in the documents directory (e.g. 'klage.txt')",
        required: true,
      },
    ],
  },
  {
    name: "write_deliverable",
    description:
      "Write a deliverable file to the output directory (memo, Schriftsatz, report). Max 1MB per file.",
    parameters: [
      {
        name: "filename",
        type: "string",
        description: "Output filename (e.g. 'memo.md', 'schriftsatz.txt')",
        required: true,
      },
      { name: "content", type: "string", description: "File content", required: true },
    ],
  },
  {
    name: "list_laws",
    description: "List all available law files for a jurisdiction.",
    parameters: [
      {
        name: "jurisdiction",
        type: "string",
        description: "Jurisdiction code",
        required: true,
        enum: ["DE", "AT", "CH", "EU"],
      },
    ],
  },
  {
    name: "calculate_frist",
    description:
      "Calculate a legal deadline using the deterministic frist-engine. Requires a frist key and start date.",
    parameters: [
      {
        name: "frist_key",
        type: "string",
        description: "Frist type key (e.g. 'berufung', 'klagebeantwortung', 'revision')",
        required: true,
      },
      {
        name: "start_date",
        type: "string",
        description: "Start date (ISO format: YYYY-MM-DD, typically the Zustellungsdatum)",
        required: true,
      },
    ],
  },
];

// ── Tool Implementations ──────────────────────────────────────────────

/**
 * search_law: Search statute corpus.
 * Uses injected searchFn or falls back to file-based search.
 */
export async function toolSearchLaw(
  ctx: ToolContext,
  args: { query: string; limit?: number }
): Promise<ToolResult> {
  const limit = Math.min(args.limit ?? 8, 20);
  const query = args.query?.trim();
  if (!query) {
    return { success: false, error: "query must not be empty" };
  }

  if (ctx.searchFn) {
    try {
      const results = await ctx.searchFn(query, {
        jurisdiction: ctx.jurisdiction.toLowerCase(),
        limit,
      });
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: `Search failed: ${(err as Error).message}` };
    }
  }

  // Fallback: simple file-based search in corpus directory
  const results = fileBasedSearch(ctx.corpusRoot, ctx.jurisdiction, query, limit);
  return { success: true, data: results };
}

/**
 * search_judikatur: Search court decisions.
 */
export async function toolSearchJudikatur(
  ctx: ToolContext,
  args: { query: string; limit?: number }
): Promise<ToolResult> {
  const limit = Math.min(args.limit ?? 5, 10);
  const query = args.query?.trim();
  if (!query) {
    return { success: false, error: "query must not be empty" };
  }

  if (ctx.searchFn) {
    try {
      const results = await ctx.searchFn(query, {
        jurisdiction: ctx.jurisdiction.toLowerCase(),
        source: ctx.jurisdiction === "AT" ? "law-at-judikatur" : "law-de-judikatur",
        limit,
      });
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: `Judikatur search failed: ${(err as Error).message}` };
    }
  }

  // No judikatur corpus in fallback mode
  return { success: true, data: [] };
}

/**
 * read_law: Read a specific law file by slug.
 */
export async function toolReadLaw(ctx: ToolContext, args: { slug: string }): Promise<ToolResult> {
  const slug = args.slug?.trim();
  if (!slug) {
    return { success: false, error: "slug must not be empty" };
  }

  // Validate slug format (prevent path traversal)
  if (!/^law\/[a-z]{2}\/[a-z0-9-]+$/i.test(slug)) {
    return { success: false, error: `Invalid slug format: ${slug}` };
  }

  const relativeSlug = slug.replace(/^law\//, "");
  const filePath = join(ctx.corpusRoot, relativeSlug + ".md");
  // Double-check no traversal
  const normalized = validateSandboxPath(ctx.corpusRoot, relativeSlug + ".md");
  if (!normalized || !filePath.startsWith(ctx.corpusRoot)) {
    return { success: false, error: "Path traversal detected" };
  }

  if (!existsSync(filePath)) {
    return { success: false, error: `Law file not found: ${slug} (looked at ${filePath})` };
  }

  const stat = statSync(filePath);
  if (stat.size > 1024 * 1024) {
    // 1MB limit
    return { success: false, error: `Law file too large: ${slug} (${stat.size} bytes)` };
  }

  const content = readFileSync(filePath, "utf-8");
  return { success: true, data: { slug, text: content, size: content.length } };
}

/**
 * read_document: Read a case file from the sandbox.
 */
export async function toolReadDocument(
  ctx: ToolContext,
  args: { filename: string }
): Promise<ToolResult> {
  const filename = args.filename?.trim();
  if (!filename) {
    return { success: false, error: "filename must not be empty" };
  }

  try {
    const content = readSandboxFile(ctx.sandbox, join("documents", filename));
    return { success: true, data: { filename, text: content, size: content.length } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * write_deliverable: Write an output file.
 */
export async function toolWriteDeliverable(
  ctx: ToolContext,
  args: { filename: string; content: string }
): Promise<ToolResult> {
  const filename = args.filename?.trim();
  if (!filename) {
    return { success: false, error: "filename must not be empty" };
  }
  if (!args.content) {
    return { success: false, error: "content must not be empty" };
  }

  try {
    writeDeliverable(ctx.sandbox, filename, args.content);
    return { success: true, data: { filename, size: args.content.length } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * list_laws: List available law files for a jurisdiction.
 */
export async function toolListLaws(
  ctx: ToolContext,
  args: { jurisdiction: string }
): Promise<ToolResult> {
  const jurisdiction = args.jurisdiction?.toUpperCase();
  if (!jurisdiction || !["DE", "AT", "CH", "EU"].includes(jurisdiction)) {
    return { success: false, error: "jurisdiction must be DE, AT, CH, or EU" };
  }

  const dirPath = join(ctx.corpusRoot, jurisdiction.toLowerCase());
  if (!existsSync(dirPath)) {
    return { success: true, data: [] };
  }

  const files = readdirSync(dirPath)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = `law/${jurisdiction.toLowerCase()}/${f.replace(/\.md$/, "")}`;
      const stat = statSync(join(dirPath, f));
      return { slug, filename: f, size: stat.size };
    });

  return { success: true, data: files };
}

/**
 * calculate_frist: Calculate a legal deadline.
 */
export async function toolCalculateFrist(
  ctx: ToolContext,
  args: { frist_key: string; start_date: string }
): Promise<ToolResult> {
  const fristKey = args.frist_key?.trim();
  const startDate = args.start_date?.trim();
  if (!fristKey) {
    return { success: false, error: "frist_key must not be empty" };
  }
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { success: false, error: "start_date must be in YYYY-MM-DD format" };
  }

  if (ctx.fristFn) {
    const result = ctx.fristFn(fristKey, startDate);
    if (!result) {
      return { success: false, error: `Unknown frist key: ${fristKey}` };
    }
    return { success: true, data: result };
  }

  // Offline fallback: use the deterministic frist-engine
  const art = resolveFristArt(fristKey);
  if (!art) {
    return {
      success: false,
      error: `Unknown frist key: ${fristKey} (known: ${FRISTEN_REGISTRY.map((f) => f.key).join(", ")})`,
    };
  }

  try {
    const result = berechneFristAuto(fristKey, startDate);
    return {
      success: true,
      data: {
        frist_key: fristKey,
        fristbeginn: result.fristbeginn,
        fristende: result.fristende,
        vorfrist: result.vorfrist,
        notfrist: result.art.notfrist,
        tage: result.kalendertage,
        regime: result.art.regime,
        hemmung: result.art.gehemmtInVhfz,
        hinweise: result.hinweise,
        rechtsgrundlage: result.art.rechtsgrundlage,
      } satisfies FristResult,
    };
  } catch (err) {
    return { success: false, error: `Frist engine error: ${(err as Error).message}` };
  }
}

// ── Tool Dispatcher ───────────────────────────────────────────────────

/**
 * Dispatch a tool call by name.
 */
export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  switch (toolName) {
    case "search_law":
      return toolSearchLaw(ctx, args as { query: string; limit?: number });
    case "search_judikatur":
      return toolSearchJudikatur(ctx, args as { query: string; limit?: number });
    case "read_law":
      return toolReadLaw(ctx, args as { slug: string });
    case "read_document":
      return toolReadDocument(ctx, args as { filename: string });
    case "write_deliverable":
      return toolWriteDeliverable(ctx, args as { filename: string; content: string });
    case "list_laws":
      return toolListLaws(ctx, args as { jurisdiction: string });
    case "calculate_frist":
      return toolCalculateFrist(ctx, args as { frist_key: string; start_date: string });
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Simple file-based search fallback (when no engine is available).
 * Searches law files by keyword matching.
 */
function fileBasedSearch(
  corpusRoot: string,
  jurisdiction: string,
  query: string,
  limit: number
): SearchResult[] {
  const dirPath = join(corpusRoot, jurisdiction.toLowerCase());
  if (!existsSync(dirPath)) return [];

  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter((t) => t.length > 2);
  const files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));

  const results: SearchResult[] = [];

  for (const file of files) {
    const filePath = join(dirPath, file);
    const content = readFileSync(filePath, "utf-8");
    const contentLower = content.toLowerCase();

    // Score by term frequency
    let score = 0;
    for (const term of terms) {
      const matches = contentLower.split(term).length - 1;
      score += matches;
    }

    if (score > 0) {
      const slug = `law/${jurisdiction.toLowerCase()}/${file.replace(/\.md$/, "")}`;
      // Extract a snippet around the best match
      const firstMatch = terms
        .map((t) => contentLower.indexOf(t))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0];

      const snippetStart = Math.max(0, firstMatch - 200);
      const snippet = content.slice(snippetStart, snippetStart + 500);

      results.push({
        slug,
        title: file.replace(/\.md$/, "").toUpperCase(),
        text: snippet,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Get tool definitions formatted for LLM tool_use API.
 */
export function getToolDefinitionsForLLM(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}
