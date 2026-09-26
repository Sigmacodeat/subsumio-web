/**
 * Document text extraction — turns binary office/document formats into
 * markdown-ready text so importFromFile can ingest them like any other page.
 *
 * Supported: .pdf (text layer), modern + legacy Office/OpenDocument formats,
 *            .eml/.msg, .csv/.tsv, .xlsx/.xls/.ods, .rtf,
 *            .mp3, .wav, .m4a, .ogg, .flac (audio transcription).
 * Modern formats use pure-JS parsers proven under `bun build --compile`.
 * Legacy Office/iWork formats use an isolated, time-limited LibreOffice
 * conversion process in the production container.
 *
 * Scanned PDF pages (no or garbage text layer) are rasterized with pdftoppm
 * and OCR'd via ocr/recognize.ts — local Tesseract by default. The extraction
 * returns a `pdf_text_layer_sparse` warning, then attempts OCR page by page.
 * If OCR dependencies are missing, the warning names what is missing
 * (poppler-utils, tesseract-ocr-deu).
 *
 * Parsers are imported lazily inside each branch so the common
 * markdown/code import path pays zero startup cost for them.
 */

export const SUPPORTED_DOCUMENT_EXTS = [
  ".pdf",
  ".docx",
  ".docm",
  ".doc",
  ".eml",
  ".msg",
  ".pst",
  ".csv",
  ".tsv",
  ".xlsx",
  ".xlsm",
  ".xls",
  ".ods",
  ".rtf",
  ".pptx",
  ".pptm",
  ".ppt",
  ".odt",
  ".odp",
  ".pages",
  ".key",
  ".numbers",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
] as const;
export type SupportedDocumentExt = (typeof SUPPORTED_DOCUMENT_EXTS)[number];

/**
 * Audio extensions supported via transcription (Groq Whisper / OpenAI Whisper).
 * v0.43.0: PMBrain audio-import parity.
 */
const AUDIO_EXTS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".webm",
]);

/**
 * Raw-file ceiling for document formats. Matches MAX_FILE_SIZE (500MB) from
 * the web upload layer so users never hit a lower extraction limit after a
 * successful upload. A 200MB PDF with mostly text extracts to well under 5MB.
 * The extracted TEXT still flows through importFromContent's MAX_FILE_SIZE
 * guard, so oversized extractions are rejected there.
 */
export const MAX_DOCUMENT_FILE_SIZE = 500_000_000; // 500MB — matches upload limit

export function isDocumentFilePath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return SUPPORTED_DOCUMENT_EXTS.some((ext) => lower.endsWith(ext));
}

export interface ExtractedDocument {
  /** Markdown body (no frontmatter). Empty string when nothing extractable. */
  text: string;
  /** Frontmatter fields synthesized from document metadata. */
  frontmatter: Record<string, string | number>;
  /** Non-fatal extraction notes (sparse text layer, parser messages, …). */
  warnings: string[];
}

export class PasswordRequiredError extends Error {
  readonly format: string;
  constructor(format: string) {
    super(`password_required:${format}`);
    this.name = "PasswordRequiredError";
    this.format = format;
  }
}

export class InvalidDocumentPasswordError extends Error {
  readonly format: string;
  constructor(format: string) {
    super(`invalid_document_password:${format}`);
    this.name = "InvalidDocumentPasswordError";
    this.format = format;
  }
}

const ENCRYPTABLE_OFFICE_EXTS = new Set([
  ".doc",
  ".docx",
  ".docm",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".ppt",
  ".pptx",
  ".pptm",
]);

async function decryptOfficeIfNeeded(buf: Buffer, ext: string, password?: string): Promise<Buffer> {
  if (!ENCRYPTABLE_OFFICE_EXTS.has(ext)) return buf;
  const imported = await import("officecrypto-tool");
  const officeCrypto = (
    "default" in imported ? imported.default : imported
  ) as typeof import("officecrypto-tool");
  let encrypted = false;
  try {
    encrypted = officeCrypto.isEncrypted(buf);
  } catch {
    encrypted = false;
  }
  if (!encrypted) return buf;
  if (!password) throw new PasswordRequiredError(ext.slice(1));
  try {
    return await officeCrypto.decrypt(buf, { password });
  } catch {
    throw new InvalidDocumentPasswordError(ext.slice(1));
  }
}

async function decryptPdfIfNeeded(buf: Buffer, password?: string): Promise<Buffer> {
  // Encrypted PDFs carry an /Encrypt entry in the trailer/xref structure.
  // The password is passed via a mode-0600 file, never argv or logs.
  const probeBytes = 4_000_000;
  const head = buf.subarray(0, Math.min(buf.length, probeBytes)).toString("latin1");
  const tail = buf.subarray(Math.max(0, buf.length - probeBytes), buf.length).toString("latin1");
  if (!head.includes("/Encrypt") && !tail.includes("/Encrypt")) {
    return buf;
  }
  // Without a password we still try an empty user password: PDFs that only
  // carry an owner password (print/copy restrictions — common for court and
  // authority PDFs) open without one and must not be rejected as locked.
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "subsumio-pdf-unlock-"));
  const input = join(dir, "input.pdf");
  const output = join(dir, "output.pdf");
  const passwordFile = join(dir, "password.txt");
  try {
    await Promise.all([
      writeFile(input, buf, { mode: 0o600 }),
      writeFile(passwordFile, password ?? "", { mode: 0o600 }),
    ]);
    const { converterEnv, limitedArgv } = await import("./converter-sandbox.ts");
    const proc = Bun.spawn(
      limitedArgv(["qpdf", `--password-file=${passwordFile}`, "--decrypt", input, output], {
        cpuSeconds: 120,
        maxFileBytes: 2 * MAX_DOCUMENT_FILE_SIZE,
      }),
      { stdout: "ignore", stderr: "pipe", env: converterEnv(dir) }
    );
    const timeout = setTimeout(() => proc.kill("SIGKILL"), 120_000);
    const exitCode = await proc.exited.finally(() => clearTimeout(timeout));
    // qpdf exit 3 = done with warnings (typical for slightly damaged files).
    if (exitCode !== 0 && exitCode !== 3) {
      if (!password) throw new PasswordRequiredError("pdf");
      throw new InvalidDocumentPasswordError("pdf");
    }
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Average chars-per-page below which a PDF is considered scan-only. */
const PDF_SPARSE_TEXT_CHARS_PER_PAGE = 32;

/**
 * A page's text layer is unreliable when it is (nearly) empty, glyph garbage
 * (fonts without a ToUnicode map extract as control characters, private-use
 * code points or U+FFFD), or a failed scanner OCR layer of letter fragments.
 * Such a page reads as "100 % covered" while its § signs, names and amounts
 * are gone, so it is OCR'd like a scan.
 */
export function isUnreliableTextLayer(page: string): boolean {
  if (page.length < PDF_SPARSE_TEXT_CHARS_PER_PAGE) return true;
  let garbage = 0;
  let counted = 0;
  for (const ch of page) {
    if (/\s/.test(ch)) continue;
    counted += 1;
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || code === 0xfffd || (code >= 0xe000 && code <= 0xf8ff)) {
      garbage += 1;
    }
  }
  if (counted > 0 && garbage / counted > 0.05) return true;
  // Copier/scanner OCR layers that failed come out letter-spaced or as
  // fragments ("Kl a g e B e z i r k s g e r i c h t"). Real prose, tables
  // and number columns are dominated by multi-letter words or numbers.
  const tokens = page.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));
  if (tokens.length < 12) return false;
  const wordLike = tokens.filter(
    (token) => /\p{N}/u.test(token) || /\p{L}{2,}/u.test(token) || /^[§&]$/.test(token)
  ).length;
  return wordLike / tokens.length < 0.5;
}

/**
 * Extraction whose text was produced by a model (OCR / speech-to-text), not
 * read verbatim from a digital text layer. Such text CAN contain recognition
 * errors — a misread clause number or a mistranscribed amount is a real legal
 * risk. We tag the page (machine-readable frontmatter) AND prepend a visible
 * banner so neither an agent nor a human treats it as ground truth without
 * checking the original. Deterministic parses (PDF text layer, docx, eml,
 * xlsx) are NOT tagged.
 */
