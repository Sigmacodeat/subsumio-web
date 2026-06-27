/**
 * PDF-Rechnung mit jsPDF + autoTable.
 * Client-seitig, kein Server-Rendering nötig.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface InvoicePdfData {
  number: string;
  client: string;
  clientAddress?: string;
  caseNumber?: string;
  date: string;
  dueDate: string;
  items: Array<{ description: string; date: string; hours: number; rate: number; amount: number }>;
  expenses: Array<{ description: string; date: string; amount: number }>;
  subtotal: number;
  expenseTotal: number;
  advancePayment: number;
  vatRate: number;
  tax: number;
  total: number;
  paymentTerms?: string;
  bank?: { name?: string; iban?: string; bic?: string };
  notes?: string;
  kanzlei: {
    name: string;
    anwaltName?: string;
    adresse?: string;
    email?: string;
    telefon?: string;
    kammerNummer?: string;
    ustId?: string;
  };
}

export function generateInvoicePdf(data: InvoicePdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  const darkText = 40;
  const lightText = 100;
  const accentColor = [47, 107, 255]; // brand-primary #2f6bff

  // --- Kanzlei-Kopf ---
  doc.setFontSize(10);
  doc.setTextColor(darkText);
  doc.setFont("helvetica", "bold");
  doc.text(data.kanzlei.name || "Kanzlei", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(lightText);
  if (data.kanzlei.anwaltName) {
    doc.text(data.kanzlei.anwaltName, margin, y);
    y += 4;
  }
  if (data.kanzlei.adresse) {
    data.kanzlei.adresse.split("\n").forEach((line) => {
      doc.text(line, margin, y);
      y += 4;
    });
  }
  if (data.kanzlei.email || data.kanzlei.telefon) {
    const contact = [data.kanzlei.email, data.kanzlei.telefon].filter(Boolean).join(" · ");
    doc.text(contact, margin, y);
    y += 4;
  }
  if (data.kanzlei.kammerNummer) {
    doc.text(data.kanzlei.kammerNummer, margin, y);
    y += 4;
  }
  if (data.kanzlei.ustId) {
    doc.text(`USt-ID: ${data.kanzlei.ustId}`, margin, y);
    y += 4;
  }

  y += 8;

  // --- Mandanten-Adresse (rechtsbündig) ---
  const rightX = pageW - margin;
  doc.setFontSize(9);
  doc.setTextColor(darkText);
  if (data.clientAddress) {
    const addrLines = data.clientAddress.split("\n");
    addrLines.forEach((line) => {
      doc.text(line, rightX, y, { align: "right" });
      y += 4;
    });
  } else {
    doc.text(data.client, rightX, y, { align: "right" });
  }

  // --- Rechnungsdetails ---
  y += 20;
  doc.setFontSize(18);
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.setFont("helvetica", "bold");
  doc.text("Rechnung", margin, y);
  y += 10;

  doc.setFontSize(9);
  doc.setTextColor(darkText);
  doc.setFont("helvetica", "normal");
  const details = [
    `Rechnungs-Nr.: ${data.number}`,
    `Datum: ${data.date}`,
    `Fällig: ${data.dueDate}`,
    data.caseNumber ? `Aktenzeichen: ${data.caseNumber}` : "",
  ].filter(Boolean);
  details.forEach((line) => {
    doc.text(line, margin, y);
    y += 5;
  });

  y += 5;

  // --- Posten-Tabelle ---
  const itemRows = data.items.map((item) => [
    item.date,
    item.description,
    item.hours.toFixed(2),
    `${item.rate.toFixed(2)} €`,
    `${item.amount.toFixed(2)} €`,
  ]);

  if (itemRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Datum", "Beschreibung", "Stunden", "Satz", "Betrag"]],
      body: itemRows,
      theme: "grid",
      headStyles: {
        fillColor: accentColor as [number, number, number],
        textColor: 255,
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: darkText },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 25, halign: "right" },
        3: { cellWidth: 30, halign: "right" },
        4: { cellWidth: 30, halign: "right" },
      },
      margin: { left: margin, right: margin },
      styles: { lineColor: 220, lineWidth: 0.2 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // --- Auslagen-Tabelle ---
  const expenseRows = data.expenses.map((e) => [
    e.date,
    e.description,
    "",
    "",
    `${e.amount.toFixed(2)} €`,
  ]);

  if (expenseRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Datum", "Auslage", "", "", "Betrag"]],
      body: expenseRows,
      theme: "grid",
      headStyles: {
        fillColor: [200, 200, 200] as [number, number, number],
        textColor: 40,
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: darkText },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30, halign: "right" },
      },
      margin: { left: margin, right: margin },
      styles: { lineColor: 220, lineWidth: 0.2 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // --- Summenblock ---
  const sumX = pageW - margin - 60;
  const labelX = sumX - 50;
  const valueX = pageW - margin;

  doc.setFontSize(9);
  doc.setTextColor(darkText);

  const sums = [
    { label: "Honorar netto", value: data.subtotal },
    ...(data.expenseTotal > 0 ? [{ label: "Auslagen netto", value: data.expenseTotal }] : []),
    { label: `Mehrwertsteuer (${(data.vatRate * 100).toFixed(0)}%)`, value: data.tax },
    ...(data.advancePayment > 0
      ? [{ label: "Vorschuss / Anzahlung", value: -data.advancePayment }]
      : []),
  ];

  sums.forEach((s) => {
    doc.text(s.label, labelX, y, { align: "right" });
    doc.text(`${s.value.toFixed(2)} €`, valueX, y, { align: "right" });
    y += 5;
  });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.text("Gesamtbetrag", labelX, y, { align: "right" });
  doc.text(`${data.total.toFixed(2)} €`, valueX, y, { align: "right" });
  y += 8;

  // --- Zahlungsinfo & Fuß ---
  doc.setFont("helvetica", "normal");
  doc.setTextColor(lightText);
  doc.setFontSize(8);

  if (data.paymentTerms) {
    doc.text(`Zahlungsbedingungen: ${data.paymentTerms}`, margin, y);
    y += 4;
  }
  if (data.bank?.iban) {
    const bankLine = [data.bank.name, data.bank.iban, data.bank.bic].filter(Boolean).join(" · ");
    doc.text(bankLine, margin, y);
    y += 4;
  }
  if (data.notes) {
    y += 3;
    doc.setTextColor(darkText);
    doc.text(data.notes, margin, y, { maxWidth: pageW - margin * 2 });
  }

  return doc;
}
