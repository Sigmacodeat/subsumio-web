/**
 * GoBD (Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern,
 * Aufzeichnungen und Unterlagen in elektronischer Form) — Bausteine für die
 * revisionssichere Behandlung steuerlich relevanter Belege.
 *
 * EHRLICHKEITSREGEL (wie /security bei SOC 2): Diese Helfer liefern die
 * TECHNISCHEN Bausteine — Aufbewahrungsfrist-Stempel + Manipulations-Evidenz
 * per Hash. Volle GoBD-Konformität verlangt zusätzlich eine
 * Verfahrensdokumentation der Kanzlei und die Abnahme durch den steuerlichen
 * Berater/Prüfer. Nichts hier behauptet, der reine Speicherort sei von sich
 * aus „revisionssicher".
 */

/** Steuerliche Aufbewahrungsfrist für Buchungsbelege: 10 Jahre (§ 147 Abs. 3 AO). */
export const GOBD_RETENTION_YEARS = 10;

/** ISO-Datum (YYYY-MM-DD) für „heute + 10 Jahre" — Ende der Aufbewahrungspflicht. */
export function retentionUntil(from: Date = new Date()): string {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + GOBD_RETENTION_YEARS);
  return d.toISOString().split("T")[0];
}

/**
 * SHA-256-Hex über einen kanonischen String. Manipulations-Evidenz: wird der
 * Hash bei Ausstellung gespeichert, deckt eine spätere Neuberechnung jede
 * Änderung an den belegrelevanten Feldern auf (Unveränderbarkeit nachprüfbar,
 * GoBD Rz. 107 ff., § 146 Abs. 4 AO).
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return sha256HexBytes(bytes);
}

/**
 * SHA-256-Hex über Roh-Bytes — für hochgeladene Belege (PDF/Bild), deren
 * Manipulations-Evidenz der Datei-Inhalt selbst ist, nicht ein kanonischer
 * Feld-String. Wird der Hash beim Ingest gespeichert, deckt eine spätere
 * Neuberechnung über dieselbe Datei jede Byte-Änderung auf (§ 146 Abs. 4 AO).
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
 * GoBD-Bausteine.
 */
export function gobdFrontmatter(contentHash: string, from: Date = new Date()) {
  return {
    gobd_retention: true,
    retention_until: retentionUntil(from),
    content_hash: contentHash,
    hashed_at: from.toISOString(),
  };
}
