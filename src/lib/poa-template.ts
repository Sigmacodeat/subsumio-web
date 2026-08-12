/**
 * Vollmacht-PDF-Template
 * ======================
 *
 * Generates a DACH-compliant power-of-attorney PDF from PowerOfAttorney
 * metadata. Uses the same jsPDF pattern as legal-draft-pdf.ts.
 *
 * The generated PDF is stored as a Brain page attachment so it is auditable
 * and can be sent for signature (DocuSign or SignatureDialog).
 */
import { jsPDF } from "jspdf";
import type { PowerOfAttorney } from "@/lib/power-of-attorney";
import { POA_TYPE_LABELS } from "@/lib/power-of-attorney";

export interface PoaPdfData {
  poa: PowerOfAttorney;
  kanzlei?: {
    name?: string;
    anwaltName?: string;
    adresse?: string;
    email?: string;
    telefon?: string;
  };
}

export function generatePoaPdf(data: PoaPdfData): jsPDF {
  const { poa, kanzlei } = data;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 25;
  const maxWidth = pageW - margin * 2;
  let y = margin;

  const darkText = 40;
  const lightText = 100;
  const accentColor: [number, number, number] = [47, 107, 255];

  // --- Kanzlei-Kopf (links) ---
  doc.setFontSize(10);
  doc.setTextColor(darkText);
  doc.setFont("helvetica", "bold");
  doc.text(kanzlei?.name || "Kanzlei", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(lightText);
  if (kanzlei?.anwaltName) {
    doc.text(kanzlei.anwaltName, margin, y);
    y += 4;
  }
  if (kanzlei?.adresse) {
    kanzlei.adresse.split("\n").forEach((line) => {
      doc.text(line, margin, y);
      y += 4;
    });
  }
  if (kanzlei?.email || kanzlei?.telefon) {
    const contact = [kanzlei.email, kanzlei.telefon].filter(Boolean).join(" · ");
    doc.text(contact, margin, y);
    y += 4;
  }

  // --- Trennlinie ---
  y = Math.max(y, margin + 30);
  doc.setDrawColor(220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // --- Titel ---
  doc.setFontSize(16);
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.setFont("helvetica", "bold");
  doc.text("VOLLMACHT", margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(lightText);
  doc.setFont("helvetica", "normal");
  doc.text(POA_TYPE_LABELS[poa.type].de, margin, y);
  y += 8;

  // --- Body ---
  doc.setTextColor(darkText);
  doc.setFontSize(11);

  const lines: Array<{ label: string; value: string }> = [
    { label: "Vollmachtgeber:in", value: poa.client_name },
    { label: "Akte", value: poa.case_slug },
    ...(poa.expires_at ? [{ label: "Gültig bis", value: poa.expires_at.split("T")[0] }] : []),
  ];

  for (const { label, value } of lines) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 45, y);
    y += 6;
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Umfang der Vollmacht:", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const scopeLines = doc.splitTextToSize(poa.scope, maxWidth);
  doc.text(scopeLines, margin, y);
  y += scopeLines.length * 5 + 10;

  // --- Signaturblock ---
  y = Math.max(y, pageH - 60);
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + 70, y);
  doc.setFontSize(9);
  doc.setTextColor(lightText);
  doc.text("Ort, Datum", margin, y + 4);
  y += 20;

  doc.line(margin, y, margin + 70, y);
  doc.text("Unterschrift Vollmachtgeber:in", margin, y + 4);

  // --- Footer ---
  doc.setFontSize(8);
  doc.setTextColor(lightText);
  doc.text(
    `Vollmacht-ID: ${poa.id} · Erstellt: ${poa.created_at.split("T")[0]}`,
    margin,
    pageH - 10
  );

  return doc;
}
