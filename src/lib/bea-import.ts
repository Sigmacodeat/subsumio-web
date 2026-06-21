/**
 * beA XML Import-Parser
 * =====================
 *
 * Parsed beA-Export-XML-Dateien (besonderes elektronisches Anwaltspostfach)
 * und wandelt sie in strukturierte Nachrichten-Objekte um.
 *
 * beA-Nachrichten werden als XML-Dateien exportiert (z.B. aus dem beA-Webclient
 * oder RA-MICRO). Dieser Parser extrahiert Metadaten und Nachrichtentext.
 *
 * P1-BEA-002: beA XML Import Parser
 */

export interface BeaImportedMessage {
  slug: string;
  subject: string;
  sender: string;
  sender_id?: string;
  recipient: string;
  recipient_id?: string;
  sent_date: string;
  received_date?: string;
  case_ref?: string;
  bea_id?: string;
  delivery_status?: "sent" | "delivered" | "read" | "failed";
  body_text?: string;
  attachments?: Array<{
    filename: string;
    mime_type?: string;
    size?: number;
  }>;
}

export interface BeaImportResult {
  messages: BeaImportedMessage[];
  errors: Array<{ file: string; error: string }>;
  total_count: number;
  valid_count: number;
  error_count: number;
}

function extractText(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i");
  const match = xml.match(regex);
  if (!match) return undefined;
  return match[1].trim();
}

function extractAttribute(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["']`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

function extractAll(xml: string, tag: string): string[] {
  const regex = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "gi"
  );
  const matches = [...xml.matchAll(regex)];
  return matches.map((m) => m[1].trim());
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function safeSlug(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

export function parseBeaXml(xmlContent: string, filename?: string): BeaImportedMessage | null {
  try {
    const subject =
      extractText(xmlContent, "subject") || extractText(xmlContent, "Subject") || "Ohne Betreff";
    const sender =
      extractAttribute(xmlContent, "sender", "name") ||
      extractAttribute(xmlContent, "Sender", "name") ||
      extractText(xmlContent, "sender") ||
      extractText(xmlContent, "Sender") ||
      "Unbekannt";
    const senderId =
      extractText(xmlContent, "senderId") || extractAttribute(xmlContent, "sender", "id");
    const recipient =
      extractAttribute(xmlContent, "recipient", "name") ||
      extractAttribute(xmlContent, "Recipient", "name") ||
      extractText(xmlContent, "recipient") ||
      extractText(xmlContent, "Recipient") ||
      "Unbekannt";
    const recipientId =
      extractText(xmlContent, "recipientId") || extractAttribute(xmlContent, "recipient", "id");
    const sentDate =
      extractText(xmlContent, "sentDate") ||
      extractText(xmlContent, "date") ||
      extractText(xmlContent, "Date") ||
      new Date().toISOString();
    const receivedDate = extractText(xmlContent, "receivedDate");
    const caseRef =
      extractText(xmlContent, "caseRef") ||
      extractText(xmlContent, "caseReference") ||
      extractText(xmlContent, "aktenzeichen");
    const beaId =
      extractText(xmlContent, "messageId") ||
      extractText(xmlContent, "beaId") ||
      extractAttribute(xmlContent, "message", "id");
    const deliveryStatusRaw =
      extractText(xmlContent, "deliveryStatus") ||
      extractAttribute(xmlContent, "message", "status");
    const bodyHtml =
      extractText(xmlContent, "body") ||
      extractText(xmlContent, "content") ||
      extractText(xmlContent, "text");
    const bodyText = bodyHtml ? stripHtml(bodyHtml) : undefined;

    const attachmentNames = extractAll(xmlContent, "attachment");
    const attachmentMimes = extractAll(xmlContent, "mimeType");
    const attachmentSizes = extractAll(xmlContent, "size");
    const attachments =
      attachmentNames.length > 0
        ? attachmentNames.map((name, i) => ({
            filename: name,
            mime_type: attachmentMimes[i],
            size: attachmentSizes[i] ? parseInt(attachmentSizes[i], 10) : undefined,
          }))
        : undefined;

    const deliveryStatus = deliveryStatusRaw as BeaImportedMessage["delivery_status"] | undefined;

    const dateSlug = sentDate.split("T")[0] || new Date().toISOString().split("T")[0];
    const slug = `legal/bea-messages/${dateSlug}-${safeSlug(subject, "bea-message")}`;

    return {
      slug,
      subject,
      sender,
      sender_id: senderId,
      recipient,
      recipient_id: recipientId,
      sent_date: sentDate,
      received_date: receivedDate,
      case_ref: caseRef,
      bea_id: beaId,
      delivery_status: deliveryStatus,
      body_text: bodyText,
      attachments,
    };
  } catch {
    return null;
  }
}

export function parseBeaXmlBatch(
  files: Array<{ filename: string; content: string }>
): BeaImportResult {
  const messages: BeaImportedMessage[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  for (const { filename, content } of files) {
    const parsed = parseBeaXml(content, filename);
    if (parsed) {
      messages.push(parsed);
    } else {
      errors.push({ file: filename, error: "Failed to parse beA XML" });
    }
  }

  return {
    messages,
    errors,
    total_count: files.length,
    valid_count: messages.length,
    error_count: errors.length,
  };
}
