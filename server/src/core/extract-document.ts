/**
 * Document text extraction — turns binary office/document formats into
 * markdown-ready text so importFromFile can ingest them like any other page.
 *
 * Supported: .pdf (text layer), .docx, .eml, .csv, .tsv, .xlsx,
 *            .mp3, .wav, .m4a, .ogg, .flac (audio transcription).
 * All parsers are pure-JS and proven under `bun build --compile`
 * (no native addons, no DOM/canvas requirements).
 *
 * Scanned PDFs (no text layer) are detected and OCR'd via pdf2pic +
 * vision model. The extraction returns a `pdf_text_layer_sparse` warning,
 * then attempts automatic OCR fallback. If OCR dependencies are missing,
 * the warning explains what to install (poppler-utils / poppler via brew).
 *
 * Parsers are imported lazily inside each branch so the common
 * markdown/code import path pays zero startup cost for them.
 */

export const SUPPORTED_DOCUMENT_EXTS = ['.pdf', '.docx', '.eml', '.csv', '.tsv', '.xlsx', '.mp3', '.wav', '.m4a', '.ogg', '.flac'] as const;
export type SupportedDocumentExt = (typeof SUPPORTED_DOCUMENT_EXTS)[number];

/**
 * Audio extensions supported via transcription (Groq Whisper / OpenAI Whisper).
 * v0.43.0: PMBrain audio-import parity.
 */
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.mp4', '.mpeg', '.mpga', '.webm']);

/**
 * Raw-file ceiling for document formats. Deliberately higher than the 5MB
 * text cap in import-file.ts: a 40MB PDF often extracts to well under 1MB
 * of text. The extracted TEXT still flows through importFromContent's
 * MAX_FILE_SIZE guard, so oversized extractions are rejected there.
 */
export const MAX_DOCUMENT_FILE_SIZE = 50_000_000; // 50MB

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
    '> ⚠️ **Unverifizierte Extraktion (OCR).** Dieser Text wurde per Bilderkennung ' +
    'aus einem gescannten Dokument gewonnen und kann Erkennungsfehler enthalten ' +
    '(z. B. falsche Paragraphen-, Zahlen- oder Datumswerte). Vor rechtlicher ' +
    'Verwendung gegen das Originaldokument prüfen.',
  audio_transcription:
    '> ⚠️ **Unverifizierte Extraktion (Audio-Transkription).** Dieser Text wurde ' +
    'automatisch aus einer Audioaufnahme transkribiert und kann Hör-/Erkennungsfehler ' +
    'enthalten. Vor rechtlicher Verwendung gegen die Originalaufnahme prüfen.',
} as const;

export function withUnverifiedBanner(text: string, method: keyof typeof UNVERIFIED_BANNERS): string {
  return `${UNVERIFIED_BANNERS[method]}\n\n${text}`;
}

export async function extractDocumentText(
  buf: Buffer,
  ext: string,
  opts: { filename?: string } = {},
): Promise<ExtractedDocument> {
  const lowered = ext.toLowerCase();
  switch (lowered) {
    case '.pdf':
      return extractPdf(buf);
    case '.docx':
      return extractDocx(buf);
    case '.eml':
      return extractEml(buf);
    case '.csv':
    case '.tsv':
      return extractDelimited(buf, lowered, opts.filename);
    case '.xlsx':
      return extractXlsx(buf);
    // v0.43.0: audio transcription via existing transcription.ts
    case '.mp3':
    case '.wav':
    case '.m4a':
    case '.ogg':
    case '.flac':
      return extractAudio(buf, opts.filename || 'audio');
    default:
      throw new Error(`Unsupported document extension: ${ext}`);
  }
}