export const UNVERIFIED_BANNERS = {
  ocr_vision:
    "> ⚠️ **Unverifizierte Extraktion (OCR).** Dieser Text wurde per Bilderkennung " +
    "aus einem gescannten Dokument gewonnen und kann Erkennungsfehler enthalten " +
    "(z. B. falsche Paragraphen-, Zahlen- oder Datumswerte). Vor rechtlicher " +
    "Verwendung gegen das Originaldokument prüfen.",
  audio_transcription:
    "> ⚠️ **Unverifizierte Extraktion (Audio-Transkription).** Dieser Text wurde " +
    "automatisch aus einer Audioaufnahme transkribiert und kann Hör-/Erkennungsfehler " +
    "enthalten. Vor rechtlicher Verwendung gegen die Originalaufnahme prüfen.",
} as const;

export function withUnverifiedBanner(
  text: string,
  method: keyof typeof UNVERIFIED_BANNERS
): string {
  return `${UNVERIFIED_BANNERS[method]}\n\n${text}`;
}

export async function extractDocumentText(
  buf: Buffer,
  ext: string,
  opts: {
    filename?: string;
    attachmentDepth?: number;
    password?: string;
    ocrImage?: (data: Buffer, extension: string) => Promise<string>;
  } = {}
): Promise<ExtractedDocument> {
  const lowered = ext.toLowerCase();
  const decrypted =
    lowered === ".pdf"
      ? await decryptPdfIfNeeded(buf, opts.password)
      : await decryptOfficeIfNeeded(buf, lowered, opts.password);
  let result: ExtractedDocument;
  switch (lowered) {
    case ".pdf":
      result = await extractPdf(decrypted);
      break;
    case ".docx":
    case ".docm": {
      const extracted = await extractDocx(decrypted, opts.ocrImage);
      extracted.frontmatter.source_format = lowered.slice(1);
      result = extracted;
      break;
    }
    case ".doc":
    case ".rtf":
    case ".odt":
      // Word-processor formats go through LibreOffice → DOCX so tracked
      // deletions, comments and footnotes keep their structure (the DOCX
      // review layer separates them) instead of flattening into body text.
      result = await extractWordProcessorDocument(decrypted, lowered, opts.filename, opts.ocrImage);
      break;
    case ".ppt":
    case ".odp":
    case ".pages":
    case ".key":
      result = await extractViaLibreOffice(decrypted, lowered, opts.filename);
      break;
    case ".eml":
      result = await extractEml(buf, opts.attachmentDepth ?? 0, opts.password, opts.ocrImage);
      break;
    case ".msg":
      result = await extractMsg(buf, opts.attachmentDepth ?? 0, opts.password, opts.ocrImage);
      break;
    case ".pst":
      result = await extractPst(buf, opts.filename, opts.ocrImage);
      break;
    case ".csv":
    case ".tsv":
      result = await extractDelimited(buf, lowered, opts.filename);
      break;
    case ".xlsx":
    case ".xlsm":
    case ".xls":
    case ".ods":
      result = await extractWorkbook(decrypted, lowered);
      break;
    case ".numbers":
      result = await extractNumbers(buf, opts.filename);
      break;
    case ".pptx":
    case ".pptm": {
      const extracted = await extractPptx(decrypted, opts.ocrImage);
      extracted.frontmatter.source_format = lowered.slice(1);
      result = extracted;
      break;
    }
    // v0.43.0: audio transcription via existing transcription.ts
    case ".mp3":
    case ".wav":
    case ".m4a":
    case ".ogg":
    case ".flac":
      result = await extractAudio(buf, opts.filename || "audio");
      break;
    default:
      throw new Error(`Unsupported document extension: ${ext}`);
  }

  // Scan extracted text for prompt injection patterns (Gap 6: adversarial defense)
  if (result.text.length > 0) {
    try {
      const { scanForInjection } = await import("./adversarial-defense.ts");
      const scan = scanForInjection(result.text);
      if (!scan.clean) {
        const flaggedCategories = [...new Set(scan.flags.map((f) => f.category))];
        result.warnings.push(
          `injection_detected: ${flaggedCategories.join(",")} (risk_score=${scan.risk_score.toFixed(2)}, blocked=${scan.blocked})`
        );
        if (scan.blocked) {
          result.frontmatter.injection_blocked = "true";
        }
        result.frontmatter.injection_detected = "true";
      }
    } catch {
      // adversarial-defense.ts not available — skip scan silently
    }
  }

  return result;
}

/** Extract the /Pages /Count value from raw PDF bytes by scanning the
 *  trailer/xref for the Pages object reference and following it to /Count.
 *  This is a lightweight regex probe — not a full PDF parser — but it
 *  catches truncation where unpdf silently reports fewer pages than the
 *  file claims. Returns 0 if the count can't be determined. */
function rawPdfPageCount(buf: Buffer): number {
  const head = buf.subarray(0, Math.min(buf.length, 4_000_000)).toString("latin1");
  const tail = buf.subarray(Math.max(0, buf.length - 4_000_000)).toString("latin1");
  // Look for /Type /Pages followed by /Count N in the Pages object
  const pagesMatch =
    head.match(/\/Type\s*\/Pages\s*\/Count\s+(\d+)/) ||
    tail.match(/\/Type\s*\/Pages\s*\/Count\s+(\d+)/) ||
    head.match(/\/Count\s+(\d+)\s*\/Type\s*\/Pages/) ||
    tail.match(/\/Count\s+(\d+)\s*\/Type\s*\/Pages/);
  return pagesMatch ? parseInt(pagesMatch[1], 10) : 0;
}

async function extractPdf(buf: Buffer): Promise<ExtractedDocument> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  // unpdf wants a standalone Uint8Array; slice detaches from Buffer pool.
  const bytes = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const doc = await getDocumentProxy(bytes);
  // mergePages: false → array of per-page text. We join with ###***### so
  // every PDF page is individually represented with a clear boundary.
  // Previously mergePages: true merged all pages into one blob, losing
  // page boundaries — making it impossible to trace content back to a
  // specific page in the court file (Aktenordnung).
  const { text, totalPages } = await extractText(doc, { mergePages: false });
  const pages: string[] = Array.isArray(text) ? text : [text];
  const PAGE_SEP = "###***###";
  const normalizedPages = pages.map((page) => normalizeWhitespace(page ?? ""));
  const sparsePages = normalizedPages
    .map((page, index) => (isUnreliableTextLayer(page) ? index + 1 : 0))
    .filter(Boolean);
  const textLayer = normalizedPages
    .map((page, index) => (page ? `--- Page ${index + 1} ---\n${page}` : ""))
    .filter(Boolean)
    .join(`\n${PAGE_SEP}\n`);
  const annotations = await extractPdfAnnotations(doc, totalPages);
  const cleaned = normalizeWhitespace(
    [textLayer, annotations.section].filter(Boolean).join("\n\n")
  );
  const warnings: string[] = [];

  // PDF page count validation: compare parser's totalPages against the
  // raw /Pages /Count metadata from the PDF trailer. A mismatch indicates
  // either a truncated download or a corrupt PDF where the parser silently
  // dropped pages — both are data integrity risks for legal corpus imports.
  const rawPages = rawPdfPageCount(buf);
  if (rawPages > 0 && rawPages !== totalPages) {
    warnings.push(
      `pdf_page_count_mismatch: raw /Pages /Count=${rawPages} but parser extracted ${totalPages} page(s) — possible truncation or corruption`
    );
  }

  if (totalPages > 500) {
    warnings.push(
      `pdf_annotations_partial: annotations checked on first 500 of ${totalPages} pages`
    );
  }
  if (annotations.count > 0) {
    warnings.push(
      `pdf_review_layer: ${annotations.count} annotation(s) preserved with page provenance`
    );
  }

  if (totalPages > 0 && sparsePages.length > 0) {
    warnings.push(
      `pdf_text_layer_sparse: ${sparsePages.length} of ${totalPages} page(s) have no reliable text layer; attempting page-level OCR`
    );

    const ocr = await tryOcrFallback(buf, totalPages, sparsePages);
    warnings.push(...ocr.warnings);
    if (ocr.pageTexts.size > 0) {
      const sparseSet = new Set(sparsePages);
      const coveredPages = totalPages - sparsePages.length + ocr.pageTexts.size;
      const coveragePercent =
        totalPages > 0 ? Math.round((coveredPages / totalPages) * 10000) / 100 : 100;
      const mergedPages = normalizedPages.map((page, index) => {
        const pageNo = index + 1;
        const recognized = ocr.pageTexts.get(pageNo);
        // One short per-page tag instead of repeating the full banner on every
        // page: the banner is chunked and embedded with the page text, so a
        // per-page banner turned ~16 % of every OCR chunk into boilerplate.
        const content = recognized
          ? `[OCR-Seite${recognized.confidence !== null ? ` · Erkennungssicherheit ${Math.round(recognized.confidence)} %` : ""}]\n${recognized.text}`
          : sparseSet.has(pageNo)
            ? "[Kein durchsuchbarer Text extrahiert]"
            : page;
        return `--- Page ${pageNo} ---\n${content}`;
      });
      const confidences = [...ocr.pageTexts.values()]
        .map((p) => p.confidence)
        .filter((c): c is number => c !== null);
      warnings.push(
        `pdf_ocr_fallback: OCR completed for ${ocr.pageTexts.size} of ${sparsePages.length} sparse page(s)`
      );
      return {
        text: [
          UNVERIFIED_BANNERS.ocr_vision,
          mergedPages.join(`\n${PAGE_SEP}\n`),
          annotations.section,
        ]
          .filter(Boolean)
          .join("\n\n"),
        frontmatter: {
          type: "document",
          source_format: "pdf",
          pages: totalPages,
          extraction_method: "ocr_vision",
          ocr_engine: ocr.engine ?? "unknown",
          ...(confidences.length > 0
            ? {
                ocr_confidence_mean:
                  Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) /
                  10,
                ocr_confidence_min: Math.min(...confidences),
              }
            : {}),
          extraction_unverified: "true",
          extraction_pages_total: totalPages,
          extraction_pages_covered: coveredPages,
          extraction_coverage_percent: coveragePercent,
          annotations_count: annotations.count,
          redline_detected: annotations.redlineCount > 0 ? "true" : "false",
        },
        warnings,
      };
    }
  }

  return {
    text: cleaned,
    frontmatter: {
      type: "document",
      source_format: "pdf",
      pages: totalPages,
      extraction_method: "text_layer",
      extraction_pages_total: totalPages,
      extraction_pages_covered: Math.max(0, totalPages - sparsePages.length),
      extraction_coverage_percent:
        totalPages > 0
          ? Math.round(((totalPages - sparsePages.length) / totalPages) * 10000) / 100
          : 100,
      annotations_count: annotations.count,
      redline_detected: annotations.redlineCount > 0 ? "true" : "false",
    },
    warnings,
  };
}

