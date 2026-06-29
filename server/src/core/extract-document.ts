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
 * Scanned PDFs (no text layer) are detected and OCR'd via pdf2pic +
 * vision model. The extraction returns a `pdf_text_layer_sparse` warning,
 * then attempts automatic OCR fallback. If OCR dependencies are missing,
 * the warning explains what to install (poppler-utils / poppler via brew).
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
  if (!password) throw new PasswordRequiredError("pdf");
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
      writeFile(passwordFile, password, { mode: 0o600 }),
    ]);
    const proc = Bun.spawn(
      ["qpdf", `--password-file=${passwordFile}`, "--decrypt", input, output],
      { stdout: "ignore", stderr: "pipe" }
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new InvalidDocumentPasswordError("pdf");
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Average chars-per-page below which a PDF is considered scan-only. */
const PDF_SPARSE_TEXT_CHARS_PER_PAGE = 32;

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
  switch (lowered) {
    case ".pdf":
      return extractPdf(decrypted);
    case ".docx":
    case ".docm": {
      const extracted = await extractDocx(decrypted, opts.ocrImage);
      extracted.frontmatter.source_format = lowered.slice(1);
      return extracted;
    }
    case ".doc":
    case ".ppt":
    case ".odp":
    case ".pages":
    case ".key":
      return extractViaLibreOffice(decrypted, lowered, opts.filename);
    case ".eml":
      return extractEml(buf, opts.attachmentDepth ?? 0, opts.password, opts.ocrImage);
    case ".msg":
      return extractMsg(buf, opts.attachmentDepth ?? 0, opts.password, opts.ocrImage);
    case ".pst":
      return extractPst(buf, opts.filename, opts.ocrImage);
    case ".csv":
    case ".tsv":
      return extractDelimited(buf, lowered, opts.filename);
    case ".xlsx":
    case ".xlsm":
    case ".xls":
    case ".ods":
      return extractWorkbook(decrypted, lowered);
    case ".numbers":
      return extractNumbers(buf, opts.filename);
    case ".rtf":
      return extractRtf(buf);
    case ".pptx":
    case ".pptm": {
      const extracted = await extractPptx(decrypted, opts.ocrImage);
      extracted.frontmatter.source_format = lowered.slice(1);
      return extracted;
    }
    case ".odt":
      return extractOdt(buf);
    // v0.43.0: audio transcription via existing transcription.ts
    case ".mp3":
    case ".wav":
    case ".m4a":
    case ".ogg":
    case ".flac":
      return extractAudio(buf, opts.filename || "audio");
    default:
      throw new Error(`Unsupported document extension: ${ext}`);
  }
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
    .map((page, index) => (page.length < PDF_SPARSE_TEXT_CHARS_PER_PAGE ? index + 1 : 0))
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
      const mergedPages = normalizedPages.map((page, index) => {
        const pageNo = index + 1;
        const recognized = ocr.pageTexts.get(pageNo);
        const content = recognized
          ? withUnverifiedBanner(recognized, "ocr_vision")
          : page || "[Kein durchsuchbarer Text extrahiert]";
        return `--- Page ${pageNo} ---\n${content}`;
      });
      warnings.push(
        `pdf_ocr_fallback: OCR completed for ${ocr.pageTexts.size} of ${sparsePages.length} sparse page(s)`
      );
      return {
        text: [mergedPages.join(`\n${PAGE_SEP}\n`), annotations.section]
          .filter(Boolean)
          .join("\n\n"),
        frontmatter: {
          type: "document",
          source_format: "pdf",
          pages: totalPages,
          extraction_method: "ocr_vision",
          extraction_unverified: "true",
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
 * OCR fallback for scanned PDFs: rasterize pages to images, then run vision
 * OCR on each page. Returns combined text, or '' if OCR unavailable.
 */
async function tryOcrFallback(
  pdfBuf: Buffer,
  totalPages: number,
  requestedPages: number[]
): Promise<{ pageTexts: Map<number, string>; warnings: string[] }> {
  const pageTexts = new Map<number, string>();
  const warnings: string[] = [];
  // 1. Check if expansion model (GPT-4o-mini etc.) is available for OCR.
  //    Gateway stays lazy-imported — this module is statically imported by
  //    import-file.ts and sync.ts, and must not pull AI SDKs at startup.
  const { isAvailable, generateOcrText } = await import("./ai/gateway.ts");
  if (!isAvailable("expansion")) {
    warnings.push("pdf_ocr_unavailable: no OCR model configured");
    return { pageTexts, warnings };
  }

  // 2. Lazy-import pdf2pic — if missing, bail gracefully.
  let fromBuffer: typeof import("pdf2pic").fromBuffer;
  try {
    ({ fromBuffer } = await import("pdf2pic"));
  } catch {
    warnings.push("pdf_ocr_unavailable: pdf rasterizer missing");
    return { pageTexts, warnings };
  }

  // 3. Convert PDF pages to PNG images. Cap the page count so a huge scanned
  //    bundle (e.g. a 1 GB / 800-page Akte) can't rasterize-and-OCR the whole
  //    document synchronously inside the upload request (timeout + cost blowup).
  //    Tune via GBRAIN_OCR_MAX_PAGES; 0/negative disables the cap.
  const rawCap = Number(process.env.GBRAIN_OCR_MAX_PAGES);
  const maxPages = Number.isFinite(rawCap) ? Math.floor(rawCap) : 100;
  const uniqueRequested = [...new Set(requestedPages)]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const capped = maxPages > 0 && uniqueRequested.length > maxPages;
  const pagesToConvert = capped ? uniqueRequested.slice(0, maxPages) : uniqueRequested;

  const convert = fromBuffer(pdfBuf, {
    density: 300,
    format: "png",
    width: 2000,
  });

  const images: Array<{ pageNo: number; image: { buffer?: Buffer; base64?: string } }> = [];
  try {
    for (const pageNo of pagesToConvert) {
      images.push({ pageNo, image: await convert(pageNo) });
    }
  } catch {
    warnings.push("pdf_ocr_failed: PDF rasterization failed");
    return { pageTexts, warnings };
  }

  // 4. OCR each page image.
  if (capped) {
    warnings.push(
      `pdf_ocr_partial: only ${pagesToConvert.length} of ${uniqueRequested.length} sparse pages processed`
    );
  }
  for (let i = 0; i < images.length; i++) {
    const { pageNo, image: img } = images[i];
    const imgBuf: Buffer | undefined =
      img.buffer ?? (img.base64 ? Buffer.from(img.base64, "base64") : undefined);
    if (!imgBuf) {
      warnings.push(`pdf_ocr_failed: page ${pageNo} produced no image`);
      continue;
    }

    try {
      const pageText = await generateOcrText(imgBuf, "image/png");
      if (pageText.trim()) {
        pageTexts.set(pageNo, pageText.trim());
      } else {
        warnings.push(`pdf_ocr_failed: page ${pageNo} returned no text`);
      }
    } catch {
      warnings.push(`pdf_ocr_failed: page ${pageNo}`);
    }
  }

  return { pageTexts, warnings };
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
  const visual = await extractOfficeMedia(buf, "word/media/", ocrImage);
  const macrosPresent = await containsOfficeMacros(buf);
  warnings.push(...review.warnings);
  warnings.push(...visual.warnings);
  if (macrosPresent)
    warnings.push("office_macros_present: VBA content retained in original but never executed");
  return {
    text: normalizeWhitespace(
      [result.value ?? "", ...review.sections, ...visual.sections].filter(Boolean).join("\n\n")
    ),
    frontmatter: {
      type: "document",
      source_format: "docx",
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
    body = parsed.html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
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

async function listFilesRecursive(root: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) files.push(full);
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
    const proc = Bun.spawn(["readpst", "-e", "-8", "-j", "1", "-q", "-o", outputDir, input], {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    const timeout = setTimeout(() => proc.kill(), 5 * 60_000);
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

async function extractRtf(buf: Buffer): Promise<ExtractedDocument> {
  const source = buf.toString("latin1");
  const decoded = source
    .replace(/\\par[d]?\b\s?/g, "\n")
    .replace(/\\tab\b\s?/g, "\t")
    .replace(/\\u(-?\d+)\??/g, (_match, raw: string) => {
      const value = Number(raw);
      return String.fromCharCode(value < 0 ? value + 65536 : value);
    })
    .replace(/\\'([0-9a-f]{2})/gi, (_match, hex: string) =>
      Buffer.from([Number.parseInt(hex, 16)]).toString("latin1")
    )
    .replace(/\\[a-z]+-?\d*\s?/gi, "")
    .replace(/\\([{}\\])/g, "$1")
    .replace(/[{}]/g, "");
  return {
    text: normalizeWhitespace(decoded),
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
  target: "pdf" | "xlsx"
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
    const proc = Bun.spawn(
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
      { stdout: "pipe", stderr: "pipe", env: { ...process.env, HOME: dir } }
    );
    const timeout = setTimeout(() => proc.kill(), 60_000);
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
export function synthesizeDocumentMarkdown(
  relativePath: string,
  extracted: ExtractedDocument
): string {
  const fm: Record<string, string | number> = { ...extracted.frontmatter };
  if (!fm.extraction_method) fm.extraction_method = "native_parser";
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

/** Collapse runaway blank lines and strip trailing space; keep paragraphs. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
