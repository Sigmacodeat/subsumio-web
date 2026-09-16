/**
 * Aktenblatt — a deterministic text rendering of a matter's frontmatter.
 *
 * Matters created in the wizard carry everything (parties, court, deadlines,
 * documents, tasks) in frontmatter and usually have no body text. The engine
 * chunks, embeds and full-text-indexes only the body, so such matters were
 * invisible to search and to the assistant ("keine Informationen zur Akte").
 * The pages route keeps this block in the page content, between markers, and
 * refreshes it on every create/merge of a `legal/cases/…` page. Text the
 * lawyer wrote outside the markers is left untouched.
 */

export const AKTENBLATT_START = "<!-- aktenblatt:start -->";
export const AKTENBLATT_END = "<!-- aktenblatt:end -->";

type Rec = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): Rec[] =>
  Array.isArray(v) ? v.filter((x): x is Rec => !!x && typeof x === "object") : [];
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? [str(v)] : [];

const STATUS_DE: Record<string, string> = {
  open: "offen",
  active: "aktiv",
  closed: "geschlossen",
  archived: "archiviert",
  done: "erledigt",
  pending: "ausstehend",
  overdue: "überfällig",
};

function line(label: string, value: string): string | null {
  return value ? `- ${label}: ${value}` : null;
}

export interface AktenblattExtras {
  /** Standalone `legal_deadline` pages linked to the matter via `case_slug`. */
  linkedDeadlines?: Rec[];
}

/** Render the Aktenblatt body (without markers) from case frontmatter. */
export function renderAktenblatt(title: string, fm: Rec, extras: AktenblattExtras = {}): string {
  const out: string[] = [];
  const caseNo = str(fm.case_number);
  out.push(`# Aktenblatt${caseNo ? ` ${caseNo}` : ""}${title ? ` — ${title}` : ""}`);
  out.push("");
  const facts = [
    line("Aktenzeichen", caseNo),
    line("Mandant", str(fm.client_name)),
    line(
      "Gegner",
      [str(fm.opponent_name), ...arr(fm.additional_opponents).map((o) => str(o.name))]
        .filter(Boolean)
        .join(", ")
    ),
    line("Gericht", str(fm.court_name)),
    line("Gerichtliches Aktenzeichen", str(fm.court_file_number)),
    line("Rechtsgebiet", [str(fm.legal_area), str(fm.sub_area)].filter(Boolean).join(" / ")),
    line("Status", STATUS_DE[str(fm.status)] ?? str(fm.status)),
    line("Priorität", str(fm.priority)),
    line("Sachbearbeiter", str(fm.own_lawyer_name)),
    line(
      "Streitwert",
      str(fm.dispute_value) ||
        (fm.estimated_value && typeof fm.estimated_value === "object"
          ? `${str((fm.estimated_value as Rec).min)}–${str((fm.estimated_value as Rec).max)} ${str((fm.estimated_value as Rec).currency)}`.trim()
          : "")
    ),
    line("Schlagworte", strs(fm.tags).join(", ")),
  ].filter((l): l is string => !!l);
  out.push(...facts);

  const facts_text = str(fm.facts) || str(fm.matter) || str(fm.description);
  if (facts_text) out.push("", "## Sachverhalt", "", facts_text);

  const claims = strs(fm.claims);
  if (claims.length) out.push("", "## Ansprüche", "", ...claims.map((c) => `- ${c}`));
  const defenses = strs(fm.defenses);
  if (defenses.length) out.push("", "## Verteidigung", "", ...defenses.map((d) => `- ${d}`));

  const seen = new Set<string>();
  const normalized = [
    ...arr(fm.deadlines).map((d) => ({
      title: str(d.title) || str(d.description),
      due_date: str(d.due_date),
      status: str(d.status),
      type: str(d.type),
    })),
    ...(extras.linkedDeadlines ?? []).map((p) => {
      const dfm = (p.frontmatter && typeof p.frontmatter === "object" ? p.frontmatter : p) as Rec;
      return {
        title: str(p.title) || str(dfm.title),
        due_date: str(dfm.due_date) || str(dfm.date),
        status: str(dfm.status),
        type: str(dfm.deadline_type) || str(dfm.type),
      };
    }),
  ];
  const deadlines = normalized.filter((d) => {
    const key = `${d.due_date}|${d.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deadlines.length) {
    out.push("", "## Fristen", "");
    for (const d of deadlines) {
      const status = STATUS_DE[d.status] ?? d.status;
      out.push(
        `- ${d.due_date || "ohne Datum"}: ${d.title || "Frist"}${status ? ` (${status})` : ""}${d.type ? ` [${d.type}]` : ""}`
      );
    }
  }

  const documents = arr(fm.documents);
  if (documents.length) {
    out.push("", "## Dokumente", "");
    for (const d of documents)
      out.push(
        `- ${str(d.name) || str(d.title) || str(d.slug) || "Dokument"}${str(d.type) ? ` (${str(d.type)})` : ""}`
      );
  }

  const tasks = arr(fm.tasks);
  const openTasks = tasks.filter((t) => t.done !== true);
  if (openTasks.length) {
    out.push("", "## Offene Aufgaben", "");
    for (const t of openTasks) out.push(`- ${str(t.text) || str(t.title)}`);
  }

  const evidence = arr(fm.evidence);
  if (evidence.length) {
    out.push("", "## Beweismittel", "");
    for (const e of evidence) out.push(`- ${str(e.title) || str(e.description) || str(e.name)}`);
  }

  return out.join("\n").trim();
}

/** Replace (or append) the marker block in existing page content. */
export function withAktenblatt(existing: string, block: string): string {
  const wrapped = `${AKTENBLATT_START}\n${block}\n${AKTENBLATT_END}`;
  const s = existing ?? "";
  const start = s.indexOf(AKTENBLATT_START);
  const end = s.indexOf(AKTENBLATT_END);
  if (start >= 0 && end > start) {
    return (s.slice(0, start) + wrapped + s.slice(end + AKTENBLATT_END.length)).trim();
  }
  const own = s.trim();
  return own ? `${own}\n\n${wrapped}` : wrapped;
}

/** Content for a legal_case page: the lawyer's own text plus a fresh Aktenblatt. */
export function caseContentWithAktenblatt(
  existing: string,
  title: string,
  fm: Rec,
  extras: AktenblattExtras = {}
): string {
  return withAktenblatt(existing, renderAktenblatt(title, fm, extras));
}

export function isDeadlineSlug(slug: string | undefined): boolean {
  return typeof slug === "string" && slug.startsWith("legal/deadlines/");
}

export function isCaseSlug(slug: string | undefined): boolean {
  return typeof slug === "string" && slug.startsWith("legal/cases/");
}