async function extractPdf(buf: Buffer): Promise<ExtractedDocument> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  // unpdf wants a standalone Uint8Array; slice detaches from Buffer pool.
  const bytes = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const doc = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  const cleaned = normalizeWhitespace(text);
  const warnings: string[] = [];

  if (totalPages > 0 && cleaned.length < totalPages * PDF_SPARSE_TEXT_CHARS_PER_PAGE) {
    warnings.push(
      `pdf_text_layer_sparse: ${cleaned.length} chars across ${totalPages} page(s) — ` +
        `likely a scanned PDF without a text layer. Attempting OCR fallback...`,
    );

    const ocrText = await tryOcrFallback(buf, totalPages);
    if (ocrText) {
      warnings.push(`pdf_ocr_fallback: OCR extracted ${ocrText.length} chars from ${totalPages} page(s).`);
      return {
        text: withUnverifiedBanner(ocrText, 'ocr_vision'),
        frontmatter: {
          type: 'document',
          source_format: 'pdf',
          pages: totalPages,
          extraction_method: 'ocr_vision',
          extraction_unverified: 'true',
        },
        warnings,
      };
    }
  }

  return {
    text: cleaned,
    frontmatter: {
      type: 'document',
      source_format: 'pdf',
      pages: totalPages,
      extraction_method: 'text_layer',
    },
    warnings,
  };
}

/**
 * OCR fallback for scanned PDFs: rasterize pages to images, then run vision
 * OCR on each page. Returns combined text, or '' if OCR unavailable.
 */
async function tryOcrFallback(pdfBuf: Buffer, totalPages: number): Promise<string> {
  // 1. Check if expansion model (GPT-4o-mini etc.) is available for OCR.
  //    Gateway stays lazy-imported — this module is statically imported by
  //    import-file.ts and sync.ts, and must not pull AI SDKs at startup.
  const { isAvailable, generateOcrText } = await import('./ai/gateway.ts');
  if (!isAvailable('expansion')) {
    return '';
  }

  // 2. Lazy-import pdf2pic — if missing, bail gracefully.
  let fromBuffer: typeof import('pdf2pic').fromBuffer;
  try {
    ({ fromBuffer } = await import('pdf2pic'));
  } catch {
    return '';
  }

  // 3. Convert PDF pages to PNG images.
  const convert = fromBuffer(pdfBuf, {
    density: 300,
    format: 'png',
    width: 2000,
  });

  let images: Array<{ buffer?: Buffer; base64?: string }>;
  try {
    images = await convert.bulk(-1);
  } catch {
    // pdf2pic failed — likely pdftoppm (poppler) not installed.
    return '';
  }

  // 4. OCR each page image.
  const pageTexts: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imgBuf: Buffer | undefined =
      img.buffer ?? (img.base64 ? Buffer.from(img.base64, 'base64') : undefined);
    if (!imgBuf) continue;

    try {
      const pageText = await generateOcrText(imgBuf, 'image/png');
      if (pageText.trim()) {
        pageTexts.push(`--- Page ${i + 1} ---\n${pageText.trim()}`);
      }
    } catch {
      // Per-page OCR failure is non-fatal; continue with remaining pages.
    }
  }

  return pageTexts.join('\n\n');
}

async function extractDocx(buf: Buffer): Promise<ExtractedDocument> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ buffer: buf });
  const warnings = (result.messages ?? [])
    .filter((m) => m.type === 'warning')
    .map((m) => `docx: ${m.message}`);
  return {
    text: normalizeWhitespace(result.value ?? ''),
    frontmatter: { type: 'document', source_format: 'docx' },
    warnings,
  };
}

