#!/usr/bin/env bun
/**
 * Canonical raw-act acceptance runner.
 *
 * It deliberately uses only the production upload API. It never writes OCR
 * text or analysis pages directly, so extraction, OCR, chunking, embeddings,
 * database persistence and the case-level legal pipeline are all exercised.
 *
 * Required environment:
 *   SUBSUMIO_WEB_API_KEY, SUBSUMIO_BRAIN_ID
 * Optional:
 *   SUBSUMIO_ENGINE_URL (default http://127.0.0.1:3001)
 *
 * Usage:
 *   bun run akte:e2e -- --dir "/path/to/raw-act" \
 *     --case-slug legal/cases/acceptance-2026-001 \
 *     --title "Acceptance 2026-001" --jurisdiction at --verfahrenstyp straf \
 *     --expect-gz "12 Cg 34/26x" --expect-on "ON 7" \
 *     --expect-party "Muster GmbH" --expect-deadline "Klagebeantwortung" \
 *     --expect-date "15.04.2026"
 */

import { readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

type Json = Record<string, unknown>;

const SUPPORTED = new Set([
  ".pdf",
  ".docx",
  ".docm",
  ".odt",
  ".rtf",
  ".txt",
  ".eml",
  ".msg",
  ".pst",
  ".csv",
  ".xlsx",
  ".xls",
  ".xlsm",
  ".pptx",
  ".pptm",
  ".xml",
  ".zip",
  ".png",
  ".jpg",
  ".jpeg",
  ".tif",
  ".tiff",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".cache",
  ".idea",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "__pycache__",
]);

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

function args(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] !== `--${name}`) continue;
    const value = process.argv[index + 1]?.trim();
    if (value) values.push(value);
  }
  return values;
}