async function extractPdfAnnotations(
  doc: unknown,
  totalPages: number
): Promise<{ section: string; count: number; redlineCount: number }> {
  const reviewKinds = new Set([
    "Text",
    "Highlight",
    "Underline",
    "StrikeOut",
    "Squiggly",
    "FreeText",
  ]);
  const redlineKinds = new Set(["Highlight", "Underline", "StrikeOut", "Squiggly"]);
  const lines: string[] = [];
  let redlineCount = 0;
  const proxy = doc as {
    getPage?: (pageNumber: number) => Promise<{
      getAnnotations?: (
        params?: Record<string, unknown>
      ) => Promise<Array<Record<string, unknown>>>;
    }>;
  };
  if (!proxy.getPage) return { section: "", count: 0, redlineCount: 0 };
  for (let pageNumber = 1; pageNumber <= Math.min(totalPages, 500); pageNumber++) {
    try {
      const page = await proxy.getPage(pageNumber);
      const pageAnnotations = (await page.getAnnotations?.({ intent: "display" })) ?? [];
      for (const annotation of pageAnnotations) {
        const subtype = String(annotation.subtype ?? annotation.annotationType ?? "Annotation");
        if (!reviewKinds.has(subtype)) continue;
        const contents = String(
          annotation.contentsObj && typeof annotation.contentsObj === "object"
            ? ((annotation.contentsObj as { str?: unknown }).str ?? "")
            : (annotation.contents ?? annotation.fieldValue ?? "")
        ).trim();
        const author = String(
          annotation.titleObj && typeof annotation.titleObj === "object"
            ? ((annotation.titleObj as { str?: unknown }).str ?? "")
            : (annotation.title ?? "")
        ).trim();
        const date = String(annotation.modificationDate ?? "").trim();
        if (redlineKinds.has(subtype)) redlineCount += 1;
        lines.push(
          `- **Seite ${pageNumber} · ${subtype}:** ${contents || "[grafische Markierung ohne Kommentar]"}` +
            `${author ? ` — ${author}` : ""}${date ? ` (${date})` : ""}`
        );
      }
    } catch {
      // A malformed annotation must not discard an otherwise readable PDF.
    }
  }
  return {
    section: lines.length > 0 ? `## PDF-Kommentare / Redlines\n\n${lines.join("\n")}` : "",
    count: lines.length,
    redlineCount,
  };
}

/**
 * OCR for scanned PDF pages: pdftoppm renders each requested page at 300 dpi
 * with its real aspect ratio into a private temp dir (removed afterwards),
 * then `recognizeImage` reads it — local Tesseract by default, the vision
 * model only when configured (see ocr/recognize.ts). Pages over the per-
 * document cap or the firm's daily budget are reported, never dropped
 * silently.
 */
interface PdfOcrPage {
  text: string;
  engine: "tesseract" | "vision";
  confidence: number | null;
}

async function tryOcrFallback(
  pdfBuf: Buffer,
  totalPages: number,
  requestedPages: number[]
): Promise<{ pageTexts: Map<number, PdfOcrPage>; warnings: string[]; engine: string | null }> {
  const pageTexts = new Map<number, PdfOcrPage>();
  const warnings: string[] = [];
  const { resolveOcrEngine, recognizeImage } = await import("./ocr/recognize.ts");
  const { pdfRasterizerAvailable, openPdfRasterizer } = await import("./ocr/local-ocr.ts");
  const engine = await resolveOcrEngine();
  if (!engine) {
    warnings.push("pdf_ocr_unavailable: no OCR engine (tesseract or vision model) configured");
    return { pageTexts, warnings, engine };
  }
  if (!pdfRasterizerAvailable()) {
    warnings.push("pdf_ocr_unavailable: pdf rasterizer (pdftoppm) missing");
    return { pageTexts, warnings, engine };
  }

  // Cap the page count so a huge scanned bundle (e.g. a 1 GB / 800-page Akte)
  // can't OCR the whole document inside one extraction. Tune via
  // GBRAIN_OCR_MAX_PAGES; 0/negative disables the cap.
  const rawCap = Number(process.env.GBRAIN_OCR_MAX_PAGES);
  const maxPages = Number.isFinite(rawCap) ? Math.floor(rawCap) : 100;
  const uniqueRequested = [...new Set(requestedPages)]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const perDocument = maxPages > 0 ? uniqueRequested.slice(0, maxPages) : uniqueRequested;
  // Daily per-firm OCR budget (ocr-budget.ts): pages over it stay unread and
  // are reported like the per-document cap.
  const { reserveOcrPages } = await import("./ocr-budget.ts");
  const granted = reserveOcrPages(perDocument.length);
  const pagesToOcr = perDocument.slice(0, granted);
  if (granted < perDocument.length) {
    warnings.push(
      `pdf_ocr_quota_exhausted: daily OCR budget of this firm reached — ${perDocument.length - granted} page(s) left for later`
    );
  }
  if (pagesToOcr.length < uniqueRequested.length) {
    warnings.push(
      `pdf_ocr_partial: only ${pagesToOcr.length} of ${uniqueRequested.length} sparse pages processed`
    );
  }

  // Bounded concurrency; each page gets its own deadline, and the deadline
  // aborts a vision request instead of letting it run (and bill) on.
  const OCR_CONCURRENCY = 4;
  const OCR_PAGE_TIMEOUT_MS = 30_000; // vision model per page
  const pageTimeout = engine === "tesseract" ? 120_000 : OCR_PAGE_TIMEOUT_MS;

  let rasterizer: Awaited<ReturnType<typeof openPdfRasterizer>>;
  try {
    rasterizer = await openPdfRasterizer(pdfBuf);
  } catch {
    warnings.push("pdf_ocr_failed: PDF rasterization failed");
    return { pageTexts, warnings, engine };
  }
  try {
    for (let i = 0; i < pagesToOcr.length; i += OCR_CONCURRENCY) {
      const batch = pagesToOcr.slice(i, i + OCR_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (pageNo) => {
          let image: Buffer;
          try {
            image = await rasterizer.render(pageNo);
          } catch {
            return { pageNo, page: null, error: "produced no image" };
          }
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const outcome = await Promise.race([
              recognizeImage(image, "image/png", { signal: controller.signal }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  controller.abort();
                  reject(new Error("ocr_timeout"));
                }, pageTimeout);
              }),
            ]);
            return { pageNo, page: outcome, error: null as string | null };
          } catch (err) {
            const msg =
              err instanceof Error && err.message === "ocr_timeout" ? "ocr timeout" : "ocr failed";
            return { pageNo, page: null, error: msg };
          } finally {
            if (timer) clearTimeout(timer);
          }
        })
      );
      for (const { pageNo, page, error } of results) {
        if (error === "produced no image") {
          warnings.push(`pdf_ocr_failed: page ${pageNo} produced no image`);
        } else if (error) {
          warnings.push(`pdf_ocr_failed: page ${pageNo} (${error})`);
        } else if (page && page.text.trim()) {
          pageTexts.set(pageNo, { ...page, text: page.text.trim() });
        } else {
          warnings.push(`pdf_ocr_failed: page ${pageNo} returned no text`);
        }
      }
    }
  } finally {
    await rasterizer.close();
  }

  return { pageTexts, warnings, engine };
}

