/**
 * Bulk import split statute pages into the Brain engine.
 *
 * Reads law-corpus-split/{de,at,ch}/ and POSTs each .md as a page.
 * Idempotent: 409 Conflict = already exists = treated as success.
 * Includes exponential-backoff retry for transient network errors.
 *
 * Prerequisites:
 *   1. Run split-statutes.ts first to populate law-corpus-split/
 *   2. Engine must be running: gbrain serve --http --port 3001
 *   3. SUBSUMIO_WEB_API_KEY or --key must be set
 *
 * Usage on engine host (e.g. Hetzner prod):
 *   bun server/scripts/import-statutes.ts \
 *     [--engine http://localhost:3001] \
 *     [--key API_KEY] \
 *     [--brain BRAIN_ID] \
 *     [--source law-de|law-at|law-all] \
 *     [--jur de|at|ch] \
 *     [--dry-run] \
 *     [--concurrency 10]
 */

import { readFileSync, readdirSync } from "node:fs";

const ENGINE =
  getArg("--engine") ??
  process.env.SUBSUMIO_API_URL ??
  process.env.SIGMABRAIN_API_URL ?? // legacy fallback
  process.env.GBRAIN_API_URL ??
  "http://localhost:3001";

const API_KEY =
  getArg("--key") ??
  process.env.SUBSUMIO_WEB_API_KEY ??
  process.env.SIGMABRAIN_WEB_API_KEY ?? // legacy fallback
  process.env.GBRAIN_WEB_API_KEY ??
  "";

const BRAIN = getArg("--brain") ?? process.env.IMPORT_BRAIN_ID ?? "";

const SOURCE = getArg("--source") ?? "law-all";

const JUR_FILTER = getArg("--jur");

const DRY_RUN = process.argv.includes("--dry-run");

const CONCURRENCY = Number(getArg("--concurrency") ?? "10");

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

// ── CLI helpers ───────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

// ── Frontmatter parser ────────────────────────────────────────────────

function parseFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("---", 3);
  if (end === -1) return {};
  const raw = text.slice(3, end).trim();
  const fm: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].replace(/^"|"$/g, "").trim();
  }
  return fm;
}

// ── Retry helper ──────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const wait = RETRY_BASE_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`${label} failed after ${retries + 1} attempts: ${String(lastErr)}`);
}

// ── Import a single page ──────────────────────────────────────────────

interface ImportResult {
  ok: boolean;
  slug: string;
  existing?: boolean;
  error?: string;
}

async function importPage(filePath: string): Promise<ImportResult> {
  const text = readFileSync(filePath, "utf8");
  const fm = parseFrontmatter(text);

  const abbr = fm.abbreviation || "unknown";
  const jur = fm.jurisdiction || "unknown";
  const para = fm.paragraph || "";

  // Build a deterministic, URL-safe slug using forward slashes (not path.join!)
  const slug =
    fm.slug ||
    `law/${jur}/${abbr.toLowerCase()}/${para.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;

  const title = fm.title || `${abbr} ${para}`.trim();

  // Extract body (everything after frontmatter)
  const fmEnd = text.indexOf("---", 3);
  const body = fmEnd !== -1 ? text.slice(fmEnd + 3).trimStart() : text;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) headers["x-subsumio-api-key"] = API_KEY;
  if (BRAIN) headers["x-subsumio-source"] = BRAIN;

  const payload = {
    slug,
    title,
    content: body,
    type: fm.type || "law",
    tags: ["statute", jur, abbr.toLowerCase()].filter(Boolean),
    source: SOURCE,
    // Metadata fields stored on the page
    meta: {
      jurisdiction: jur,
      abbreviation: abbr,
      paragraph: para,
      parent_law: fm.parent_law || "",
      version_date: fm.version_date || "",
      source_url: fm.source_url || "",
      license: fm.license || "",
    },
  };

  if (DRY_RUN) {
    return { ok: true, slug };
  }

  return withRetry(async () => {
    const res = await fetch(`${ENGINE}/api/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) return { ok: true, slug };
    if (res.status === 409) return { ok: true, slug, existing: true };

    // Non-retryable client errors
    if (res.status >= 400 && res.status < 500) {
      const body = await res.text().catch(() => `HTTP ${res.status}`);
      return { ok: false, slug, error: `${res.status}: ${body.slice(0, 200)}` };
    }

    // 5xx = potentially transient, let withRetry handle it
    throw new Error(`HTTP ${res.status}`);
  }, `import ${slug}`);
}

