import { jsPDF } from "jspdf";

export interface DraftPdfData {
  title: string;
  caseRef?: string;
  draftType?: string;
  content: string;
  kanzlei?: {
    name?: string;
    anwaltName?: string;
    adresse?: string;
    email?: string;
    telefon?: string;
  };
  recipient?: {
    name?: string;
    address?: string;
  };
}

const DRAFT_TYPE_LABELS: Record<string, string> = {
  ahg_antrag: "AHG-Antrag",
  strafantrag: "Strafantrag",
  einspruch: "Einspruch",
  dsgvo_beschwerde: "DSGVO-Beschwerde",
  klage_entwurf: "Klageentwurf",
  versand_checkliste: "Versand-Checkliste",
};

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*(\d+)\.\s+/gm, "$1. ")
    .replace(/^\s*>\s+/gm, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^---$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function generateDraftPdf(data: DraftPdfData): jsPDF {
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
  doc.text(data.kanzlei?.name || "Kanzlei", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(lightText);
  if (data.kanzlei?.anwaltName) {
    doc.text(data.kanzlei.anwaltName, margin, y);
    y += 4;
  }
  if (data.kanzlei?.adresse) {
    data.kanzlei.adresse.split("\n").forEach((line) => {
      doc.text(line, margin, y);
      y += 4;
    });
  }
  if (data.kanzlei?.email || data.kanzlei?.telefon) {
    const contact = [data.kanzlei.email, data.kanzlei.telefon].filter(Boolean).join(" · ");
    doc.text(contact, margin, y);
    y += 4;
  }

  // --- Empfänger-Adresse (rechts) ---
  if (data.recipient?.name || data.recipient?.address) {
    y = margin + 5;
    const rightX = pageW - margin;
    doc.setFontSize(9);
    doc.setTextColor(darkText);
    if (data.recipient.name) {
      doc.text(data.recipient.name, rightX, y, { align: "right" });
      y += 4;
    }
    if (data.recipient.address) {
      data.recipient.address.split("\n").forEach((line) => {
        doc.text(line, rightX, y, { align: "right" });
        y += 4;
      });
    }
  }

  // --- Trennlinie ---
  y = Math.max(y, margin + 30);
  doc.setDrawColor(220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // --- Titel ---
  const typeLabel = data.draftType ? (DRAFT_TYPE_LABELS[data.draftType] ?? data.draftType) : "";
  doc.setFontSize(16);
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(data.title, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7;

  if (typeLabel) {
    doc.setFontSize(10);
    doc.setTextColor(lightText);
    doc.setFont("helvetica", "normal");
    doc.text(typeLabel, margin, y);
    y += 5;
  }
  if (data.caseRef) {
    doc.setFontSize(9);
    doc.setTextColor(lightText);
    doc.text(`Aktenzeichen: ${data.caseRef}`, margin, y);
    y += 5;
  }

  y += 5;
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // --- Body ---
  const plainText = stripMarkdown(data.content);
  doc.setFontSize(11);
  doc.setTextColor(darkText);
  doc.setFont("helvetica", "normal");

  const paragraphs = plainText.split(/\n\n+/);
  const lineHeight = 5.5;

  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para, maxWidth);
    for (const line of lines) {
      if (y > pageH - margin - 15) {
        // Page break
        doc.setFontSize(8);
        doc.setTextColor(lightText);
        doc.text(`${data.kanzlei?.name || "Kanzlei"} — ${data.title}`, margin, pageH - 10);
        doc.text(`Seite ${doc.getNumberOfPages()}`, pageW - margin, pageH - 10, { align: "right" });
        doc.addPage();
        y = margin;
        doc.setFontSize(11);
        doc.setTextColor(darkText);
        doc.setFont("helvetica", "normal");
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 2;
  }

  // --- Footer auf letzter Seite ---
  doc.setFontSize(8);
  doc.setTextColor(lightText);
  doc.text(`${data.kanzlei?.name || "Kanzlei"} — ${data.title}`, margin, pageH - 10);
  doc.text(`Seite ${doc.getNumberOfPages()}`, pageW - margin, pageH - 10, { align: "right" });

  // --- Entwurf-Wasserzeichen ---
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(48);
  doc.setFont("helvetica", "bold");
  doc.text("ENTWURF", pageW / 2, pageH / 2, {
    align: "center",
    angle: 45,
  });

  return doc;
}