async function extractDocx(
  buf: Buffer,
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<ExtractedDocument> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer: buf });
  const warnings = (result.messages ?? [])
    .filter((m) => m.type === "warning")
    .map((m) => `docx: ${m.message}`);
  const review = await extractDocxReviewLayer(buf);
  const notes = await extractDocxNotes(buf);
  const visual = await extractOfficeMedia(buf, "word/media/", ocrImage);
  const macrosPresent = await containsOfficeMacros(buf);
  warnings.push(...review.warnings);
  warnings.push(...visual.warnings);
  if (macrosPresent)
    warnings.push("office_macros_present: VBA content retained in original but never executed");
  return {
    text: normalizeWhitespace(
      [result.value ?? "", ...notes.sections, ...review.sections, ...visual.sections]
        .filter(Boolean)
        .join("\n\n")
    ),
    frontmatter: {
      type: "document",
      source_format: "docx",
      footnotes_count: notes.footnotes,
      endnotes_count: notes.endnotes,
      comments_count: review.commentsCount,
      tracked_changes_count: review.changesCount,
      redline_detected: review.changesCount > 0 ? "true" : "false",
      embedded_images_count: visual.imageCount,
      visual_ocr_count: visual.ocrCount,
      macros_present: macrosPresent ? "true" : "false",
    },
    warnings,
  };
}

/**
 * Footnotes and endnotes. mammoth's raw-text pass drops them, but in a
 * Schriftsatz or an opinion they carry citations and qualifications.
 * Separator pseudo-notes (w:type="separator"/"continuationSeparator") are
 * skipped; each note keeps its number so the body reference stays traceable.
 */
async function extractDocxNotes(
  buf: Buffer
): Promise<{ sections: string[]; footnotes: number; endnotes: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const read = async (kind: "footnote" | "endnote") => {
    const xml = await zip.file(`word/${kind}s.xml`)?.async("string");
    if (!xml) return [] as string[];
    const out: string[] = [];
    const pattern = new RegExp(`<w:${kind}\\b([^>]*)>([\\s\\S]*?)<\\/w:${kind}>`, "gi");
    for (const match of xml.matchAll(pattern)) {
      if (/w:type="(?:separator|continuationSeparator|continuationNotice)"/i.test(match[1]))
        continue;
      const paragraphs = [...match[2].matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi)]
        .map((p) => xmlText(p[0]).trim())
        .filter(Boolean);
      const text = paragraphs.join(" ").trim();
      if (!text) continue;
      out.push(`[${out.length + 1}] ${text}`);
    }
    return out;
  };
  const [footnotes, endnotes] = await Promise.all([read("footnote"), read("endnote")]);
  const sections: string[] = [];
  if (footnotes.length > 0) sections.push(`## Fußnoten\n\n${footnotes.join("\n")}`);
  if (endnotes.length > 0) sections.push(`## Endnoten\n\n${endnotes.join("\n")}`);
  return { sections, footnotes: footnotes.length, endnotes: endnotes.length };
}

async function containsOfficeMacros(buf: Buffer): Promise<boolean> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    return Object.keys(zip.files).some((name) => /(?:^|\/)vbaProject\.bin$/i.test(name));
  } catch {
    return false;
  }
}

const MAX_OFFICE_MEDIA_IMAGES = 50;
const MAX_OFFICE_MEDIA_BYTES = 50 * 1024 * 1024;

async function extractOfficeMedia(
  buf: Buffer,
  prefix: string,
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<{ sections: string[]; warnings: string[]; imageCount: number; ocrCount: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  assertSafeOfficePackage(zip);
  const names = Object.keys(zip.files)
    .filter(
      (name) =>
        name.startsWith(prefix) && /\.(?:png|jpe?g|gif|tiff?|webp|heic|heif|avif|bmp)$/i.test(name)
    )
    .sort();
  if (!ocrImage || names.length === 0) {
    return {
      sections: [],
      warnings:
        names.length > 0 && !ocrImage
          ? [`office_visuals: ${names.length} embedded image(s), visual OCR unavailable`]
          : [],
      imageCount: names.length,
      ocrCount: 0,
    };
  }
  const sections: string[] = [];
  const warnings: string[] = [];
  let bytes = 0;
  let ocrCount = 0;
  for (const name of names.slice(0, MAX_OFFICE_MEDIA_IMAGES)) {
    const data = await zip.file(name)!.async("nodebuffer");
    if (bytes + data.byteLength > MAX_OFFICE_MEDIA_BYTES) {
      warnings.push("office_visuals_partial: embedded-image byte budget reached");
      break;
    }
    bytes += data.byteLength;
    const extension = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ".png";
    try {
      const text = await ocrImage(data, extension);
      if (text.trim()) {
        sections.push(
          `## Visueller Inhalt: ${name}\n\n${withUnverifiedBanner(text.trim(), "ocr_vision")}`
        );
        ocrCount += 1;
      }
    } catch {
      warnings.push(`office_visual_ocr_failed: ${name}`);
    }
  }
  if (names.length > MAX_OFFICE_MEDIA_IMAGES) {
    warnings.push(
      `office_visuals_partial: only first ${MAX_OFFICE_MEDIA_IMAGES} of ${names.length} images processed`
    );
  }
  return { sections, warnings, imageCount: names.length, ocrCount };
}

function xmlText(xml: string, includeDeleted = false): string {
  const pattern = includeDeleted
    ? /<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/g
    : /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  return [...xml.matchAll(pattern)].map((match) => decodeXmlEntities(match[1])).join("");
}

function xmlAttribute(openingTag: string, name: string): string | undefined {
  const match = openingTag.match(new RegExp(`(?:w:)?${name}="([^"]*)"`, "i"));
  return match ? decodeXmlEntities(match[1]) : undefined;
}

async function extractDocxReviewLayer(buf: Buffer): Promise<{
  sections: string[];
  warnings: string[];
  commentsCount: number;
  changesCount: number;
}> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  assertSafeOfficePackage(zip);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return { sections: [], warnings: [], commentsCount: 0, changesCount: 0 };

  const changes: string[] = [];
  const revisionKinds = [
    { tag: "ins", label: "Eingefügt", deleted: false },
    { tag: "del", label: "Gelöscht", deleted: true },
    { tag: "moveFrom", label: "Verschoben von", deleted: true },
    { tag: "moveTo", label: "Verschoben nach", deleted: false },
  ] as const;
  for (const kind of revisionKinds) {
    const regex = new RegExp(`<w:${kind.tag}\\b([^>]*)>([\\s\\S]*?)<\\/w:${kind.tag}>`, "gi");
    for (const match of documentXml.matchAll(regex)) {
      const text = xmlText(match[2], kind.deleted).trim();
      if (!text) continue;
      const author = xmlAttribute(match[1], "author");
      const date = xmlAttribute(match[1], "date");
      changes.push(
        `- **${kind.label}:** ${text}${author ? ` — ${author}` : ""}${date ? ` (${date})` : ""}`
      );
    }
  }
  const formattingChanges = [
    ...documentXml.matchAll(/<w:(?:rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange)\b/gi),
  ].length;
  if (formattingChanges > 0) changes.push(`- **Formatänderungen:** ${formattingChanges}`);

  const comments: string[] = [];
  const commentsXml = await zip.file("word/comments.xml")?.async("string");
  if (commentsXml) {
    for (const match of commentsXml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/gi)) {
      const text = xmlText(match[2]).trim();
      if (!text) continue;
      const author = xmlAttribute(match[1], "author");
      const date = xmlAttribute(match[1], "date");
      const id = xmlAttribute(match[1], "id");
      comments.push(
        `- ${id ? `[#${id}] ` : ""}${text}${author ? ` — ${author}` : ""}${date ? ` (${date})` : ""}`
      );
    }
  }

  const sections: string[] = [];
  if (changes.length > 0)
    sections.push(`## Änderungsverfolgung / Redline\n\n${changes.join("\n")}`);
  if (comments.length > 0) sections.push(`## Word-Kommentare\n\n${comments.join("\n")}`);
  return {
    sections,
    warnings:
      changes.length > 0 || comments.length > 0
        ? ["docx_review_layer: comments and tracked changes preserved in searchable text"]
        : [],
    commentsCount: comments.length,
    changesCount: changes.length,
  };
}

