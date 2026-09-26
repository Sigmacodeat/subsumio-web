/**
 * Gap 9: Chronology Builder — automatische Timeline-Generierung.
 *
 * Harvey-Feature: "Create chronologies" als Kern-Feature im Litigation-Modul.
 *
 * Subsumio-Status vor Gap 9: `forensic-analyst` hat ein `chronologie`-Array,
 * aber keine dedizierte Timeline-UI, keine interaktive Bearbeitung, kein Export.
 *
 * Dieser Modul bietet:
 * - buildChronology(): Extrahiert Timeline aus forensischem Bericht + ON-Tabelle
 * - sortChronology(): Sortiert nach Datum
 * - exportChronologyMarkdown(): Export als Markdown
 * - exportChronologyJSON(): Export als JSON
 * - mergeChronologies(): Merge aus mehreren Quellen (forensic + damage + deadlines)
 */

export interface ChronologyEntry {
  id: string;
  date: string;
  date_iso?: string;
  event: string;
  on_reference?: string;
  quote?: string;
  source: "forensic" | "on_table" | "damage" | "deadline" | "manual" | "document" | "communication";
  category?: "procedure" | "hearing" | "filing" | "deadline" | "payment" | "other";
  importance?: "high" | "medium" | "low";
}

export interface Chronology {
  case_slug: string;
  title: string;
  entries: ChronologyEntry[];
  generated_at: string;
}

interface ForensicReportData {
  chronologie?: Array<{
    datum?: string;
    ereignis?: string;
    on?: string;
    quote?: string;
  }>;
}

interface OnEntryData {
  on_nummer: string;
  datum?: string;
  typ?: string;
}

interface DamageEntryData {
  datum?: string;
  position?: string;
  betrag?: string;
  on?: string;
  quote?: string;
}

interface DeadlineEntryData {
  datum?: string;
  frist?: string;
  beleg_on?: string;
  beleg_quote?: string;
}

/**
 * Parse a date string to ISO format (YYYY-MM-DD).
 * Handles DD.MM.YYYY and DD.MM.YY formats.
 */
function parseDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const fullYear = year!.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

/**
 * Build a chronology from multiple sources.
 */
export function buildChronology(
  caseSlug: string,
  sources: {
    forensicReport?: ForensicReportData | null;
    onTable?: OnEntryData[];
    damageTable?: DamageEntryData[];
    deadlineCalendar?: DeadlineEntryData[];
  }
): Chronology {
  const entries: ChronologyEntry[] = [];
  let id = 0;

  // 1. From forensic report chronologie
  if (sources.forensicReport?.chronologie) {
    for (const entry of sources.forensicReport.chronologie) {
      if (!entry.datum && !entry.ereignis) continue;
      entries.push({
        id: `chrono-${id++}`,
        date: entry.datum ?? "",
        date_iso: entry.datum ? (parseDate(entry.datum) ?? undefined) : undefined,
        event: entry.ereignis ?? "",
        on_reference: entry.on,
        quote: entry.quote,
        source: "forensic",
        category: categorizeEvent(entry.ereignis ?? ""),
        importance: assessImportance(entry.ereignis ?? ""),
      });
    }
  }

  // 2. From ON table
  if (sources.onTable) {
    for (const entry of sources.onTable) {
      if (!entry.datum) continue;
      entries.push({
        id: `on-${id++}`,
        date: entry.datum,
        date_iso: parseDate(entry.datum) ?? undefined,
        event: entry.typ ?? `ON ${entry.on_nummer}`,
        on_reference: entry.on_nummer,
        source: "on_table",
        category: categorizeEvent(entry.typ ?? ""),
        importance: "medium",
      });
    }
  }

  // 3. From damage table
  if (sources.damageTable) {
    for (const entry of sources.damageTable) {
      if (!entry.datum) continue;
      entries.push({
        id: `dmg-${id++}`,
        date: entry.datum,
        date_iso: parseDate(entry.datum) ?? undefined,
        event: `Schadensposition: ${entry.position ?? "Unbekannt"}${entry.betrag ? ` (${entry.betrag})` : ""}`,
        on_reference: entry.on,
        quote: entry.quote,
        source: "damage",
        category: "payment",
        importance: "medium",
      });
    }
  }

  // 4. From deadline calendar
  if (sources.deadlineCalendar) {
    for (const entry of sources.deadlineCalendar) {
      if (!entry.datum) continue;
      entries.push({
        id: `dln-${id++}`,
        date: entry.datum,
        date_iso: parseDate(entry.datum) ?? undefined,
        event: `Frist: ${entry.frist ?? "Unbekannt"}`,
        on_reference: entry.beleg_on,
        quote: entry.beleg_quote,
        source: "deadline",
        category: "deadline",
        importance: "high",
      });
    }
  }

  // Sort by date (ISO if available, otherwise raw date)
  entries.sort((a, b) => {
    const aDate = a.date_iso ?? a.date;
    const bDate = b.date_iso ?? b.date;
    return aDate.localeCompare(bDate);
  });

  return {
    case_slug: caseSlug,
    title: `Chronologie — ${caseSlug}`,
    entries,
    generated_at: new Date().toISOString(),
  };
}

/** The matter's own dated records, as stored on the matter page. */
export interface MatterChronologyData {
  deadlines?: Array<{
    title?: string;
    description?: string;
    due_date?: string;
    status?: string;
    review_status?: string;
    is_notfrist?: boolean;
  }>;
  documents?: Array<{
    name?: string;
    uploadedAt?: string;
    doc_type_label?: string;
    slug?: string;
  }>;
  communications?: Array<{
    channel?: string;
    direction?: string;
    subject?: string;
    summary?: string;
    timestamp?: string;
  }>;
}

