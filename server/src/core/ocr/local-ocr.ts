/**
 * Local OCR for scanned documents: pdftoppm rasterizes a PDF page, Tesseract
 * (German + English models) recognizes it. Nothing leaves the host, so a
 * scanned Schriftsatz is never sent to a third-party model just to become
 * searchable.
 *
 *  - `openPdfRasterizer` renders pages grayscale at the scan's own resolution
 *    (300 dpi for pages without a raster image) with the page's real aspect
 *    ratio, from a throwaway directory that is always removed.
 *  - `ocrImageLocal` runs Tesseract with page segmentation + orientation
 *    detection (`--psm 1`), reads the TSV output and returns the text with
 *    its mean word confidence. Multi-page TIFFs yield every page.
 *  - `correctLegalOcr` repairs the systematic misreads of "§" ("8", "$", "S")
 *    in front of a norm citation — CER stays tiny while every § citation is
 *    wrong without it.
 *
 * Both external tools run through the converter sandbox (minimal env,
 * prlimit CPU/file ceilings, SIGKILL on wall-clock timeout).
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { converterEnv, limitedArgv } from "../converter-sandbox.ts";

export interface LocalOcrResult {
  text: string;
  /** Mean Tesseract word confidence, 0–100; null when no word was recognized. */
  confidence: number | null;
}

const RASTER_DPI = 300;
const RASTER_TIMEOUT_MS = 60_000;
const TESSERACT_TIMEOUT_MS = 90_000;
const MAX_RASTER_BYTES = 200 * 1024 * 1024;

let tesseractLangs: string | null | undefined;

/**
 * The Tesseract language spec usable on this host ("deu+eng", "deu" …), or
 * null when Tesseract or its German model is missing. Cached per process.
 */