// ── Source registration ───────────────────────────────────────────────

async function ensureSource(sourceId: string): Promise<void> {
  if (DRY_RUN || !API_KEY) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) headers["x-subsumio-api-key"] = API_KEY;
  if (BRAIN) headers["x-subsumio-source"] = BRAIN;

  try {
    const res = await fetch(`${ENGINE}/api/sources`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: sourceId, name: sourceId, public: true }),
    });
    if (res.ok) {
      console.log(`  Source "${sourceId}" created`);
    } else if (res.status === 409) {
      console.log(`  Source "${sourceId}" already exists`);
    } else {
      console.warn(`  Warning: source creation returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`  Warning: source creation failed: ${String(err)}`);
  }
}

// ── Concurrency limiter ───────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY && !DRY_RUN) {
    console.error("ERROR: No API key. Set SUBSUMIO_WEB_API_KEY or pass --key KEY");
    console.error("       Or run with --dry-run to validate files without importing.");
    process.exit(1);
  }

  console.log("Statute Import");
  console.log(`  Engine:      ${ENGINE}`);
  console.log(`  Brain:       ${BRAIN || "(default)"}`);
  console.log(`  Source:      ${SOURCE}`);
  console.log(`  Jurisdiction: ${JUR_FILTER || "all"}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Dry-run:     ${DRY_RUN}`);
  console.log("");

  // Verify engine reachable
  if (!DRY_RUN) {
    try {
      const health = await fetch(`${ENGINE}/api/health`);
      if (!health.ok) throw new Error(`HTTP ${health.status}`);
      console.log("Engine: reachable\n");
    } catch {
      console.error("ERROR: Engine not reachable. Start it first: gbrain serve");
      process.exit(1);
    }
  }

  // Ensure sources exist
  const sources = SOURCE === "law-all"
    ? ["law-de", "law-at", "law-ch", "law-all"]
    : [SOURCE];
  for (const s of sources) {
    await ensureSource(s);
  }
  console.log("");

  // Collect files from split corpus
  const dirs = (JUR_FILTER ? [JUR_FILTER] : ["de", "at", "ch"]) as string[];
  const files: string[] = [];
  for (const d of dirs) {
    const dir = `law-corpus-split/${d}`;
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".md")) files.push(`${dir}/${f}`);
      }
    } catch {
      console.warn(`  Skipping ${dir} (not found — run split-statutes.ts first)`);
    }
  }

  if (files.length === 0) {
    console.error("No files to import. Run split-statutes.ts first.");
    process.exit(1);
  }

  console.log(`Importing ${files.length} pages with concurrency=${CONCURRENCY}...\n`);

  let ok = 0;
  let existing = 0;
  let fail = 0;
  const failures: { slug: string; error: string }[] = [];
  let processed = 0;

  await runWithConcurrency(files, async (filePath) => {
    const result = await importPage(filePath);
    processed++;

    if (result.ok) {
      if (result.existing) existing++;
      else ok++;
    } else {
      fail++;
      failures.push({ slug: result.slug, error: result.error || "unknown" });
    }

    // Progress every 200 pages
    if (processed % 200 === 0) {
      console.log(
        `  [${processed}/${files.length}] ok=${ok} existing=${existing} fail=${fail}`,
      );
    }
  }, CONCURRENCY);

  // Final report
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done: ${processed} processed`);
  console.log(`  New:      ${ok}`);
  console.log(`  Existing: ${existing} (idempotent)`);
  console.log(`  Failed:   ${fail}`);

  if (failures.length > 0) {
    console.error("\nAll failures:");
    for (const f of failures) {
      console.error(`  ${f.slug}: ${f.error}`);
    }
    process.exit(1);
  }
}

main();