function isoDay(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : parseDate(value);
}

function displayDate(iso: string): string {
  const [y, mo, d] = iso.split("-");
  return `${d}.${mo}.${y}`;
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "E-Mail",
  whatsapp: "WhatsApp",
  phone: "Telefonat",
  letter: "Brief",
  portal: "Mandantenportal",
  bea: "beA/webERV",
  other: "Kommunikation",
};

/**
 * Chronology from the matter itself — its deadlines (without rejected AI
 * suggestions), documents and communications. Used when a caller (e.g. the
 * Word add-in) sends only the matter; the tables of the forensic pipeline
 * are optional extras.
 */
export function buildMatterChronology(
  caseSlug: string,
  title: string,
  data: MatterChronologyData
): Chronology {
  const entries: ChronologyEntry[] = [];
  let id = 0;
  for (const d of data.deadlines ?? []) {
    const iso = isoDay(d.due_date);
    if (!iso || d.review_status === "rejected") continue;
    entries.push({
      id: `dln-${id++}`,
      date: displayDate(iso),
      date_iso: iso,
      event: `Frist: ${d.title || d.description || "Frist"}`,
      source: "deadline",
      category: "deadline",
      importance: d.is_notfrist ? "high" : "medium",
    });
  }
  for (const doc of data.documents ?? []) {
    const iso = isoDay(doc.uploadedAt);
    if (!iso) continue;
    entries.push({
      id: `doc-${id++}`,
      date: displayDate(iso),
      date_iso: iso,
      event: `Dokument: ${doc.name || doc.slug || "Dokument"}${doc.doc_type_label ? ` (${doc.doc_type_label})` : ""}`,
      source: "document",
      category: "filing",
      importance: "low",
    });
  }
  for (const c of data.communications ?? []) {
    const iso = isoDay(c.timestamp);
    if (!iso) continue;
    const dir = c.direction === "outgoing" ? "Ausgang" : "Eingang";
    const label = CHANNEL_LABELS[c.channel ?? "other"] ?? "Kommunikation";
    entries.push({
      id: `com-${id++}`,
      date: displayDate(iso),
      date_iso: iso,
      event: `${dir} ${label}: ${c.subject || c.summary || "ohne Betreff"}`,
      source: "communication",
      category: "other",
      importance: "low",
    });
  }
  entries.sort((a, b) => (a.date_iso ?? "").localeCompare(b.date_iso ?? ""));
  return {
    case_slug: caseSlug,
    title: `Chronologie — ${title || caseSlug}`,
    entries,
    generated_at: new Date().toISOString(),
  };
}

function categorizeEvent(event: string): ChronologyEntry["category"] {
  const lower = event.toLowerCase();
  if (lower.includes("vernehmung") || lower.includes("aussage") || lower.includes("hearing"))
    return "hearing";
  if (lower.includes("eingang") || lower.includes("antrag") || lower.includes("eingereicht"))
    return "filing";
  if (lower.includes("frist") || lower.includes("deadline") || lower.includes("verjährung"))
    return "deadline";
  if (lower.includes("zahlung") || lower.includes("betrag") || lower.includes("schaden"))
    return "payment";
  if (lower.includes("festnahme") || lower.includes("durchsuchung") || lower.includes("beschluss"))
    return "procedure";
  return "other";
}

function assessImportance(event: string): ChronologyEntry["importance"] {
  const lower = event.toLowerCase();
  if (
    lower.includes("verjährung") ||
    lower.includes("frist") ||
    lower.includes("festnahme") ||
    lower.includes("durchsuchung")
  )
    return "high";
  if (lower.includes("vernehmung") || lower.includes("antrag") || lower.includes("beschluss"))
    return "medium";
  return "low";
}

/**
 * Export chronology as Markdown.
 */
export function exportChronologyMarkdown(chrono: Chronology): string {
  const lines: string[] = [];
  lines.push(`# ${chrono.title}`);
  lines.push("");
  lines.push(
    `> Generiert von Subsumio Legal AI am ${new Date(chrono.generated_at).toLocaleDateString("de-AT")}`
  );
  lines.push("");
  lines.push("| Datum | Ereignis | ON | Quelle | Wichtigkeit |");
  lines.push("|-------|----------|----|--------|-------------|");
  for (const entry of chrono.entries) {
    const importance =
      entry.importance === "high"
        ? "🔴 Hoch"
        : entry.importance === "medium"
          ? "🟡 Mittel"
          : "🟢 Niedrig";
    lines.push(
      `| ${entry.date} | ${entry.event} | ${entry.on_reference ?? ""} | ${entry.source} | ${importance} |`
    );
  }
  lines.push("");
  // Detailed entries with quotes
  lines.push("## Detail-Einträge");
  lines.push("");
  for (const entry of chrono.entries) {
    lines.push(`### ${entry.date} — ${entry.event}`);
    if (entry.on_reference) lines.push(`- **ON:** ${entry.on_reference}`);
    lines.push(`- **Quelle:** ${entry.source}`);
    if (entry.category) lines.push(`- **Kategorie:** ${entry.category}`);
    if (entry.importance) lines.push(`- **Wichtigkeit:** ${entry.importance}`);
    if (entry.quote) {
      lines.push(`- **Zitat:** > ${entry.quote}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Export chronology as JSON.
 */
export function exportChronologyJSON(chrono: Chronology): string {
  return JSON.stringify(chrono, null, 2);
}