const directory = arg("dir");
const caseSlug = arg("case-slug");
const title = arg("title", basename(caseSlug || "acceptance-act"));
const jurisdiction = arg("jurisdiction", "at");
const verfahrenstyp = arg("verfahrenstyp", "sonstiges");
const reportPath = arg("report", `akte-e2e-${Date.now()}.json`);
const expectedGz = args("expect-gz");
const expectedOn = args("expect-on");
const expectedParties = args("expect-party");
const expectedDeadlines = args("expect-deadline");
const expectedDates = args("expect-date");
const expectedText = args("expect-text");
const engineUrl = (process.env.SUBSUMIO_ENGINE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const apiKey = process.env.SUBSUMIO_WEB_API_KEY ?? "";
const brainId = process.env.SUBSUMIO_BRAIN_ID ?? process.env.SUBSUMIO_DEMO_BRAIN ?? "";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: bun run akte:e2e -- --dir <raw-act-dir> --case-slug <slug> [options]

Options:
  --title <title>                 Case title
  --jurisdiction at|de|ch|eu      Default: at
  --verfahrenstyp <type>          Default: sonstiges
  --expect-gz <Geschäftszahl>     Repeatable acceptance assertion
  --expect-on <ON-Nummer>         Repeatable acceptance assertion
  --expect-party <Partei>         Repeatable assertion against structured outputs
  --expect-deadline <Frist>       Repeatable assertion against structured outputs
  --expect-date <Datum>           Repeatable assertion against structured outputs
  --expect-text <text>            Repeatable assertion against pipeline outputs
  --report <path>                 Default: akte-e2e-<timestamp>.json

Required environment: SUBSUMIO_WEB_API_KEY, SUBSUMIO_BRAIN_ID
Optional environment: SUBSUMIO_ENGINE_URL (default: http://127.0.0.1:3001)`);
  process.exit(0);
}

if (!directory || !caseSlug) throw new Error("--dir and --case-slug are required");
if (!apiKey || !brainId) throw new Error("SUBSUMIO_WEB_API_KEY and SUBSUMIO_BRAIN_ID are required");
if (!/^(at|de|ch|eu)$/.test(jurisdiction)) throw new Error("invalid --jurisdiction");

const authHeaders = {
  "x-subsumio-api-key": apiKey,
  "x-subsumio-source": brainId,
};

async function request(path: string, init: RequestInit = {}): Promise<Json> {
  const response = await fetch(`${engineUrl}${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Json) : {};
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${text}`);
  return body;
}

/**
 * Confirms that the protected original-file endpoint can resolve the stored
 * bytes. The engine resolves the file before sending headers, so cancelling
 * the stream after the first byte proves ledger + storage availability without
 * downloading a potentially very large act a second time.
 */
async function originalIsAvailable(slug: string): Promise<boolean> {
  const response = await fetch(
    `${engineUrl}/api/files/${slug.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: authHeaders,
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) return false;
  const length = Number(response.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length <= 0) return false;
  await response.body?.cancel();
  return true;
}

function pagePath(slug: string): string {
  return `/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`;
}

async function collectFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(path)));
    else if (entry.isFile() && SUPPORTED.has(extname(entry.name).toLowerCase())) out.push(path);
  }
  return out.sort();
}

async function waitForExtraction(slug: string): Promise<Json> {
  const deadline = Date.now() + 60 * 60_000;
  while (Date.now() < deadline) {
    const page = await request(pagePath(slug));
    const fm = (page.frontmatter ?? {}) as Json;
    const status = String(fm.extraction_status ?? "ready");
    if (["ready", "partial", "text_layer", "ocr_complete"].includes(status)) return page;
    if (["failed", "error", "ocr_failed"].includes(status)) {
      throw new Error(`extraction failed for ${slug}: ${JSON.stringify(fm)}`);
    }
    await Bun.sleep(2_000);
  }
  throw new Error(`extraction timeout for ${slug}`);
}

function parseState(page: Json): Json {
  const raw = String(page.content ?? page.compiled_truth ?? "").trim();
  if (raw.startsWith("{")) return JSON.parse(raw) as Json;
  return (page.frontmatter ?? {}) as Json;
}

function pageText(page: Json): string {
  return [page.title, page.content, page.compiled_truth, JSON.stringify(page.frontmatter ?? {})]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLocaleLowerCase("de-AT");
}

function assertExpectedText(
  label: string,
  expected: string[],
  searchablePages: Json[]
): Array<{ label: string; value: string; found: boolean }> {
  const corpus = searchablePages.map(pageText).join("\n");
  return expected.map((value) => ({
    label,
    value,
    found: corpus.includes(value.toLocaleLowerCase("de-AT")),
  }));
}

async function main() {
  const capability = await request("/api/capabilities/act-import");
  if (
    capability.version !== 1 ||
    capability.deferred_document_pipeline !== true ||
    capability.case_snapshot_pipeline !== true
  ) {
    throw new Error(
      "target engine does not support canonical act imports; deploy the current engine first"
    );
  }
  const files = await collectFiles(directory);
  if (files.length === 0) throw new Error(`no supported raw documents in ${directory}`);

  await request("/api/pages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: caseSlug,
      title,
      type: "legal_case",
      content: `# ${title}\n`,
      frontmatter: { jurisdiction, verfahrenstyp, acceptance_run: true },
    }),
  });

  const uploaded: Array<{ file: string; slug: string; parts: string[]; extraction: Json }> = [];
  for (const path of files) {
    const form = new FormData();
    form.append("file", new File([await Bun.file(path).arrayBuffer()], basename(path)));
    form.append("source", "documents");
    form.append("case_slug", caseSlug);
    form.append("jurisdiction", jurisdiction);
    form.append("defer_pipeline", "true");
    const result = await request("/api/upload", { method: "POST", body: form });
    const slug = String(result.slug);
    const extraction = await waitForExtraction(slug);
    uploaded.push({
      file: path,
      slug,
      parts: Array.isArray(result.part_slugs) ? result.part_slugs.map(String) : [],
      extraction,
    });
    console.log(`✓ ${basename(path)} → ${slug}`);
  }

  const pipelineSlugs = uploaded.flatMap((item) => (item.parts.length ? item.parts : [item.slug]));
  const trigger = await request("/api/legal-pipeline/trigger", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      case_slug: caseSlug,
      part_slugs: pipelineSlugs,
      jurisdiction,
      verfahrenstyp,
    }),
  });

  const stateSlug = `pipeline/state-${caseSlug}`;
  let state: Json = {};
  const deadline = Date.now() + 60 * 60_000;
  while (Date.now() < deadline) {
    try {
      state = parseState(await request(pagePath(stateSlug)));
      const status = String(state.status ?? "pending");
      console.log(`Pipeline: ${status}, Layer ${state.current_layer ?? "-"}`);
      if (status === "completed") break;
      if (["failed", "error"].includes(status)) throw new Error(JSON.stringify(state));
    } catch (error) {
      if (String(error).includes("404")) {
        await Bun.sleep(3_000);
        continue;
      }
      throw error;
    }
    await Bun.sleep(10_000);
  }
  if (state.status !== "completed") throw new Error("pipeline did not complete within one hour");

  const outputSlugs = Object.values((state.layers ?? {}) as Json)
    .flatMap((layer) =>
      Array.isArray((layer as Json)?.output_slugs)
        ? ((layer as Json).output_slugs as unknown[])
        : []
    )
    .map(String);
  const persistedOutputs: Json[] = [];
  for (const slug of [...new Set(outputSlugs)])
    persistedOutputs.push(await request(pagePath(slug)));

  // This page is what powers the dashboard's Aktenansicht. Validate the
  // projection, not merely the existence of background output pages.
  const caseProjection = await request(pagePath(caseSlug));
  const caseFrontmatter = (caseProjection.frontmatter ?? {}) as Json;
  const legalDataRefs = (caseFrontmatter.legal_data_refs ?? {}) as Json;

  const sourceDocuments = uploaded.map((item) => item.extraction);
  const onIndexPages = persistedOutputs.filter((page) =>
    String(page.slug ?? "")
      .toLocaleLowerCase("de-AT")
      .includes("on-index")
  );
  const originalAvailability = await Promise.all(
    uploaded.map(async (item) => ({ slug: item.slug, found: await originalIsAvailable(item.slug) }))
  );
  const assertions = [
    ...uploaded.map((item) => ({
      label: "aktenzuordnung",
      value: item.slug,
      found: String(((item.extraction.frontmatter ?? {}) as Json).case_slug ?? "") === caseSlug,
    })),
    ...originalAvailability.map((item) => ({
      label: "originaldatei",
      value: item.slug,
      found: item.found,
    })),
    ...(expectedGz.length > 0
      ? assertExpectedText("aktenprojektion_geschäftszahl", expectedGz, [caseProjection])
      : []),
    ...assertExpectedText("geschäftszahl", expectedGz, [...sourceDocuments, ...persistedOutputs]),
    ...(expectedOn.length > 0
      ? [
          {
            label: "aktenprojektion_on_index",
            value: `on-indexes/${caseSlug}`,
            found: legalDataRefs.on_index === `on-indexes/${caseSlug}`,
          },
          { label: "on_index", value: "canonical ON-Index", found: onIndexPages.length > 0 },
        ]
      : []),
    ...assertExpectedText("on_nummer", expectedOn, onIndexPages),
    ...assertExpectedText("partei", expectedParties, persistedOutputs),
    ...assertExpectedText("frist", expectedDeadlines, persistedOutputs),
    ...assertExpectedText("datum", expectedDates, persistedOutputs),
    ...assertExpectedText("fachinhalt", expectedText, persistedOutputs),
  ];
  const failedAssertions = assertions.filter((assertion) => !assertion.found);

  const report = {
    generated_at: new Date().toISOString(),
    engine_url: engineUrl,
    case_slug: caseSlug,
    raw_file_count: files.length,
    uploaded: uploaded.map(({ file, slug, parts, extraction }) => ({
      file,
      slug,
      parts,
      frontmatter: extraction.frontmatter,
    })),
    pipeline_job_id: trigger.job_id,
    pipeline_state: state,
    case_projection: {
      slug: caseProjection.slug,
      frontmatter: caseFrontmatter,
    },
    persisted_output_slugs: persistedOutputs.map((page) => page.slug),
    acceptance_assertions: assertions,
    accepted: failedAssertions.length === 0,
    failed_assertions: failedAssertions,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`✓ Complete report: ${reportPath}`);

  if (failedAssertions.length > 0) {
    throw new Error(
      `acceptance assertions failed: ${failedAssertions
        .map((assertion) => `${assertion.label}=${JSON.stringify(assertion.value)}`)
        .join(", ")}`
    );
  }
}

await main();