export async function localOcrLanguages(): Promise<string | null> {
  if (tesseractLangs !== undefined) return tesseractLangs;
  tesseractLangs = null;
  if (typeof Bun === "undefined" || !Bun.which("tesseract")) return null;
  try {
    const proc = Bun.spawn(["tesseract", "--list-langs"], { stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    const langs = new Set(
      `${out}\n${err}`
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    );
    if (langs.has("deu")) tesseractLangs = langs.has("eng") ? "deu+eng" : "deu";
  } catch {
    tesseractLangs = null;
  }
  return tesseractLangs;
}

/** Test hook: forget the cached language probe. */
export function resetLocalOcrProbe(): void {
  tesseractLangs = undefined;
}

export function pdfRasterizerAvailable(): boolean {
  return typeof Bun !== "undefined" && Boolean(Bun.which("pdftoppm"));
}

async function runSandboxed(
  argv: string[],
  dir: string,
  timeoutMs: number,
  extraEnv: Record<string, string> = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(
    limitedArgv(argv, { cpuSeconds: Math.ceil(timeoutMs / 1000), maxFileBytes: MAX_RASTER_BYTES }),
    { stdout: "pipe", stderr: "pipe", env: { ...converterEnv(dir), ...extraEnv } }
  );
  const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolution of the scanned image on a page (max x-ppi of its images), or
 * null when the page has no raster image. Read from `pdfimages -list`.
 */
export function pageImagePpi(listing: string): number | null {
  let best: number | null = null;
  for (const line of listing.split("\n").slice(2)) {
    const cols = line.trim().split(/\s+/);
    // page num type width height color comp bpc enc interp object ID x-ppi y-ppi size ratio
    if (cols.length < 14 || cols[2] !== "image") continue;
    const ppi = Number(cols[12]);
    if (Number.isFinite(ppi) && ppi > 0) best = Math.max(best ?? 0, ppi);
  }
  return best;
}

/** Render dpi for OCR: the scan's own resolution (upscaling a 200 dpi scan
 *  to 300 dpi measurably destroys recognition), clamped to 150–400. */
export function renderDpiFor(imagePpi: number | null): number {
  if (!imagePpi) return RASTER_DPI;
  return Math.min(400, Math.max(150, Math.round(imagePpi)));
}

export interface PdfRasterizer {
  /** Render one page (1-based) to a grayscale PNG at the scan's resolution. */
  render(pageNo: number): Promise<Buffer>;
  /** Remove the private temp dir. Always call (try/finally). */
  close(): Promise<void>;
}

/**
 * Write the PDF once into a private temp dir and render pages from it; a
 * 100-page scan must not be copied to disk once per page.
 */
export async function openPdfRasterizer(pdf: Buffer): Promise<PdfRasterizer> {
  const dir = await mkdtemp(join(tmpdir(), "subsumio-ocr-raster-"));
  const input = join(dir, "input.pdf");
  try {
    await writeFile(input, pdf, { mode: 0o600 });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    async render(pageNo: number): Promise<Buffer> {
      const page = String(pageNo);
      let dpi = RASTER_DPI;
      if (Bun.which("pdfimages")) {
        const listing = await runSandboxed(
          ["pdfimages", "-list", "-f", page, "-l", page, input],
          dir,
          RASTER_TIMEOUT_MS
        );
        if (listing.exitCode === 0) dpi = renderDpiFor(pageImagePpi(listing.stdout));
      }
      const outBase = join(dir, `page-${page}`);
      const { exitCode, stderr } = await runSandboxed(
        [
          "pdftoppm",
          "-r",
          String(dpi),
          "-gray",
          "-png",
          "-f",
          page,
          "-l",
          page,
          "-singlefile",
          input,
          outBase,
        ],
        dir,
        RASTER_TIMEOUT_MS
      );
      if (exitCode !== 0) {
        throw new Error(`pdftoppm exit ${exitCode}${stderr.trim() ? `: ${stderr.trim()}` : ""}`);
      }
      const png = await readFile(`${outBase}.png`);
      await rm(`${outBase}.png`, { force: true });
      return png;
    },
    async close(): Promise<void> {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Rebuild reading-order text from Tesseract TSV output: words on a line are
 * joined by spaces, paragraphs by a blank line, TIFF pages by a page marker.
 */
export function textFromTesseractTsv(tsv: string): LocalOcrResult {
  const lines = tsv.split("\n");
  let current = "";
  let lastPage = -1;
  let lastPar = "";
  let lastLine = "";
  const pages: string[][] = [];
  let confSum = 0;
  let confWeight = 0;
  for (const raw of lines.slice(1)) {
    const cols = raw.split("\t");
    if (cols.length < 12 || cols[0] !== "5") continue;
    const word = cols.slice(11).join("\t").trim();
    if (!word) continue;
    const page = Number(cols[1]);
    const parKey = `${cols[2]}:${cols[3]}`;
    const lineKey = `${parKey}:${cols[4]}`;
    if (page !== lastPage) {
      if (current) pages[pages.length - 1]?.push(current);
      pages.push([]);
      current = word;
      lastPage = page;
    } else if (lineKey !== lastLine) {
      pages[pages.length - 1].push(current);
      if (parKey !== lastPar) pages[pages.length - 1].push("");
      current = word;
    } else {
      current += ` ${word}`;
    }
    lastPar = parKey;
    lastLine = lineKey;
    const conf = Number(cols[10]);
    if (Number.isFinite(conf) && conf >= 0) {
      confSum += conf * word.length;
      confWeight += word.length;
    }
  }
  if (current) pages[pages.length - 1]?.push(current);
  const pageTexts = pages.map((pageLines) =>
    pageLines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
  const text =
    pageTexts.length > 1
      ? pageTexts.map((body, index) => `--- Page ${index + 1} ---\n${body}`).join("\n\n")
      : (pageTexts[0] ?? "");
  return {
    text,
    confidence: confWeight > 0 ? Math.round((confSum / confWeight) * 10) / 10 : null,
  };
}

/**
 * Recognize text in an image (PNG/JPEG/TIFF/BMP/GIF/WebP — whatever the host's
 * Leptonica reads). Throws when Tesseract is unavailable or fails.
 */
export async function ocrImageLocal(image: Buffer, ext = ".png"): Promise<LocalOcrResult> {
  const langs = await localOcrLanguages();
  if (!langs) throw new Error("tesseract with German model not available");
  const dir = await mkdtemp(join(tmpdir(), "subsumio-ocr-"));
  try {
    const safeExt = /^\.[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : ".png";
    const input = join(dir, `input${safeExt}`);
    await writeFile(input, image, { mode: 0o600 });
    const { exitCode, stdout, stderr } = await runSandboxed(
      ["tesseract", input, "stdout", "-l", langs, "--psm", "1", "tsv"],
      dir,
      TESSERACT_TIMEOUT_MS,
      // Pages already run in parallel; one thread each keeps the host responsive.
      { OMP_THREAD_LIMIT: "1" }
    );
    if (exitCode !== 0) {
      throw new Error(`tesseract exit ${exitCode}${stderr.trim() ? `: ${stderr.trim()}` : ""}`);
    }
    const result = textFromTesseractTsv(stdout);
    return { ...result, text: correctLegalOcr(result.text) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A "§"-misread is only repaired when the number is followed by "Abs"/"lit"/
// "Z <n>" or by a known statute abbreviation. An open acronym pattern would
// also hit amounts ("8 500 EUR"); "8 Ob 12/24" (an OGH senate) never matches.
const STATUTES = [
  "ABGB",
  "AußStrG",
  "AVG",
  "ASVG",
  "AktG",
  "AsylG",
  "AngG",
  "ArbVG",
  "AZG",
  "B-VG",
  "BAO",
  "BGB",
  "DSG",
  "DSGVO",
  "EGBGB",
  "EheG",
  "EO",
  "EStG",
  "FPG",
  "GewO",
  "GmbHG",
  "GOG",
  "HGB",
  "IO",
  "JN",
  "KSchG",
  "MRG",
  "RATG",
  "RAO",
  "StGB",
  "StPO",
  "StVO",
  "UGB",
  "UrhG",
  "UStG",
  "UWG",
  "VersVG",
  "VStG",
  "VwGG",
  "VwGVG",
  "WEG",
  "ZPO",
  "ZGB",
  "OR",
  "VVG",
  "BVG",
  "FSG",
  "KFG",
  "EKHG",
  "AHG",
  "MSchG",
  "UrlG",
  "EFZG",
  "GlBG",
];
const NORM_TAIL = String.raw`(?:Abs\.?|lit\.|Z\s?\d|${STATUTES.join("|")})`;

const SECTION_MISREAD = new RegExp(
  String.raw`(^|[\s(\[„"])([8$S]{1,2})\s?(\d{1,4}[a-z]?)(?=\s+${NORM_TAIL}(?![\p{L}\d]))`,
  "gmu"
);
// "$" is never legitimate in front of a bare norm number; amounts carry a
// separator or currency context ("$ 5.000", "USD") and are left alone.
const DOLLAR_SECTION = /(^|[\s(\[„"])\$\s?(\d{1,4}[a-z]?)(?![\d.,])/gmu;

/** Repair "§" misreads ("8 1295 ABGB" → "§ 1295 ABGB", "$ 7 Abs 2" → "§ 7 Abs 2"). */
export function correctLegalOcr(text: string): string {
  return text
    .replace(SECTION_MISREAD, (_m, lead: string, sign: string, num: string) => {
      return `${lead}${sign.length === 2 ? "§§" : "§"} ${num}`;
    })
    .replace(DOLLAR_SECTION, "$1§ $2");
}
