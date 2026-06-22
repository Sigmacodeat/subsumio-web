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

export interface BeaImportBundleOptions {
  filename?: string;
  source?: "upload" | "watch_dir" | "manual";
  importedAt?: string;
  importedBy?: string;
}

export interface BeaImportPageBundle {
  importPage: {
    slug: string;
    title: string;
    type: "bea_import";
    content: string;
    frontmatter: Record<string, unknown>;
  };
  messagePages: Array<{
    slug: string;
    title: string;
    type: "bea_message";
    content: string;
    frontmatter: Record<string, unknown>;
  }>;
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

export function parseBeaXml(xmlContent: string, _filename?: string): BeaImportedMessage | null {
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

export function buildBeaImportBundle(
  result: BeaImportResult,
  options: BeaImportBundleOptions = {}
): BeaImportPageBundle {
  const importedAt = options.importedAt || new Date().toISOString();
  const source = options.source || "upload";
  const timestampPart = importedAt.replace(/[^0-9]/g, "").slice(0, 14);
  const filenamePart = safeSlug(options.filename || "bea-import", "bea-import");
  const importSlug = `legal/bea-imports/${timestampPart}-${filenamePart}`;

  const messagePages = result.messages.map((message, index) => {
    const slug = `${message.slug}-${String(index + 1).padStart(3, "0")}`;
    const attachmentLines = (message.attachments || []).map(
      (attachment) =>
        `- ${attachment.filename}${attachment.mime_type ? ` (${attachment.mime_type})` : ""}${
          typeof attachment.size === "number" ? `, ${attachment.size} Bytes` : ""
        }`
    );
    const content = [
      `# ${message.subject}`,
      "",
      `Von: ${message.sender}`,
      `An: ${message.recipient}`,
      `Gesendet: ${message.sent_date}`,
      message.received_date ? `Empfangen: ${message.received_date}` : null,
      message.case_ref ? `Aktenzeichen: ${message.case_ref}` : null,
      message.delivery_status ? `Status: ${message.delivery_status}` : null,
      "",
      "## Nachricht",
      "",
      message.body_text || "",
      attachmentLines.length > 0 ? "" : null,
      attachmentLines.length > 0 ? "## Anlagen" : null,
      ...attachmentLines,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    return {
      slug,
      title: `beA: ${message.subject}`,
      type: "bea_message" as const,
      content,
      frontmatter: {
        type: "bea_message",
        import_slug: importSlug,
        source,
        imported_at: importedAt,
        subject: message.subject,
        sender: message.sender,
        sender_id: message.sender_id,
        recipient: message.recipient,
        recipient_id: message.recipient_id,
        sent_date: message.sent_date,
        received_date: message.received_date,
        case_ref: message.case_ref,
        bea_id: message.bea_id,
        delivery_status: message.delivery_status,
        attachments: message.attachments || [],
      },
    };
  });

  const content = [
    `# beA Import ${options.filename || ""}`.trim(),
    "",
    `Quelle: ${source}`,
    `Importiert am: ${importedAt}`,
    options.importedBy ? `Importiert von: ${options.importedBy}` : null,
    "",
    "## Zusammenfassung",
    "",
    `- Dateien gesamt: ${result.total_count}`,
    `- Gueltige Nachrichten: ${result.valid_count}`,
    `- Fehlerhafte Dateien: ${result.error_count}`,
    result.errors.length > 0 ? "" : null,
    result.errors.length > 0 ? "## Fehler" : null,
    ...result.errors.map((error) => `- ${error.file}: ${error.error}`),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    importPage: {
      slug: importSlug,
      title: `beA Import ${options.filename || timestampPart}`,
      type: "bea_import",
      content,
      frontmatter: {
        type: "bea_import",
        filename: options.filename,
        source,
        imported_at: importedAt,
        imported_by: options.importedBy,
        total_count: result.total_count,
        valid_count: result.valid_count,
        error_count: result.error_count,
        errors: result.errors,
        message_slugs: messagePages.map((page) => page.slug),
      },
    },
    messagePages,
  };
}
