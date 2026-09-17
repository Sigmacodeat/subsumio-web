/**
 * Bausteine für die ordnungsmäßige Aufbewahrung steuerlich relevanter Belege
 * (Österreich: §§ 131, 132 BAO). Datei- und Bezeichnernamen ("gobd…") sind
 * historisch und bleiben aus Kompatibilitätsgründen (Frontmatter-Feld
 * `gobd_retention`) bestehen.
 *
 * EHRLICHKEITSREGEL (wie /security bei SOC 2): Diese Helfer liefern die
 * TECHNISCHEN Bausteine — Aufbewahrungsfrist-Stempel + Manipulations-Evidenz
 * per Hash. Die Ordnungsmäßigkeit verlangt zusätzlich eine
 * Verfahrensdokumentation der Kanzlei und die Prüfung durch die Steuerberatung. Nichts hier behauptet, der reine Speicherort sei von sich
 * aus „revisionssicher".
 */

/** Steuerliche Aufbewahrungsfrist für Bücher, Aufzeichnungen und Belege: 7 Jahre (§ 132 BAO). */
export const GOBD_RETENTION_YEARS = 7;

/**
 * ISO-Datum (YYYY-MM-DD) für das Ende der Aufbewahrungspflicht. § 132 BAO
 * rechnet die sieben Jahre ab dem Schluss des Kalenderjahres — deshalb ist das
 * Ergebnis immer der 31.12. des siebenten Folgejahres (nie kürzer als die
 * gesetzliche Frist).
 */
export function retentionUntil(from: Date = new Date()): string {
  return `${from.getUTCFullYear() + GOBD_RETENTION_YEARS}-12-31`;
}

/**
 * SHA-256-Hex über einen kanonischen String. Manipulations-Evidenz: wird der
 * Hash bei Ausstellung gespeichert, deckt eine spätere Neuberechnung jede
 * Änderung an den belegrelevanten Feldern auf (Unveränderbarkeit nachprüfbar,
 * § 131 BAO).
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return sha256HexBytes(bytes);
}

/**
 * SHA-256-Hex über Roh-Bytes — für hochgeladene Belege (PDF/Bild), deren
 * Manipulations-Evidenz der Datei-Inhalt selbst ist, nicht ein kanonischer
 * Feld-String. Wird der Hash beim Ingest gespeichert, deckt eine spätere
 * Neuberechnung über dieselbe Datei jede Byte-Änderung auf (§ 131 BAO).
 */
export async function sha256HexBytes(input: ArrayBuffer | Uint8Array): Promise<string> {
  // Über eine frische, ArrayBuffer-gestützte Kopie hashen — vermeidet das
  // SharedArrayBuffer-Typing-Problem von `BufferSource` bei Uint8Array-Eingaben.
  const data = input instanceof Uint8Array ? new Uint8Array(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Belegrelevante Felder einer Rechnung, über die der Inhalts-Hash gebildet wird. */
export interface InvoiceHashFields {
  number: string;
  client: string;
  caseNumber?: string;
  date: string;
  subtotal: number;
  expenseTotal?: number;
  advancePayment?: number;
  tax: number;
  total: number;
  items: Array<{ date: string; description: string; hours: number; rate: number; amount: number }>;
  expenses?: Array<{ date: string; description: string; amount: number }>;
}

/**
 * Kanonischer String über die belegrelevanten Rechnungsfelder — die EINE
 * Stelle, an der Ausstellung (gobdFrontmatter beim Anlegen) und Verifikation
 * (Hash neu rechnen, Soll/Ist) ihren Eingabe-String bilden. Beide Pfade MÜSSEN
 * dieselbe Funktion nutzen, sonst meldet die Prüfung fälschlich „verändert".
 * Reihenfolge/Trennzeichen sind Teil des Vertrags — nicht ändern, ohne dass
 * alle Alt-Hashes ungültig werden.
 */
export function invoiceContentString(inv: InvoiceHashFields): string {
  return [
    inv.number,
    inv.client,
    inv.caseNumber ?? "",
    inv.date,
    inv.subtotal,
    inv.expenseTotal ?? 0,
    inv.advancePayment ?? 0,
    inv.tax,
    inv.total,
    inv.items.map((i) => `${i.date}|${i.description}|${i.hours}|${i.rate}|${i.amount}`).join(";"),
    (inv.expenses ?? []).map((i) => `${i.date}|${i.description}|${i.amount}`).join(";"),
  ].join("¦");
}

/**
 * Frontmatter-Felder, die einen Beleg als aufbewahrungspflichtig +
 * manipulations-evident markieren — der maschinenlesbare Teil der
 * Aufbewahrungs-Bausteine.
 */
export function gobdFrontmatter(contentHash: string, from: Date = new Date()) {
  return {
    gobd_retention: true,
    retention_until: retentionUntil(from),
    content_hash: contentHash,
    hashed_at: from.toISOString(),
  };
}
