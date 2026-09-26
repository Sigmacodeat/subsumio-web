/**
 * Printable HTML of an invoice (browser print dialog). Every user-supplied
 * value is escaped before it is placed in the markup.
 */
import { formatDate, formatEur } from "@/lib/utils";
import type { KanzleiSettings } from "@/lib/kanzlei-settings";
import type { Invoice } from "@/lib/invoicing-view";

/** Escape user input before injecting into HTML strings — prevents XSS. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function escapeHtmlLines(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export function invoicePrintHtml(
  inv: Invoice,
  settings: KanzleiSettings | null | undefined,
  vatRate: number,
  lang: string
): string {
  const num = (n: number) =>
    new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(n) ? n : 0
    );
  return `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Rechnung ${escapeHtml(inv.number)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: hsl(222, 8%, 20%); font-size: 14px; }
  .header { border-bottom: 2px solid hsl(213, 46%, 42%); padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { margin: 0; font-size: 28px; color: hsl(213, 46%, 42%); }
  .header p { margin: 4px 0; color: hsl(222, 8%, 40%); }
  .meta { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .meta-box { background: hsl(222, 8%, 97%); padding: 15px; border-radius: 8px; }
  .meta-box strong { display: block; margin-bottom: 8px; color: hsl(222, 8%, 20%); }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: hsl(222, 8%, 94%); padding: 12px; text-align: left; font-weight: 600; }
  td { padding: 12px; border-bottom: 1px solid hsl(222, 8%, 90%); }
  .right { text-align: right; }
  .totals { margin-top: 20px; border-top: 2px solid hsl(222, 8%, 90%); padding-top: 20px; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
  .total-row.grand { font-size: 18px; font-weight: bold; color: hsl(213, 46%, 42%); border-top: 2px solid hsl(213, 46%, 42%); margin-top: 10px; padding-top: 15px; }
  .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid hsl(222, 8%, 90%); font-size: 12px; color: hsl(222, 8%, 40%); }
  .muted { color: hsl(222, 8%, 40%); }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>Rechnung</h1>
    <p><strong>${escapeHtml(settings?.kanzleiName || "Kanzlei")}</strong></p>
    <p>${escapeHtml(settings?.anwaltName || "")}</p>
    ${settings?.kanzleiAdresse ? `<p>${escapeHtmlLines(settings.kanzleiAdresse)}</p>` : ""}
    ${settings?.kanzleiEmail || settings?.kanzleiTelefon ? `<p>${escapeHtml([settings?.kanzleiEmail, settings?.kanzleiTelefon].filter(Boolean).join(" · "))}</p>` : ""}
    ${settings?.kammerNummer ? `<p>${escapeHtml(settings.kammerNummer)}</p>` : ""}
    ${settings?.ustId ? `<p>USt-ID: ${escapeHtml(settings.ustId)}</p>` : ""}
  </div>

  <div class="meta">
    <div class="meta-box">
      <strong>Rechnung an:</strong>
      ${escapeHtml(inv.client)}
    </div>
    <div class="meta-box">
      <strong>Rechnungsdetails:</strong>
      <p>Rechnungs-Nr.: ${escapeHtml(inv.number)}</p>
      <p>Datum: ${escapeHtml(formatDate(inv.date))}</p>
      ${inv.dueDate ? `<p>Fällig: ${escapeHtml(formatDate(inv.dueDate))}</p>` : ""}
      ${inv.caseNumber ? `<p>Aktenzeichen: ${escapeHtml(inv.caseNumber)}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Beschreibung</th>
        <th class="right">Stunden</th>
        <th class="right">Satz (€)</th>
        <th class="right">Betrag (€)</th>
      </tr>
    </thead>
    <tbody>
      ${inv.items
        .map(
          (item) => `
        <tr>
          <td>${escapeHtml(formatDate(item.date))}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="right">${item.hours > 0 ? num(item.hours) : "—"}</td>
          <td class="right">${item.hours > 0 ? num(item.rate) : "—"}</td>
          <td class="right">${num(item.amount)}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  ${
    inv.expenses.length > 0
      ? `
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Auslage</th>
          <th class="right">Betrag (€)</th>
        </tr>
      </thead>
      <tbody>
        ${inv.expenses
          .map(
            (item) => `
          <tr>
            <td>${escapeHtml(formatDate(item.date))}</td>
            <td>${escapeHtml(item.description)}</td>
            <td class="right">${num(item.amount)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `
      : ""
  }

  <div class="totals">
    <div class="total-row"><span>Honorar netto</span><span>${formatEur(inv.subtotal, lang)}</span></div>
    ${inv.expenseTotal > 0 ? `<div class="total-row"><span>Auslagen netto</span><span>${formatEur(inv.expenseTotal, lang)}</span></div>` : ""}
    <div class="total-row"><span>Mehrwertsteuer (${(vatRate * 100).toFixed(0)}%)</span><span>${formatEur(inv.tax, lang)}</span></div>
    ${inv.advancePayment > 0 ? `<div class="total-row"><span>Vorschuss / Anzahlung</span><span>− ${formatEur(inv.advancePayment, lang)}</span></div>` : ""}
    <div class="total-row grand"><span>Gesamtbetrag</span><span>${formatEur(inv.total, lang)}</span></div>
  </div>

  ${inv.notes ? `<p style="margin-top: 30px; color: hsl(222, 8%, 40%);">${escapeHtml(inv.notes)}</p>` : ""}

  <div class="footer">
    <p>Zahlungsbedingungen: ${escapeHtml(inv.paymentTerms || "14 Tage netto")}</p>
    ${inv.bank?.iban ? `<p>${escapeHtml([inv.bank.name, inv.bank.iban, inv.bank.bic].filter(Boolean).join(" · "))}</p>` : ""}
    <p>${escapeHtml(settings?.rechnungFooter || "Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.")}</p>
  </div>

  <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body>
</html>`;
}