const MAX_EMAIL_ATTACHMENT_DEPTH = 2;
const MAX_EMAIL_ATTACHMENTS = 100;
const MAX_EMAIL_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_SINGLE_EMAIL_ATTACHMENT_BYTES = 50 * 1024 * 1024;

async function extractAttachmentSections(
  attachments: Array<{ filename?: string | null; content: Buffer }>,
  depth: number,
  password?: string,
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<{ sections: string[]; warnings: string[] }> {
  const sections: string[] = [];
  const warnings: string[] = [];
  if (depth >= MAX_EMAIL_ATTACHMENT_DEPTH) {
    if (attachments.length) warnings.push("email: nested attachment depth limit reached");
    return { sections, warnings };
  }
  let totalBytes = 0;
  for (const attachment of attachments.slice(0, MAX_EMAIL_ATTACHMENTS)) {
    const filename = attachment.filename?.trim() || "attachment";
    if (
      attachment.content.byteLength > MAX_SINGLE_EMAIL_ATTACHMENT_BYTES ||
      totalBytes + attachment.content.byteLength > MAX_EMAIL_ATTACHMENT_BYTES
    ) {
      warnings.push(`email attachment skipped by size budget: ${filename}`);
      continue;
    }
    totalBytes += attachment.content.byteLength;
    const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
    try {
      if (ext === ".zip") {
        const { readSafeZipEntries } = await import("./archive-upload.ts");
        const archive = await readSafeZipEntries(attachment.content, { depth });
        const nested = await extractAttachmentSections(
          archive.entries.map((entry) => ({ filename: entry.name, content: entry.data })),
          depth + 1,
          password,
          ocrImage
        );
        if (nested.sections.length)
          sections.push(`## Attachment: ${filename}\n\n${nested.sections.join("\n\n")}`);
        warnings.push(...nested.warnings);
      } else if (isDocumentFilePath(filename)) {
        const extracted = await extractDocumentText(attachment.content, ext, {
          filename,
          attachmentDepth: depth + 1,
          password,
          ocrImage,
        });
        sections.push(
          `## Attachment: ${filename}\n\n${extracted.text || "[Kein Text extrahiert]"}`
        );
        warnings.push(...extracted.warnings.map((warning) => `${filename}: ${warning}`));
      } else if (ocrImage && /\.(?:png|jpe?g|gif|tiff?|webp|heic|heif|avif|bmp)$/i.test(filename)) {
        const text = await ocrImage(attachment.content, ext);
        if (text.trim()) {
          sections.push(
            `## Attachment: ${filename}\n\n${withUnverifiedBanner(text.trim(), "ocr_vision")}`
          );
        } else {
          warnings.push(`email image attachment OCR returned no text: ${filename}`);
        }
      } else {
        warnings.push(`email attachment unsupported for text extraction: ${filename}`);
      }
    } catch (error) {
      warnings.push(
        `email attachment extraction failed: ${filename} (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }
  if (attachments.length > MAX_EMAIL_ATTACHMENTS) {
    warnings.push(`email: only first ${MAX_EMAIL_ATTACHMENTS} attachments processed`);
  }
  return { sections, warnings };
}

async function extractEml(
  buf: Buffer,
  depth: number,
  password?: string,
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<ExtractedDocument> {
  const PostalMime = (await import("postal-mime")).default;
  const parsed = await PostalMime.parse(buf);
  const frontmatter: Record<string, string | number> = { type: "email", source_format: "eml" };
  if (parsed.subject) frontmatter.title = parsed.subject;
  if (parsed.date) {
    const d = new Date(parsed.date);
    if (!Number.isNaN(d.getTime())) frontmatter.date = d.toISOString().slice(0, 10);
  }

  const addr = (a?: { name?: string; address?: string } | null) =>
    a ? (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "")) : "";
  const addrList = (list?: { name?: string; address?: string }[]) =>
    (list ?? [])
      .map((a) => addr(a))
      .filter(Boolean)
      .join(", ");

  const headerLines = [
    parsed.from ? `**From:** ${addr(parsed.from)}` : "",
    addrList(parsed.to) ? `**To:** ${addrList(parsed.to)}` : "",
    addrList(parsed.cc) ? `**Cc:** ${addrList(parsed.cc)}` : "",
    parsed.date ? `**Date:** ${parsed.date}` : "",
    parsed.subject ? `**Subject:** ${parsed.subject}` : "",
  ].filter(Boolean);

  // Prefer the plain-text part; fall back to a tag-stripped HTML body.
  let body = (parsed.text ?? "").trim();
  if (!body && parsed.html) {
    body = htmlToText(parsed.html);
  }

  const warnings: string[] = [];
  const attachmentResult = await extractAttachmentSections(
    (parsed.attachments ?? []).map((attachment) => ({
      filename: attachment.filename,
      content:
        typeof attachment.content === "string"
          ? Buffer.from(attachment.content, attachment.encoding === "base64" ? "base64" : "utf8")
          : attachment.content instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(attachment.content))
            : Buffer.from(attachment.content),
    })),
    depth,
    password,
    ocrImage
  );
  warnings.push(...attachmentResult.warnings);

  const text = [headerLines.join("\n"), body ? `\n${body}` : "", ...attachmentResult.sections]
    .join("\n\n")
    .trim();
  frontmatter.attachment_count = parsed.attachments?.length ?? 0;
  return { text: normalizeWhitespace(text), frontmatter, warnings };
}

async function extractMsg(
  buf: Buffer,
  depth: number,
  password?: string,
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<ExtractedDocument> {
  const MsgReader = (await import("@npeersab/msgreader")).default;
  const bytes = Uint8Array.from(buf);
  const reader = new MsgReader(bytes.buffer as ArrayBuffer);
  const parsed = reader.getFileData();
  if (parsed.error) throw new Error(`msg: ${parsed.error}`);

  const recipients = (parsed.recipients ?? [])
    .map((entry) => entry.name || entry.email)
    .filter(Boolean)
    .join(", ");
  const sender = parsed.senderName
    ? `${parsed.senderName}${parsed.senderEmail ? ` <${parsed.senderEmail}>` : ""}`
    : parsed.senderEmail;
  const date = parsed.headers?.match(/^Date:\s*(.+)$/im)?.[1]?.trim();
  const lines = [
    sender ? `**From:** ${sender}` : "",
    recipients ? `**To:** ${recipients}` : "",
    date ? `**Date:** ${date}` : "",
    parsed.subject ? `**Subject:** ${parsed.subject}` : "",
    parsed.body?.trim() ? `\n${parsed.body.trim()}` : "",
  ].filter(Boolean);
  const attachmentResult = await extractAttachmentSections(
    (parsed.attachments ?? []).map((entry, index) => {
      const attachment = reader.getAttachment(index);
      return {
        filename: attachment.fileName || entry.fileName || entry.fileNameShort,
        content: Buffer.from(attachment.content),
      };
    }),
    depth,
    password,
    ocrImage
  );
  lines.push(...attachmentResult.sections);
  return {
    text: normalizeWhitespace(lines.join("\n")),
    frontmatter: {
      type: "email",
      source_format: "msg",
      ...(parsed.subject ? { title: parsed.subject } : {}),
      ...(date && !Number.isNaN(new Date(date).getTime())
        ? { date: new Date(date).toISOString().slice(0, 10) }
        : {}),
      attachment_count: parsed.attachments?.length ?? 0,
    },
    warnings: attachmentResult.warnings,
  };
}

const MAX_PST_BYTES = 500 * 1024 * 1024;
const MAX_PST_MESSAGES = 5_000;
const MAX_PST_OUTPUT_BYTES = 500 * 1024 * 1024;
const MAX_PST_TEXT_CHARS = 25_000_000;
// G20 fix: cap directory traversal to prevent unbounded recursion / FD
// exhaustion from malicious or malformed PST extractions.
const MAX_PST_FILES = 50_000;
const MAX_PST_DEPTH = 32;

async function listFilesRecursive(root: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const files: string[] = [];
  // Track depth alongside each directory to enforce MAX_PST_DEPTH.
  const pending: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (pending.length > 0) {
    const { dir, depth } = pending.pop()!;
    if (depth > MAX_PST_DEPTH) {
      console.warn(`[listFilesRecursive] max depth ${MAX_PST_DEPTH} exceeded at ${dir}`);
      continue;
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile()) {
        files.push(full);
        if (files.length > MAX_PST_FILES) {
          console.warn(`[listFilesRecursive] max files ${MAX_PST_FILES} exceeded, truncating`);
          return files.sort();
        }
      }
    }
  }
  return files.sort();
}

async function extractPst(
  buf: Buffer,
  filename = "archive.pst",
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<ExtractedDocument> {
  if (buf.byteLength > MAX_PST_BYTES) {
    throw new Error(`pst: file exceeds ${MAX_PST_BYTES / 1024 / 1024} MB`);
  }
  const { mkdtemp, mkdir, writeFile, readFile, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, basename, extname } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "subsumio-pst-"));
  const outputDir = join(dir, "output");
  await mkdir(outputDir);
  const input = join(dir, basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_") || "archive.pst");
  await writeFile(input, buf, { mode: 0o600 });
  try {
    const { converterEnv, limitedArgv } = await import("./converter-sandbox.ts");
    const proc = Bun.spawn(
      limitedArgv(["readpst", "-e", "-8", "-j", "1", "-q", "-o", outputDir, input], {
        cpuSeconds: 10 * 60,
        maxFileBytes: MAX_PST_BYTES,
      }),
      {
        stdout: "pipe",
        stderr: "pipe",
        env: converterEnv(dir),
      }
    );
    const timeout = setTimeout(() => proc.kill("SIGKILL"), 5 * 60_000);
    const exitCode = await proc.exited;
    clearTimeout(timeout);
    const stderr = await new Response(proc.stderr).text();
    if (exitCode !== 0) {
      if (/password|encrypt/i.test(stderr)) throw new PasswordRequiredError("pst");
      throw new Error(`pst: readpst failed (${exitCode}): ${stderr.slice(0, 500)}`);
    }

    const files = await listFilesRecursive(outputDir);
    const emailFiles = files.filter((file) => extname(file).toLowerCase() === ".eml");
    const auxiliaryFiles = files.filter((file) =>
      [".ics", ".vcf"].includes(extname(file).toLowerCase())
    );
    let outputBytes = 0;
    let textChars = 0;
    let processed = 0;
    const sections: string[] = [];
    const warnings: string[] = [];
    for (const file of emailFiles.slice(0, MAX_PST_MESSAGES)) {
      const size = (await stat(file)).size;
      if (outputBytes + size > MAX_PST_OUTPUT_BYTES || textChars >= MAX_PST_TEXT_CHARS) {
        warnings.push("pst_partial: output budget reached; remaining messages were not extracted");
        break;
      }
      outputBytes += size;
      const extracted = await extractEml(await readFile(file), 0, undefined, ocrImage);
      const relative = file.slice(outputDir.length + 1);
      sections.push(`## PST-Nachricht: ${relative}\n\n${extracted.text}`);
      warnings.push(...extracted.warnings.map((warning) => `${relative}: ${warning}`));
      textChars += extracted.text.length;
      processed += 1;
    }
    for (const file of auxiliaryFiles.slice(0, 500)) {
      const content = (await readFile(file, "utf8")).slice(0, 500_000);
      sections.push(`## PST-Element: ${file.slice(outputDir.length + 1)}\n\n${content}`);
    }
    if (emailFiles.length > MAX_PST_MESSAGES) {
      warnings.push(
        `pst_partial: only first ${MAX_PST_MESSAGES} of ${emailFiles.length} messages processed`
      );
    }
    if (sections.length === 0)
      throw new Error("pst: no readable messages or calendar/contact items found");
    return {
      text: sections.join("\n\n"),
      frontmatter: {
        type: "email_archive",
        source_format: "pst",
        messages_total: emailFiles.length,
        messages_processed: processed,
        auxiliary_items: auxiliaryFiles.length,
      },
      warnings,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function extractDelimited(
  buf: Buffer,
  ext: ".csv" | ".tsv",
  filename?: string
): Promise<ExtractedDocument> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer", raw: false });
  const text = renderWorkbookWithProvenance(XLSX, wb);
  return {
    text,
    frontmatter: {
      type: "document",
      source_format: ext.slice(1),
      ...(filename ? { title: filename } : {}),
    },
    warnings: [],
  };
}

async function extractWorkbook(buf: Buffer, ext: string): Promise<ExtractedDocument> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true });
  const macrosPresent = await containsOfficeMacros(buf);
  return {
    text: renderWorkbookWithProvenance(XLSX, wb),
    frontmatter: {
      type: "document",
      source_format: ext.slice(1),
      sheets: wb.SheetNames.length,
      macros_present: macrosPresent ? "true" : "false",
    },
    warnings: macrosPresent
      ? ["office_macros_present: VBA content retained in original but never executed"]
      : [],
  };
}

function renderWorkbookWithProvenance(
  XLSX: typeof import("xlsx"),
  wb: import("xlsx").WorkBook
): string {
  const sections: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rangeText = sheet["!ref"];
    if (!rangeText) continue;
    const range = XLSX.utils.decode_range(rangeText);
    const rows: string[] = [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cells: string[] = [];
      for (let column = range.s.c; column <= range.e.c; column++) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = sheet[address];
        if (!cell || cell.v === undefined || cell.v === null || cell.v === "") continue;
        const display = typeof cell.w === "string" ? cell.w : String(cell.v);
        const formula = typeof cell.f === "string" ? ` [Formel: =${cell.f}]` : "";
        cells.push(`${address}=${JSON.stringify(display)}${formula}`);
      }
      if (cells.length > 0) rows.push(`- **Zeile ${row + 1}:** ${cells.join("; ")}`);
    }
    if (rows.length > 0) {
      sections.push(`## Sheet: ${name}\n\nBereich: ${rangeText}\n\n${rows.join("\n")}`);
    }
  }
  return sections.join("\n\n");
}