async function extractEml(buf: Buffer): Promise<ExtractedDocument> {
  const PostalMime = (await import('postal-mime')).default;
  const parsed = await PostalMime.parse(buf);
  const frontmatter: Record<string, string | number> = { type: 'email', source_format: 'eml' };
  if (parsed.subject) frontmatter.title = parsed.subject;
  if (parsed.date) {
    const d = new Date(parsed.date);
    if (!Number.isNaN(d.getTime())) frontmatter.date = d.toISOString().slice(0, 10);
  }

  const addr = (a?: { name?: string; address?: string } | null) =>
    a ? (a.name ? `${a.name} <${a.address ?? ''}>` : (a.address ?? '')) : '';
  const addrList = (list?: { name?: string; address?: string }[]) =>
    (list ?? []).map((a) => addr(a)).filter(Boolean).join(', ');

  const headerLines = [
    parsed.from ? `**From:** ${addr(parsed.from)}` : '',
    addrList(parsed.to) ? `**To:** ${addrList(parsed.to)}` : '',
    addrList(parsed.cc) ? `**Cc:** ${addrList(parsed.cc)}` : '',
    parsed.date ? `**Date:** ${parsed.date}` : '',
    parsed.subject ? `**Subject:** ${parsed.subject}` : '',
  ].filter(Boolean);

  // Prefer the plain-text part; fall back to a tag-stripped HTML body.
  let body = (parsed.text ?? '').trim();
  if (!body && parsed.html) {
    body = parsed.html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  const warnings: string[] = [];
  const attachments = (parsed.attachments ?? []).map((a) => a.filename).filter(Boolean);
  if (attachments.length > 0) {
    warnings.push(`eml: ${attachments.length} attachment(s) not extracted (${attachments.join(', ')}) — import them as their own files.`);
  }

  const text = [headerLines.join('\n'), body ? `\n${body}` : ''].join('\n').trim();
  return { text: normalizeWhitespace(text), frontmatter, warnings };
}

async function extractDelimited(
  buf: Buffer,
  ext: '.csv' | '.tsv',
  filename?: string,
): Promise<ExtractedDocument> {
  const text = buf.toString('utf-8').trim();
  return {
    text,
    frontmatter: {
      type: 'document',
      source_format: ext.slice(1),
      ...(filename ? { title: filename } : {}),
    },
    warnings: [],
  };
}

async function extractXlsx(buf: Buffer): Promise<ExtractedDocument> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sections: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]).trim();
    if (!csv) continue;
    sections.push(`## Sheet: ${name}\n\n${csv}`);
  }
  return {
    text: sections.join('\n\n'),
    frontmatter: { type: 'document', source_format: 'xlsx', sheets: wb.SheetNames.length },
    warnings: [],
  };
}

// v0.43.0: audio transcription via existing transcription.ts
async function extractAudio(buf: Buffer, filename: string): Promise<ExtractedDocument> {
  const { transcribeBuffer } = await import('./transcription.ts');
  const result = await transcribeBuffer(buf, filename);
  const lines: string[] = [];
  if (result.segments.length > 0) {
    lines.push('## Transcription');
    for (const seg of result.segments) {
      const start = formatTimestamp(seg.start);
      lines.push(`**[${start}]** ${seg.text}`);
    }
  } else {
    lines.push(result.text);
  }
  return {
    text: withUnverifiedBanner(lines.join('\n\n'), 'audio_transcription'),
    frontmatter: {
      type: 'transcription',
      source_format: 'audio',
      language: result.language,
      duration: result.duration,
      provider: result.provider,
      extraction_method: 'audio_transcription',
      extraction_unverified: 'true',
    },
    warnings: [],
  };
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Build the full markdown (frontmatter + body) importFromContent expects.
 * No `slug:` is ever emitted — importFromFile's anti-spoof check requires
 * the slug to stay path-derived.
 */
export function synthesizeDocumentMarkdown(
  relativePath: string,
  extracted: ExtractedDocument,
): string {
  const fm: Record<string, string | number> = { ...extracted.frontmatter };
  if (!fm.title) {
    const base = relativePath.split('/').pop() ?? relativePath;
    fm.title = base.replace(/\.[a-z0-9]+$/i, '');
  }
  const lines = Object.entries(fm).map(([k, v]) =>
    typeof v === 'number' ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`,
  );
  return `---\n${lines.join('\n')}\n---\n\n${extracted.text}\n`;
}

/** Collapse runaway blank lines and strip trailing space; keep paragraphs. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
