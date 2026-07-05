/**
 * Swiss QR-Bill & EPC-QR (GiroCode) Generation
 * =============================================
 *
 * Swiss QR-Bill: ISO 20022 pain.001.001.09 derivative (Swiss implementation)
 * EPC-QR: European Payments Council Quick Response Code (SepaQR / GiroCode)
 *
 * Both generate a QR code string that can be rendered as an image using
 * the `qrcode` package (already in dependencies).
 */

import QRCode from "qrcode";

import type { EpcQrData, SwissQrBillData } from "./types";

// =====================
// EPC-QR (GiroCode / SepaQR)
// =====================

/**
 * Generate the EPC-QR payload string.
 *
 * Format per EPC069-12 v2.1 (European Payments Council):
 * Line 1: Service tag (BCD)
 * Line 2: Version (001 or 002)
 * Line 3: Encoding (1=UTF-8, 2=ISO-8859-1)
 * Line 4: Identification (SCT)
 * Line 5: BIC
 * Line 6: Name
 * Line 7: IBAN
 * Line 8: Amount (EUR###.##)
 * Line 9: Purpose
 * Line 10: Reference
 * Line 11: Remittance info
 * Line 12: Beneficiary to originator info
 */
export function generateEpcQrPayload(data: EpcQrData): string {
  const lines = [
    "BCD",
    "002",
    "1",
    "SCT",
    data.bic ?? "",
    data.name,
    data.iban.replace(/\s/g, ""),
    data.amount ? `EUR${data.amount.toFixed(2)}` : "",
    data.purpose ?? "",
    data.reference ?? "",
    data.remittanceInfo ?? "",
    data.beneficiaryToOriginatorInfo ?? "",
  ];

  return lines.join("\n");
}

/**
 * Generate an EPC-QR code as a data URL.
 */
export async function generateEpcQrCode(data: EpcQrData): Promise<string> {
  const payload = generateEpcQrPayload(data);
  return QRCode.toDataURL(payload, {
    width: 300,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

// =====================
// Swiss QR-Bill
// =====================

/**
 * Generate the Swiss QR-Bill payload string.
 *
 * Format per Swiss Implementation Guidelines QR-bill v2.2:
 * The QR code contains a structured text with the following sections:
 * 1. Header (QR type, version, coding type)
 * 2. Creditor IBAN
 * 3. Creditor address
 * 4. Ultimate creditor (optional)
 * 5. Payment amount
 * 6. Ultimate debtor (optional)
 * 7. Payment reference (QRR/SCOR/NON)
 * 8. Additional information
 * 9. Alternative procedure (optional)
 */
export function generateSwissQrPayload(data: SwissQrBillData): string {
  const lines: string[] = [];

  // Header
  lines.push("SPC"); // QR type
  lines.push("0200"); // Version
  lines.push("1"); // Coding type (1=UTF-8)

  // Creditor IBAN
  lines.push(data.iban.replace(/\s/g, ""));

  // Creditor address (6 fields: name, street, building number, zip, city, country)
  lines.push(data.creditor.name);
  lines.push(data.creditor.street ?? "");
  lines.push(""); // building number (not separately modeled)
  lines.push(data.creditor.zip);
  lines.push(data.creditor.city);
  lines.push(data.creditor.country);

  // Ultimate creditor (empty - optional, 6 fields)
  for (let i = 0; i < 6; i++) lines.push("");

  // Payment amount
  lines.push(`${data.amount.toFixed(2)}`);
  lines.push(data.currency);

  // Ultimate debtor (optional, 6 fields)
  if (data.debtor) {
    lines.push(data.debtor.name);
    lines.push(data.debtor.street ?? "");
    lines.push(""); // building number
    lines.push(data.debtor.zip);
    lines.push(data.debtor.city);
    lines.push(data.debtor.country);
  } else {
    for (let i = 0; i < 6; i++) lines.push("");
  }

  // Payment reference
  const refType = data.reference.length === 27 ? "QRR" : "SCOR";
  lines.push(refType);
  lines.push(data.reference);

  // Additional information
  lines.push(data.unstructuredMessage ?? "");
  lines.push(data.billingInformation ?? "");
  lines.push("");

  // Alternative procedure (optional)
  if (data.altProcedure) {
    lines.push(data.altProcedure.algorithm);
    lines.push(data.altProcedure.param);
  } else {
    lines.push("");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate a Swiss QR-Bill QR code as a data URL.
 */
export async function generateSwissQrCode(data: SwissQrBillData): Promise<string> {
  const payload = generateSwissQrPayload(data);
  return QRCode.toDataURL(payload, {
    width: 400,
    margin: 0,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

/**
 * Validate a Swiss QR-IBAN (has QR-IID starting with 30xxx or 31xxx).
 */
export function isQrIban(iban: string): boolean {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (clean.length < 5) return false;
  const iid = clean.slice(4, 9);
  const iidNum = parseInt(iid, 10);
  return iidNum >= 30000 && iidNum <= 31999;
}

/**
 * Calculate the modulo-10 recursive check digit (Swiss QR reference).
 */
export function calculateQrReferenceCheckDigit(reference: string): string {
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 5, 3];
  let carry = 0;
  for (const char of reference.replace(/\s/g, "")) {
    const digit = parseInt(char, 10);
    if (isNaN(digit)) continue;
    carry = table[(carry + digit) % 10];
  }
  return String((10 - carry) % 10);
}

/**
 * Validate a Swiss QR reference number.
 */
export function validateQrReference(reference: string): boolean {
  const clean = reference.replace(/\s/g, "");
  if (clean.length !== 27) return false;
  const checkDigit = clean.slice(-1);
  const expected = calculateQrReferenceCheckDigit(clean.slice(0, -1));
  return checkDigit === expected;
}