// RTF destinations whose content is metadata, not document text.
const RTF_SKIP_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "listtable",
  "listoverridetable",
  "revtbl",
  "rsidtbl",
  "generator",
  "xmlnstbl",
  "latentstyles",
  "datastore",
  "themedata",
  "colorschememapping",
  "pict",
  "object",
  "header",
  "headerl",
  "headerr",
  "headerf",
  "footer",
  "footerl",
  "footerr",
  "footerf",
  "fldinst",
  "pgdsctbl",
  "filetbl",
  "operator",
  "company",
  "title",
  "author",
]);

/**
 * Minimal RTF → text: a real tokenizer instead of regex passes, so
 *  - font/style/info tables and `{\*…}` destinations never leak as text,
 *  - `\uN` honours `\ucN` and skips its ANSI fallback (no doubled umlauts,
 *    no "§§" for one "§"),
 *  - runs marked `\deleted` (tracked deletions) are left out of the body.
 * Used only when LibreOffice is unavailable.
 */
export function rtfToText(source: string): string {
  type State = { skip: boolean; uc: number; deleted: boolean };
  const stack: State[] = [];
  let state: State = { skip: false, uc: 1, deleted: false };
  let out = "";
  let pendingSkip = 0;
  let i = 0;
  const emit = (text: string) => {
    if (pendingSkip > 0) {
      const drop = Math.min(pendingSkip, text.length);
      pendingSkip -= drop;
      text = text.slice(drop);
    }
    if (!state.skip && !state.deleted) out += text;
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === "{") {
      stack.push(state);
      state = { ...state };
      pendingSkip = 0;
      i += 1;
      if (source.startsWith("\\*", i)) {
        state.skip = true;
        i += 2;
      }
      continue;
    }
    if (ch === "}") {
      state = stack.pop() ?? { skip: false, uc: 1, deleted: false };
      pendingSkip = 0;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      const next = source[i + 1];
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4);
        i += 4;
        if (pendingSkip > 0) {
          pendingSkip -= 1;
          continue;
        }
        emit(Buffer.from([Number.parseInt(hex, 16) || 0x3f]).toString("latin1"));
        continue;
      }
      if (next === "\\" || next === "{" || next === "}") {
        emit(next);
        i += 2;
        continue;
      }
      if (next === "~") {
        emit("\u00a0");
        i += 2;
        continue;
      }
      if (next === "-" || next === "_") {
        if (next === "_") emit("-");
        i += 2;
        continue;
      }
      const match = /^([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(i + 1, i + 40));
      if (!match) {
        i += 2;
        continue;
      }
      const word = match[1];
      const param = match[2] !== undefined ? Number(match[2]) : undefined;
      i += 1 + match[0].length;
      if (RTF_SKIP_DESTINATIONS.has(word)) {
        state.skip = true;
        continue;
      }
      switch (word) {
        case "par":
        case "line":
        case "sect":
        case "page":
          emit("\n");
          break;
        case "tab":
        case "cell":
          emit("\t");
          break;
        case "row":
          emit("\n");
          break;
        case "uc":
          state.uc = param ?? 1;
          break;
        case "u": {
          const code = (param ?? 0) < 0 ? (param ?? 0) + 65536 : (param ?? 0);
          emit(String.fromCharCode(code));
          pendingSkip = state.uc;
          break;
        }
        case "deleted":
          state.deleted = param !== 0;
          break;
        case "plain":
          state.deleted = false;
          break;
        case "emdash":
          emit("—");
          break;
        case "endash":
          emit("–");
          break;
        case "lquote":
          emit("‘");
          break;
        case "rquote":
          emit("’");
          break;
        case "ldblquote":
          emit("„");
          break;
        case "rdblquote":
          emit("“");
          break;
        case "bullet":
          emit("•");
          break;
        default:
          break;
      }
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      i += 1;
      continue;
    }
    emit(ch);
    i += 1;
  }
  return out;
}

