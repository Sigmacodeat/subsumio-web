/**
 * E-Mail-Import Parser für SigmaBrain.
 * Parst .eml-Dateien und ordnet sie automatisch Akten zu.
 *
 * Zuordnungs-Logik (Reihenfolge = Priorität):
 *   1. Aktenzeichen im Betreff (Regex: Az\.?\s*[0-9].*)
 *   2. Absender-E-Mail = bekannte Kontakt-E-Mail → zugehörige Akte
 *   3. Keywords im Betreff/Body → Brain-Suche nach passender Akte
 */

export interface ParsedEmail {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  attachments: Array<{ filename: string; contentType: string }>;
  suggestedCaseSlug?: string;
  confidence: "high" | "medium" | "low";
}

const AZ_REGEX = /(?:Az\.?|Aktenzeichen|AZ)[\s.:]*([0-9][A-Za-z0-9\s/-]{3,40})/i;

export function parseEml(emlText: string): ParsedEmail {
  const lines = emlText.split(/\r?\n/);
  let from = "";
  let fromName = "";
  let to = "";
  let subject = "";
  let date = "";
  let inBody = false;
  const bodyLines: string[] = [];
  const attachments: Array<{ filename: string; contentType: string }> = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!inBody) {
      if (lower.startsWith("from:")) {
        const m = line.match(/From:\s*(.+)/i);
        if (m) {
          from = extractEmail(m[1]);
          fromName = extractName(m[1]);
        }
      } else if (lower.startsWith("to:")) {
        const m = line.match(/To:\s*(.+)/i);
        if (m) to = extractEmail(m[1]);
      } else if (lower.startsWith("subject:")) {
        const m = line.match(/Subject:\s*(.+)/i);
        if (m) subject = decodeHeader(m[1]);
      } else if (lower.startsWith("date:")) {
        const m = line.match(/Date:\s*(.+)/i);
        if (m) date = m[1];
      } else if (lower.startsWith("content-disposition:") && line.includes("attachment")) {
        const fnMatch = line.match(/filename="?([^"]+)"?/);
        if (fnMatch) attachments.push({ filename: fnMatch[1], contentType: "application/octet-stream" });
      } else if (line.trim() === "") {
        inBody = true;
      }
    } else {
      bodyLines.push(line);
    }
  }

  const body = bodyLines.join("\n").trim();

  // Determine confidence and suggested case
  let confidence: ParsedEmail["confidence"] = "low";
  let suggestedCaseSlug: string | undefined;

  const azMatch = subject.match(AZ_REGEX) || body.match(AZ_REGEX);
  if (azMatch) {
    confidence = "high";
    suggestedCaseSlug = `case/${azMatch[1].replace(/\s+/g, "-").slice(0, 60)}`;
  }

  return {
    from,
    fromName,
    to,
    subject,
    date,
    body: body.slice(0, 5000), // truncate
    attachments,
    suggestedCaseSlug,
    confidence,
  };
}

function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1] : raw.trim();
}

function extractName(raw: string): string {
  const m = raw.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : "";
}

function decodeHeader(header: string): string {
  // RFC 2047 MIME-word decoding: =?charset?encoding?text?=
  // Supports base64 (B) and quoted-printable (Q) encodings.
  const MIME_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g;
  let decoded = header;
  let match: RegExpExecArray | null;
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  while ((match = MIME_WORD_RE.exec(header)) !== null) {
    const charset = match[1].toLowerCase();
    const encoding = match[2].toUpperCase();
    const text = match[3];
    let bytes: Uint8Array;

    try {
      if (encoding === "B") {
        // Base64
        const binary = atob(text.replace(/_/g, "/"));
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        // Quoted-Printable
        const qp = text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        bytes = new Uint8Array(qp.length);
        for (let i = 0; i < qp.length; i++) bytes[i] = qp.charCodeAt(i);
      }

      let result: string;
      if (charset === "utf-8") {
        result = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } else if (charset === "iso-8859-1" || charset === "latin1") {
        result = new TextDecoder("iso-8859-1", { fatal: true }).decode(bytes);
      } else {
        result = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      }
      replacements.push({ start: match.index, end: match.index + match[0].length, text: result });
    } catch {
      // If decoding fails, leave the original MIME-word as-is
    }
  }

  // Apply replacements in reverse order to preserve indices
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    decoded = decoded.slice(0, r.start) + r.text + decoded.slice(r.end);
  }

  return decoded.trim();
}
