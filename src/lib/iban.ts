/**
 * IBAN-Prüfung nach ISO 13616 (Prüfziffer Mod 97-10). Ein Tippfehler in der
 * IBAN eines Zahlungslinks/EPC-QR führt sonst zu einer fehlgeschlagenen oder
 * fehlgeleiteten Überweisung.
 */

/** IBAN ohne Leerzeichen, in Großbuchstaben. */
export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Länge je Land für die DACH-Region und die häufigsten SEPA-Länder. */
const IBAN_LENGTH: Record<string, number> = {
  AT: 20,
  DE: 22,
  CH: 21,
  LI: 21,
  IT: 27,
  FR: 27,
  NL: 18,
  BE: 16,
  LU: 20,
  ES: 24,
  CZ: 24,
  SK: 24,
  SI: 19,
  HU: 28,
  PL: 28,
};

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expected = IBAN_LENGTH[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}
