/**
 * E-Invoice Validation
 * ====================
 *
 * Validates e-invoice data against EN 16931 requirements.
 * Checks mandatory fields, format constraints, and business rules.
 */

import type {
  EInvoiceData,
  EInvoiceLineItem,
  EInvoiceParty,
  EInvoiceValidationResult,
} from "./types";

/**
 * Validate an e-invoice party (seller or buyer).
 */
function validateParty(
  party: EInvoiceParty,
  role: string,
  errors: Array<{ field: string; message: string }>,
  warnings: Array<{ field: string; message: string }>,
  isSeller: boolean
): void {
  if (!party.name?.trim()) {
    errors.push({ field: `${role}.name`, message: `${role} Name ist erforderlich` });
  }
  if (!party.zip?.trim()) {
    errors.push({ field: `${role}.zip`, message: `${role} PLZ ist erforderlich` });
  }
  if (!party.city?.trim()) {
    errors.push({ field: `${role}.city`, message: `${role} Ort ist erforderlich` });
  }
  if (!party.country?.trim() || party.country.length !== 2) {
    errors.push({
      field: `${role}.country`,
      message: `${role} Ländercode (2 Zeichen) ist erforderlich`,
    });
  }

  if (isSeller && !party.vatId?.trim()) {
    warnings.push({
      field: `${role}.vatId`,
      message: "USt-ID des Verkäufers wird für B2B-Rechnungen empfohlen",
    });
  }

  // Validate VAT ID format (rough check)
  if (party.vatId) {
    const vatId = party.vatId.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{2,15}$/.test(vatId)) {
      warnings.push({
        field: `${role}.vatId`,
        message: "USt-ID Format scheint ungültig (erwartet: LLLD+...)",
      });
    }
  }
}

/**
 * Validate a line item.
 */
function validateLineItem(
  item: EInvoiceLineItem,
  index: number,
  errors: Array<{ field: string; message: string }>,
  warnings: Array<{ field: string; message: string }>
): void {
  const prefix = `lineItems[${index}]`;

  if (!item.id?.trim()) {
    errors.push({ field: `${prefix}.id`, message: "Zeilen-ID ist erforderlich" });
  }
  if (!item.name?.trim()) {
    errors.push({ field: `${prefix}.name`, message: "Bezeichnung ist erforderlich" });
  }
  if (item.quantity <= 0) {
    errors.push({ field: `${prefix}.quantity`, message: "Menge muss > 0 sein" });
  }
  if (item.unitPrice < 0) {
    errors.push({ field: `${prefix}.unitPrice`, message: "Einzelpreis muss >= 0 sein" });
  }
  if (item.taxRate < 0 || item.taxRate > 100) {
    errors.push({
      field: `${prefix}.taxRate`,
      message: "Steuersatz muss zwischen 0 und 100 liegen",
    });
  }
  if (!item.unit?.trim()) {
    warnings.push({
      field: `${prefix}.unit`,
      message: "Einheit sollte angegeben werden (z.B. HUR, C62)",
    });
  }
}

/**
 * Validate complete e-invoice data.
 */
export function validateEInvoice(data: EInvoiceData): EInvoiceValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  // Required top-level fields
  if (!data.invoiceNumber?.trim()) {
    errors.push({ field: "invoiceNumber", message: "Rechnungsnummer ist erforderlich" });
  }
  if (!data.invoiceDate?.trim()) {
    errors.push({ field: "invoiceDate", message: "Rechnungsdatum ist erforderlich" });
  }
  if (!data.currency?.trim()) {
    errors.push({ field: "currency", message: "Währung ist erforderlich" });
  }
  if (data.currency && data.currency.length !== 3) {
    errors.push({ field: "currency", message: "Währung muss 3 Zeichen (ISO 4217) sein" });
  }
  if (!data.invoiceTypeCode?.trim()) {
    errors.push({ field: "invoiceTypeCode", message: "Dokumenttyp-Code ist erforderlich" });
  }
  if (!data.profile?.trim()) {
    warnings.push({
      field: "profile",
      message: "Profil nicht angegeben, verwende BASIC als Standard",
    });
  }

  // Parties
  validateParty(data.seller, "seller", errors, warnings, true);
  validateParty(data.buyer, "buyer", errors, warnings, false);

  // Line items
  if (!data.lineItems || data.lineItems.length === 0) {
    errors.push({ field: "lineItems", message: "Mindestens eine Position ist erforderlich" });
  } else {
    data.lineItems.forEach((item, idx) => validateLineItem(item, idx, errors, warnings));
  }

  // Tax
  if (data.taxRate < 0 || data.taxRate > 100) {
    errors.push({ field: "taxRate", message: "Steuersatz muss zwischen 0 und 100 liegen" });
  }

  // Bank
  if (data.bank?.iban) {
    const iban = data.bank.iban.replace(/\s/g, "");
    if (iban.length < 15 || iban.length > 34) {
      errors.push({ field: "bank.iban", message: "IBAN Länge ungültig (15-34 Zeichen)" });
    }
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban.toUpperCase())) {
      errors.push({ field: "bank.iban", message: "IBAN Format ungültig" });
    }
  } else {
    warnings.push({ field: "bank.iban", message: "IBAN fehlt — Zahlungsabwicklung nicht möglich" });
  }

  // Due date should be after invoice date
  if (data.invoiceDate && data.dueDate) {
    if (data.dueDate < data.invoiceDate) {
      warnings.push({ field: "dueDate", message: "Fälligkeitsdatum liegt vor Rechnungsdatum" });
    }
  }

  // Leitweg-ID for B2B XRechnung
  if (!data.leitwegId && !data.buyerReference) {
    warnings.push({
      field: "leitwegId",
      message: "Leitweg-ID/Käuferreferenz fehlt — für B2B XRechnung erforderlich",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an XML string for basic well-formedness.
 */
export function validateXmlWellformed(xml: string): EInvoiceValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  if (!xml?.trim()) {
    errors.push({ field: "xml", message: "XML ist leer" });
    return { valid: false, errors, warnings };
  }

  // Check XML declaration
  if (!xml.startsWith("<?xml")) {
    warnings.push({ field: "xml", message: "XML-Deklaration fehlt" });
  }

  // Check for CrossIndustryInvoice root element
  if (!xml.includes("CrossIndustryInvoice")) {
    errors.push({
      field: "xml",
      message: "Root-Element 'CrossIndustryInvoice' nicht gefunden",
    });
  }

  // Basic tag matching check
  const openTags: string[] = [];
  const tagRegex = /<(\/?)([\w:]+)([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2];
    const isSelfClosing = match[3]?.endsWith("/");

    if (isSelfClosing) continue;

    if (isClosing) {
      const lastOpen = openTags.pop();
      if (lastOpen !== tagName) {
        errors.push({
          field: "xml",
          message: `Tag-Mismatch: erwartet '</${lastOpen}>' aber gefunden '</${tagName}>'`,
        });
        break;
      }
    } else {
      openTags.push(tagName);
    }
  }

  if (openTags.length > 0) {
    errors.push({
      field: "xml",
      message: `Unclosed tags: ${openTags.join(", ")}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