async function extractRtf(buf: Buffer): Promise<ExtractedDocument> {
  return {
    text: normalizeWhitespace(rtfToText(buf.toString("latin1"))),
    frontmatter: { type: "document", source_format: "rtf" },
    warnings: [],
  };
}

async function extractPptx(
  buf: Buffer,
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<ExtractedDocument> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  assertSafeOfficePackage(zip);
  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1]));
  const sections: string[] = [];
  for (let index = 0; index < slides.length; index++) {
    const xml = await zip.file(slides[index])!.async("string");
    const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlEntities(match[1]))
      .join("\n");
    if (text.trim()) sections.push(`## Slide ${index + 1}\n\n${text.trim()}`);
  }
  const visual = await extractOfficeMedia(buf, "ppt/media/", ocrImage);
  const macrosPresent = await containsOfficeMacros(buf);
  sections.push(...visual.sections);
  return {
    text: normalizeWhitespace(sections.join("\n\n")),
    frontmatter: {
      type: "document",
      source_format: "pptx",
      slides: slides.length,
      embedded_images_count: visual.imageCount,
      visual_ocr_count: visual.ocrCount,
      macros_present: macrosPresent ? "true" : "false",
    },
    warnings: [
      ...visual.warnings,
      ...(macrosPresent
        ? ["office_macros_present: VBA content retained in original but never executed"]
        : []),
    ],
  };
}

async function extractOdt(buf: Buffer): Promise<ExtractedDocument> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  assertSafeOfficePackage(zip);
  const xml = await zip.file("content.xml")?.async("string");
  if (!xml) throw new Error("odt: content.xml missing");
  const text = decodeXmlEntities(
    xml
      .replace(/<text:(?:p|h)\b[^>]*>/g, "\n")
      .replace(/<text:tab\b[^>]*\/?\s*>/g, "\t")
      .replace(/<text:line-break\b[^>]*\/?\s*>/g, "\n")
      .replace(/<[^>]+>/g, "")
  );
  return {
    text: normalizeWhitespace(text),
    frontmatter: { type: "document", source_format: "odt" },
    warnings: [],
  };
}

async function extractNumbers(buf: Buffer, filename?: string): Promise<ExtractedDocument> {
  const converted = await convertWithLibreOffice(buf, ".numbers", filename, "xlsx");
  return extractWorkbook(converted, ".numbers");
}

async function extractWordProcessorDocument(
  buf: Buffer,
  ext: ".doc" | ".rtf" | ".odt",
  filename: string | undefined,
  ocrImage?: (data: Buffer, extension: string) => Promise<string>
): Promise<ExtractedDocument> {
  let docx: Buffer;
  try {
    docx = await convertWithLibreOffice(buf, ext, filename, "docx");
  } catch (error) {
    // Hosts without LibreOffice: RTF and ODT have built-in fallbacks.
    if (ext === ".rtf" || ext === ".odt") {
      const fallback = ext === ".rtf" ? await extractRtf(buf) : await extractOdt(buf);
      fallback.warnings.push(
        `${ext.slice(1)}_fallback_parser: LibreOffice conversion unavailable (${error instanceof Error ? error.message : String(error)}); tracked changes and footnotes may be incomplete`
      );
      return fallback;
    }
    throw error;
  }
  const extracted = await extractDocx(docx, ocrImage);
  extracted.frontmatter.source_format = ext.slice(1);
  extracted.frontmatter.converted_via = "libreoffice";
  return extracted;
}

async function extractViaLibreOffice(
  buf: Buffer,
  ext: string,
  filename?: string
): Promise<ExtractedDocument> {
  const pdf = await convertWithLibreOffice(buf, ext, filename, "pdf");
  const extracted = await extractPdf(pdf);
  extracted.frontmatter.source_format = ext.slice(1);
  extracted.frontmatter.converted_via = "libreoffice";
  return extracted;
}

