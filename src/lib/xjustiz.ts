/**
 * XJustiz XML Builder
 * ====================
 * Generates XJustiz-conformant XML for beA/ERV filings.
 * XJustiz is the standard for electronic legal communication in Germany.
 *
 * Stufe 1: Validierter Export — generates a downloadable XJustiz XML
 * package that can be manually uploaded to the beA portal.
 */

import { createHash } from "node:crypto";
import type { FilingPackage } from "@/lib/efiling-architecture";

export interface XJustizMetadata {
  court: string;
  caseNumber?: string;
  senderName: string;
  senderRole: "lawyer" | "party" | "court" | "other";
  senderId?: string;
  recipientName?: string;
  subject: string;
  priority?: "normal" | "urgent" | "fristgebunden";
  deadlineDate?: string;
}

export interface XJustizAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
  isMainDocument: boolean;
  title: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(iso: string): string {
  return iso.split("T")[0] ?? iso;
}

export function buildXJustizXml(pkg: FilingPackage, metadata: XJustizMetadata): string {
  const now = new Date().toISOString();
  const messageId = `xjustiz-${pkg.id}`;

  const attachments: XJustizAttachment[] = pkg.documents.map((doc) => ({
    filename: doc.title.replace(/[^a-zA-Z0-9._-]/g, "_"),
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    fileHash: doc.file_hash,
    isMainDocument: doc.is_main_document,
    title: doc.title,
  }));

  const mainDocs = attachments.filter((a) => a.isMainDocument);
  const sideDocs = attachments.filter((a) => !a.isMainDocument);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xjustiz:nachricht
  xmlns:xjustiz="http://www.xjustiz.de/Nachricht/2.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.xjustiz.de/Nachricht/2.0 xjustiz-2.0.xsd">
  <xjustiz:nachrichtKopf>
    <xjustiz:nachrichtId>${escapeXml(messageId)}</xjustiz:nachrichtId>
    <xjustiz:erstellungszeitpunkt>${now}</xjustiz:erstellungszeitpunkt>
    <xjustiz:absender>
      <xjustiz:rolle>${escapeXml(metadata.senderRole)}</xjustiz:rolle>
      <xjustiz:name>${escapeXml(metadata.senderName)}</xjustiz:name>
      ${metadata.senderId ? `<xjustiz:identifikation>${escapeXml(metadata.senderId)}</xjustiz:identifikation>` : ""}
    </xjustiz:absender>
    <xjustiz:empfaenger>
      <xjustiz:rolle>court</xjustiz:rolle>
      <xjustiz:name>${escapeXml(metadata.court)}</xjustiz:name>
    </xjustiz:empfaenger>
    <xjustiz:betreff>${escapeXml(metadata.subject)}</xjustiz:betreff>
    ${metadata.priority ? `<xjustiz:prioritaet>${escapeXml(metadata.priority)}</xjustiz:prioritaet>` : ""}
    ${metadata.deadlineDate ? `<xjustiz:frist>${formatDate(metadata.deadlineDate)}</xjustiz:frist>` : ""}
  </xjustiz:nachrichtKopf>
  <xjustiz:nachrichtInhalt>
    <xjustiz:verfahrensdaten>
      ${metadata.caseNumber ? `<xjustiz:aktenzeichen>${escapeXml(metadata.caseNumber)}</xjustiz:aktenzeichen>` : ""}
      <xjustiz:gericht>
        <xjustiz:name>${escapeXml(metadata.court)}</xjustiz:name>
      </xjustiz:gericht>
    </xjustiz:verfahrensdaten>
    <xjustiz:dokumente>
      ${mainDocs
        .map(
          (doc) => `      <xjustiz:hauptdokument>
        <xjustiz:dateiname>${escapeXml(doc.filename)}</xjustiz:dateiname>
        <xjustiz:mimeType>${escapeXml(doc.mimeType)}</xjustiz:mimeType>
        <xjustiz:groesse>${doc.sizeBytes}</xjustiz:groesse>
        <xjustiz:pruefsumme algorithmus="SHA-256">${escapeXml(doc.fileHash)}</xjustiz:pruefsumme>
        <xjustiz:titel>${escapeXml(doc.title)}</xjustiz:titel>
      </xjustiz:hauptdokument>`
        )
        .join("\n")}
      ${sideDocs
        .map(
          (doc) => `      <xjustiz:anlage>
        <xjustiz:dateiname>${escapeXml(doc.filename)}</xjustiz:dateiname>
        <xjustiz:mimeType>${escapeXml(doc.mimeType)}</xjustiz:mimeType>
        <xjustiz:groesse>${doc.sizeBytes}</xjustiz:groesse>
        <xjustiz:pruefsumme algorithmus="SHA-256">${escapeXml(doc.fileHash)}</xjustiz:pruefsumme>
        <xjustiz:titel>${escapeXml(doc.title)}</xjustiz:titel>
      </xjustiz:anlage>`
        )
        .join("\n")}
    </xjustiz:dokumente>
  </xjustiz:nachrichtInhalt>
</xjustiz:nachricht>`;

  return xml;
}

export function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export interface BeAExportPackage {
  xml: string;
  manifest: {
    filingId: string;
    court: string;
    caseNumber?: string;
    createdAt: string;
    documents: Array<{
      filename: string;
      mimeType: string;
      sizeBytes: number;
      fileHash: string;
      isMainDocument: boolean;
    }>;
    validationHash: string;
  };
}

export function buildBeAExportPackage(
  pkg: FilingPackage,
  metadata: XJustizMetadata
): BeAExportPackage {
  const xml = buildXJustizXml(pkg, metadata);
  const validationHash = computeFileHash(Buffer.from(xml, "utf-8"));

  return {
    xml,
    manifest: {
      filingId: pkg.id,
      court: metadata.court,
      caseNumber: metadata.caseNumber,
      createdAt: new Date().toISOString(),
      documents: pkg.documents.map((doc) => ({
        filename: doc.title.replace(/[^a-zA-Z0-9._-]/g, "_"),
        mimeType: doc.mime_type,
        sizeBytes: doc.size_bytes,
        fileHash: doc.file_hash,
        isMainDocument: doc.is_main_document,
      })),
      validationHash,
    },
  };
}