async function convertWithLibreOffice(
  buf: Buffer,
  ext: string,
  filename: string | undefined,
  target: "pdf" | "xlsx" | "docx"
): Promise<Buffer> {
  const { mkdtemp, mkdir, writeFile, readFile, rm, readdir, stat } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, basename } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "subsumio-office-"));
  const inputDir = join(dir, "input");
  const outputDir = join(dir, "output");
  const profileDir = join(dir, "profile");
  await Promise.all([mkdir(inputDir), mkdir(outputDir), mkdir(profileDir)]);
  const safeBase = basename(filename || `document${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const input = join(
    inputDir,
    safeBase.toLowerCase().endsWith(ext) ? safeBase : `${safeBase}${ext}`
  );
  await writeFile(input, buf);
  try {
    const { converterEnv, limitedArgv } = await import("./converter-sandbox.ts");
    const proc = Bun.spawn(
      limitedArgv(
        [
          "soffice",
          "--headless",
          "--nologo",
          "--nodefault",
          "--nofirststartwizard",
          `-env:UserInstallation=file://${profileDir}`,
          "--convert-to",
          target,
          "--outdir",
          outputDir,
          input,
        ],
        { cpuSeconds: 120, maxFileBytes: 2 * MAX_DOCUMENT_FILE_SIZE }
      ),
      { stdout: "pipe", stderr: "pipe", env: converterEnv(dir) }
    );
    const timeout = setTimeout(() => proc.kill("SIGKILL"), 60_000);
    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]).finally(() => clearTimeout(timeout));
    const files = await readdir(outputDir);
    const output = files.find((name) => name.toLowerCase().endsWith(`.${target}`));
    if (exitCode !== 0 || !output) {
      throw new Error(
        `LibreOffice could not convert ${ext}${stderr.trim() ? `: ${stderr.trim()}` : ""}`
      );
    }
    const outputPath = join(outputDir, output);
    if ((await stat(outputPath)).size > MAX_DOCUMENT_FILE_SIZE) {
      throw new Error(`Converted ${target} exceeds the ${MAX_DOCUMENT_FILE_SIZE} byte limit`);
    }
    return await readFile(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Format ${ext} requires LibreOffice on the engine host`);
    }
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertSafeOfficePackage(zip: import("jszip")): void {
  const entries = Object.values(zip.files);
  if (entries.length > 10_000) throw new Error("Office package contains too many entries");
  let expandedBytes = 0;
  for (const entry of entries) {
    const size = Number(
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    );
    if (size > MAX_DOCUMENT_FILE_SIZE) throw new Error("Office package entry is too large");
    expandedBytes += size;
    if (expandedBytes > 200_000_000) throw new Error("Office package expands beyond 200 MB");
  }
}

// Named HTML entities that occur in German legal e-mail bodies. Numeric
// entities are decoded generically; unknown names are left as written.
const HTML_ENTITIES: Record<string, string> = {
  nbsp: "\u00a0",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  sect: "§",
  para: "¶",
  euro: "€",
  copy: "©",
  reg: "®",
  deg: "°",
  middot: "·",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  laquo: "«",
  raquo: "»",
  times: "×",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  agrave: "à",
  oacute: "ó",
  iacute: "í",
  uacute: "ú",
  ccedil: "ç",
  ntilde: "ñ",
  shy: "",
  zwnj: "",
  zwj: "",
  bull: "•",
};

/**
 * HTML e-mail body → readable text: block elements become line breaks,
 * table cells tabs, all entities decoded ("Gem&auml;&szlig; &sect; 1380"
 * → "Gemäß § 1380").
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, "\t")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote|table|section|article)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => HTML_ENTITIES[name] ?? match)
    .replace(/&#(\d+);/g, (_m, raw: string) => String.fromCodePoint(Number(raw)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, raw: string) =>
      String.fromCodePoint(Number.parseInt(raw, 16))
    )
    .replace(/[ \t\u00a0]*\n[ \t\u00a0]*/g, "\n")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, raw: string) => String.fromCodePoint(Number(raw)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, raw: string) =>
      String.fromCodePoint(Number.parseInt(raw, 16))
    );
}

// v0.43.0: audio transcription via existing transcription.ts
async function extractAudio(buf: Buffer, filename: string): Promise<ExtractedDocument> {
  const { transcribeBuffer } = await import("./transcription.ts");
  const result = await transcribeBuffer(buf, filename);
  const lines: string[] = [];
  if (result.segments.length > 0) {
    lines.push("## Transcription");
    for (const seg of result.segments) {
      const start = formatTimestamp(seg.start);
      lines.push(`**[${start}]** ${seg.text}`);
    }
  } else {
    lines.push(result.text);
  }
  return {
    text: withUnverifiedBanner(lines.join("\n\n"), "audio_transcription"),
    frontmatter: {
      type: "transcription",
      source_format: "audio",
      language: result.language,
      duration: result.duration,
      provider: result.provider,
      extraction_method: "audio_transcription",
      extraction_unverified: "true",
    },
    warnings: [],
  };
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Build the full markdown (frontmatter + body) importFromContent expects.
 * No `slug:` is ever emitted — importFromFile's anti-spoof check requires
 * the slug to stay path-derived.
 */
export async function synthesizeDocumentMarkdown(
  relativePath: string,
  extracted: ExtractedDocument
): Promise<string> {
  const fm: Record<string, string | number> = { ...extracted.frontmatter };
  if (!fm.extraction_method) fm.extraction_method = "native_parser";

  // v0.46: Classify extracted text at upload time so the correct legal chunker
  // is selected during import. Without this, all uploads get type:"document"
  // and fall through to the generic recursive chunker (300-word arbitrary
  // splits) — court decisions lose their Rechtssatz/Leitsatz/Entscheidungstext
  // structure, contracts lose their clause boundaries. The doc-classifier is
  // deterministic (keyword heuristics, $0 LLM cost) and runs in <1ms.
  //
  // We only override type if the uploader didn't set an explicit type (e.g.
  // "law" for statute uploads, "court_decision" for known judgments). The
  // heuristic classification is stamped as doc_type regardless, so the
  // pipeline's Layer 0 doc-classifier can see it and skip re-classification.
  // Extractors stamp the generic `type: "document"` — that is "no explicit
  // type", not an uploader choice, so it must not switch classification off
  // (it did for every PDF/DOCX/RTF/ODT/XLSX upload).
  if (extracted.text.trim().length > 50 && (!fm.type || fm.type === "document")) {
    try {
      const { classifyLegalDocument } = await import("./legal/doc-classifier.ts");
      const classification = classifyLegalDocument(extracted.text);
      if (classification.confidence > 0) {
        fm.doc_type = classification.type;
        // Map court-judgment/court-order to court_decision so the structure-
        // aware legal-decision chunker is used (Rechtssatz/Leitsatz/etc.).
        if (classification.type === "court_judgment" || classification.type === "court_order") {
          fm.type = "court_decision";
        }
      }
    } catch {
      // Classification is best-effort — never fail an upload because of it.
    }
  }
  const sparseWithoutOcr =
    extracted.warnings.some((warning) => warning.startsWith("pdf_text_layer_sparse")) &&
    fm.extraction_method !== "ocr_vision";
  const partial = extracted.warnings.some((warning) =>
    /begrenzt|partial|failed|unavailable|unsupported|skipped|not extracted/i.test(warning)
  );
  fm.extraction_status = !extracted.text.trim()
    ? "failed"
    : sparseWithoutOcr || partial
      ? "partial"
      : "ready";
  fm.extraction_char_count = extracted.text.length;
  // OCR backfill signal: stamp ocr_status so a backfill sweeper can find
  // documents where OCR was needed but failed/unavailable. Without this,
  // scanned PDFs that couldn't be OCR'd are silently stuck with no text.
  const ocrUnavailable = extracted.warnings.some((w) => w.startsWith("pdf_ocr_unavailable"));
  const ocrFailed = extracted.warnings.some((w) => w.startsWith("pdf_ocr_failed"));
  const ocrQuota = extracted.warnings.some((w) => w.startsWith("pdf_ocr_quota_exhausted"));
  if (ocrUnavailable || ocrFailed || ocrQuota) {
    fm.ocr_status = "needs_backfill";
    fm.ocr_backfill_reason = ocrQuota
      ? "ocr_quota_exhausted"
      : ocrUnavailable
        ? extracted.warnings.some((w) => w.includes("rasterizer"))
          ? "rasterizer_missing"
          : "ocr_engine_missing"
        : "ocr_failed";
  } else if (fm.extraction_method === "ocr_vision") {
    fm.ocr_status = "completed";
  }
  if (extracted.warnings.length > 0) {
    fm.extraction_warning_count = extracted.warnings.length;
    fm.extraction_warnings = extracted.warnings.join(" | ").slice(0, 4000);
  }
  if (!extracted.text.trim()) fm.extraction_error = "Kein durchsuchbarer Text extrahiert.";
  if (!fm.title) {
    const base = relativePath.split("/").pop() ?? relativePath;
    fm.title = base.replace(/\.[a-z0-9]+$/i, "");
  }
  const lines = Object.entries(fm).map(([k, v]) =>
    typeof v === "number" ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`
  );
  const body =
    extracted.text.trim() ||
    "> ⚠️ Die Originaldatei wurde gespeichert, aber es konnte kein durchsuchbarer Text extrahiert werden.";
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

/**
 * Repair German Umlaut encoding artifacts that are unambiguous:
 *
 * 1. NFC normalization — combines decomposed diacritics (u + U+0308 → ü).
 * 2. UTF-8-read-as-Latin-1 mojibake ("Ã¼" → "ü", "Â§" → "§"); longer
 *    sequences are replaced first so "â€œ" becomes "“", not "“œ".
 *
 * Deliberately NOT done: guessing lost umlauts from word lists ("M ller" →
 * "Müller") — that invents text ("Fr ha" is not "Frage") in a legal
 * document — and deleting U+FFFD, which is the visible sign of an
 * unreadable glyph and lets the PDF path detect a broken text layer and OCR
 * the page instead.
 */
const MOJIBAKE_MAP: Array<[string, string]> = [
  ["\u00E2\u20AC\u0153", "\u201C"],
  ["\u00E2\u20AC\u009D", "\u201D"],
  ["\u00E2\u20AC\u201C", "\u2013"],
  ["\u00E2\u20AC\u201D", "\u2014"],
  ["\u00E2\u20AC\u017E", "\u201E"],
  ["\u00E2\u20AC\u02DC", "\u2018"],
  ["\u00E2\u20AC\u2122", "\u2019"],
  ["Ã¼", "ü"],
  ["Ã¶", "ö"],
  ["Ã¤", "ä"],
  ["Ãœ", "Ü"],
  ["Ã–", "Ö"],
  ["Ã„", "Ä"],
  ["ÃŸ", "ß"],
  ["Ã¡", "á"],
  ["Ã©", "é"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ãº", "ú"],
  ["Ã±", "ñ"],
  ["Â§", "§"],
  ["Â¶", "¶"],
  ["Â°", "°"],
];

function fixGermanUmlauts(text: string): string {
  let result = text.normalize("NFC");
  for (const [broken, fixed] of MOJIBAKE_MAP) {
    if (result.includes(broken)) result = result.split(broken).join(fixed);
  }
  return result;
}

/** Collapse runaway blank lines and strip trailing space; keep paragraphs. */
function normalizeWhitespace(text: string): string {
  return fixGermanUmlauts(
    text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
