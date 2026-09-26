// The import plan: for every row of the file one decision (create, complete,
// skip, error) with a reason, computed before anything is written. The dry run
// shows exactly this plan; the import executes it.

import { IMPORT_KINDS, type ColumnMapping, type ImportKind } from "./fields";
import {
  isEmail,
  normaliseKey,
  normaliseName,
  parseAmount,
  parseCaseStatus,
  parseContactRole,
  parseDate,
  parseMinutes,
  parseYesNo,
} from "./values";
import { caseNumberKey } from "@/lib/legal/geschaeftszahl";

export const IMPORT_SOURCE = "kanzlei-import";

export interface ExistingPage {
  slug: string;
  title?: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

export interface ExistingData {
  cases: ExistingPage[];
  contacts: ExistingPage[];
  deadlines: ExistingPage[];
}

export interface ImportedTimeEntry {
  id: string;
  description: string;
  minutes: number;
  date: string;
  rate?: number;
  billable: boolean;
  billed: boolean;
  lawyer?: string;
  source: typeof IMPORT_SOURCE;
  import_project_id: string;
}

export type PlannedWrite =
  | {
      op: "create_page";
      slug: string;
      title: string;
      type: "legal_case" | "legal_contact" | "legal_deadline";
      content?: string;
      frontmatter: Record<string, unknown>;
    }
  | { op: "complete_contact"; slug: string; fields: Record<string, string> }
  | { op: "add_time_entry"; caseSlug: string; entry: ImportedTimeEntry };

export type PlanAction = "create" | "complete" | "skip" | "error";

export interface PlanRow {
  /** Line in the file (the header is line 1). */
  row: number;
  label: string;
  action: PlanAction;
  reason?: string;
  warnings: string[];
  write?: PlannedWrite;
}

export interface ImportPlan {
  kind: ImportKind;
  projectId: string;
  rows: PlanRow[];
  counts: Record<PlanAction, number>;
}

export interface PlanOptions {
  projectId: string;
  /** yyyy-mm-dd, the import day in the firm's time zone. */
  today: string;
  /** ISO timestamp written as imported_at. */
  now: string;
  /** Deadlines before today are skipped unless set. */
  includePastDeadlines?: boolean;
  /** Time entries whose "billed" cell is empty or unmapped. Default: not billed. */
  defaultBilled?: boolean;
}

const alive = (p: ExistingPage) => p.frontmatter?.status !== "tombstoned";

function translit(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function shortId(projectId: string): string {
  return (
    projectId
      .replace(/[^a-z0-9]/gi, "")
      .slice(-8)
      .toLowerCase() || "import"
  );
}

function str(fm: Record<string, unknown> | undefined, key: string): string {
  const v = fm?.[key];
  return typeof v === "string" ? v.trim() : "";
}

type Reader = (key: string) => string;

function reader(row: string[], mapping: ColumnMapping): Reader {
  return (key) => {
    const idx = mapping[key] ?? -1;
    return idx >= 0 ? String(row[idx] ?? "").trim() : "";
  };
}

/** Resolves "Akte" cells to a matter by case number first, then by exact title. */
function caseResolver(cases: ExistingPage[]) {
  const byNumber = new Map<string, string[]>();
  const byTitle = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, slug: string) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), slug]);
  };
  for (const c of cases) {
    push(byNumber, caseNumberKey(c.frontmatter?.case_number), c.slug);
    push(byTitle, normaliseName(c.title), c.slug);
  }
  const bySlug = new Map(cases.map((c) => [c.slug, c]));
  return (ref: string): { slug: string; page: ExistingPage } | { error: string } => {
    const numberHits = byNumber.get(caseNumberKey(ref)) ?? [];
    const hits = numberHits.length > 0 ? numberHits : (byTitle.get(normaliseName(ref)) ?? []);
    if (hits.length === 1) return { slug: hits[0], page: bySlug.get(hits[0])! };
    if (hits.length > 1) return { error: `„${ref}“ passt zu ${hits.length} Akten` };
    return { error: `Akte „${ref}“ nicht gefunden. Zuerst die Akten importieren.` };
  };
}

function count(rows: PlanRow[]): Record<PlanAction, number> {
  const counts: Record<PlanAction, number> = { create: 0, complete: 0, skip: 0, error: 0 };
  for (const r of rows) counts[r.action]++;
  return counts;
}

/** Stable identity of a matter without Aktenzahl: title + client. */
function titleClientKey(title: unknown, client: unknown): string {
  const t = normaliseName(title);
  return t ? `${t}|${normaliseName(client)}` : "";
}

/** Short deterministic suffix — the same row gets the same slug on every run. */
function stableSuffix(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

function planCases(
  table: string[][],
  mapping: ColumnMapping,
  existing: ExistingData,
  opts: PlanOptions
): PlanRow[] {
  const slugs = new Set(existing.cases.map((c) => c.slug));
  const numbers = new Map<string, string>();
  // Matters without Aktenzahl are recognised again by title + client, so a
  // second import of the same file does not create them twice.
  const titled = new Map<string, string>();
  for (const c of existing.cases) {
    const n = caseNumberKey(c.frontmatter?.case_number);
    if (n) numbers.set(n, "existing");
    if (!alive(c)) continue;
    const tk = titleClientKey(c.title, c.frontmatter?.client_name);
    if (tk && !n) titled.set(tk, "existing");
  }
  return table.map((cells, i) => {
    const row = i + 2;
    const val = reader(cells, mapping);
    const title = val("title");
    const caseNumber = val("case_number");
    const label = title || caseNumber || `Zeile ${row}`;
    const warnings: string[] = [];
    if (!title) return { row, label, action: "error", reason: "Bezeichnung fehlt", warnings };
    const numberKey = caseNumberKey(caseNumber);
    if (numberKey && numbers.has(numberKey)) {
      const where = numbers.get(numberKey);
      return {
        row,
        label,
        action: "skip",
        reason:
          where === "existing"
            ? `Aktenzahl ${caseNumber} existiert bereits`
            : `Aktenzahl ${caseNumber} steht schon in Zeile ${where}`,
        warnings,
      };
    }
    const tKey = numberKey ? "" : titleClientKey(title, val("client_name"));
    if (tKey && titled.has(tKey)) {
      const where = titled.get(tKey);
      return {
        row,
        label,
        action: "skip",
        reason:
          where === "existing"
            ? `Akte „${title}“ mit diesem Mandanten existiert bereits`
            : `Akte „${title}“ mit diesem Mandanten steht schon in Zeile ${where}`,
        warnings,
      };
    }
    let slug = `legal/cases/${translit(caseNumber || title) || `akte-${row}`}`;
    if (slugs.has(slug)) slug = `${slug}-${stableSuffix(numberKey || tKey || String(row))}`;
    if (slugs.has(slug)) {
      return { row, label, action: "skip", reason: "Akte existiert bereits", warnings };
    }
    const status = parseCaseStatus(val("status"));
    if (!status.known) warnings.push(`Status „${val("status")}“ unbekannt, als offen übernommen`);
    const openedRaw = val("opened_at");
    const openedAt = openedRaw ? parseDate(openedRaw) : null;
    if (openedRaw && !openedAt) warnings.push(`Datum „${openedRaw}“ nicht erkannt, weggelassen`);
    slugs.add(slug);
    if (numberKey) numbers.set(numberKey, String(row));
    if (tKey) titled.set(tKey, String(row));
    const frontmatter: Record<string, unknown> = {
      type: "legal_case",
      case_number: caseNumber || undefined,
      client_name: val("client_name") || undefined,
      opponent_name: val("opponent_name") || undefined,
      legal_area: val("legal_area") || undefined,
      court_name: val("court_name") || undefined,
      own_lawyer_name: val("own_lawyer_name") || undefined,
      status: status.status,
      opened_at: openedAt ?? undefined,
      source: IMPORT_SOURCE,
      import_project_id: opts.projectId,
      imported_at: opts.now,
    };
    if (status.status === "archived") {
      frontmatter.archived_at = opts.now;
      frontmatter.archived_by = "Kanzlei-Import";
    }
    return {
      row,
      label,
      action: "create",
      warnings,
      write: { op: "create_page", slug, title, type: "legal_case", frontmatter },
    };
  });
}

const CONTACT_FIELDS = ["company", "email", "phone", "address", "notes"] as const;

function planContacts(
  table: string[][],
  mapping: ColumnMapping,
  existing: ExistingData,
  opts: PlanOptions
): PlanRow[] {
  const contacts = existing.contacts.filter(alive);
  const byEmail = new Map<string, ExistingPage>();
  const byName = new Map<string, ExistingPage[]>();
  for (const c of contacts) {
    const email = normaliseKey(str(c.frontmatter, "email"));
    if (email) byEmail.set(email, c);
    const name = normaliseName(str(c.frontmatter, "name") || c.title);
    if (name) byName.set(name, [...(byName.get(name) ?? []), c]);
  }
  const seen = new Map<string, number>();
  const completed = new Set<string>();
  return table.map((cells, i) => {
    const row = i + 2;
    const val = reader(cells, mapping);
    const name = val("name");
    const label = name || `Zeile ${row}`;
    const warnings: string[] = [];
    if (!name) return { row, label, action: "error", reason: "Name fehlt", warnings };
    let email = val("email");
    if (email && !isEmail(email)) {
      warnings.push(`E-Mail „${email}“ ungültig, weggelassen`);
      email = "";
    }
    const role = parseContactRole(val("role"));
    if (!role.known) warnings.push(`Rolle „${val("role")}“ unbekannt, als „sonstige“ übernommen`);
    const values: Record<string, string> = {
      company: val("company"),
      email,
      phone: val("phone"),
      address: val("address"),
      notes: val("notes"),
    };
    const fileKey = email ? `mail:${normaliseKey(email)}` : `name:${normaliseName(name)}`;
    const earlier = seen.get(fileKey);
    if (earlier) {
      return {
        row,
        label,
        action: "skip",
        reason: `Doppelt in der Datei (Zeile ${earlier})`,
        warnings,
      };
    }
    seen.set(fileKey, row);

    const nameHits = byName.get(normaliseName(name)) ?? [];
    const match =
      (email ? byEmail.get(normaliseKey(email)) : undefined) ??
      (nameHits.length === 1 ? nameHits[0] : undefined);
    if (!match && nameHits.length > 1) {
      return {
        row,
        label,
        action: "skip",
        reason: `${nameHits.length} Kontakte heißen „${name}“. Bitte von Hand zuordnen.`,
        warnings,
      };
    }
    if (match) {
      if (completed.has(match.slug)) {
        return {
          row,
          label,
          action: "skip",
          reason: "Kontakt wird schon von einer früheren Zeile ergänzt",
          warnings,
        };
      }
      const fields: Record<string, string> = {};
      for (const key of CONTACT_FIELDS) {
        if (values[key] && !str(match.frontmatter, key)) fields[key] = values[key];
      }
      if (Object.keys(fields).length === 0) {
        return {
          row,
          label,
          action: "skip",
          reason: `Kontakt „${match.title ?? name}“ existiert bereits, nichts zu ergänzen`,
          warnings,
        };
      }
      completed.add(match.slug);
      return {
        row,
        label,
        action: "complete",
        reason: `Ergänzt ${Object.keys(fields).length} leere Angabe(n) bei „${match.title ?? name}“`,
        warnings,
        write: { op: "complete_contact", slug: match.slug, fields },
      };
    }
    const slug = `contact/${translit(name) || "kontakt"}-${shortId(opts.projectId)}-${row}`;
    return {
      row,
      label,
      action: "create",
      warnings,
      write: {
        op: "create_page",
        slug,
        title: name,
        type: "legal_contact",
        content: values.notes,
        frontmatter: {
          type: "legal_contact",
          name,
          role: role.role,
          company: values.company || undefined,
          email: values.email || undefined,
          phone: values.phone || undefined,
          address: values.address || undefined,
          notes: values.notes || undefined,
          source: IMPORT_SOURCE,
          import_project_id: opts.projectId,
          imported_at: opts.now,
        },
      },
    };
  });
}

function deadlineKey(caseSlug: string, dueDate: string, title: string): string {
  return `${caseSlug}|${dueDate}|${normaliseName(title)}`;
}

function planDeadlines(
  table: string[][],
  mapping: ColumnMapping,
  existing: ExistingData,
  opts: PlanOptions
): PlanRow[] {
  const resolve = caseResolver(existing.cases);
  const known = new Set<string>();
  for (const d of existing.deadlines.filter(alive)) {
    const caseSlug = str(d.frontmatter, "case_slug");
    const due = str(d.frontmatter, "due_date").slice(0, 10);
    if (caseSlug && due) known.add(deadlineKey(caseSlug, due, d.title ?? ""));
  }
  for (const c of existing.cases) {
    const list = Array.isArray(c.frontmatter?.deadlines) ? c.frontmatter.deadlines : [];
    for (const d of list as Array<Record<string, unknown>>) {
      const due = String(d.due_date ?? "").slice(0, 10);
      if (due) known.add(deadlineKey(c.slug, due, String(d.title ?? "")));
    }
  }
  const inFile = new Map<string, number>();
  return table.map((cells, i) => {
    const row = i + 2;
    const val = reader(cells, mapping);
    const title = val("title");
    const ref = val("case_ref");
    const label = [ref, title].filter(Boolean).join(" · ") || `Zeile ${row}`;
    const warnings: string[] = [];
    if (!ref) return { row, label, action: "error", reason: "Akte fehlt", warnings };
    if (!title) return { row, label, action: "error", reason: "Bezeichnung fehlt", warnings };
    const dueRaw = val("due_date");
    const due = parseDate(dueRaw);
    if (!due) {
      return {
        row,
        label,
        action: "error",
        reason: dueRaw ? `Datum „${dueRaw}“ nicht erkannt` : "Fälligkeitsdatum fehlt",
        warnings,
      };
    }
    const target = resolve(ref);
    if ("error" in target) return { row, label, action: "error", reason: target.error, warnings };
    const done = parseYesNo(val("done"));
    if (done === true || /^erledigt|abgeschlossen$/i.test(val("done"))) {
      return {
        row,
        label,
        action: "skip",
        reason: "In der Quelle als erledigt markiert",
        warnings,
      };
    }
    if (due < opts.today && !opts.includePastDeadlines) {
      return { row, label, action: "skip", reason: "Liegt vor dem Importtag", warnings };
    }
    const key = deadlineKey(target.slug, due, title);
    if (known.has(key)) {
      return {
        row,
        label,
        action: "skip",
        reason: "Gleiche Frist ist in der Akte schon eingetragen",
        warnings,
      };
    }
    if (inFile.has(key)) {
      return {
        row,
        label,
        action: "skip",
        reason: `Doppelt in der Datei (Zeile ${inFile.get(key)})`,
        warnings,
      };
    }
    inFile.set(key, row);
    const notfristRaw = val("is_notfrist");
    let isNotfrist = parseYesNo(notfristRaw);
    if (isNotfrist === null) {
      warnings.push(`Notfrist „${notfristRaw}“ nicht erkannt, als Notfrist übernommen`);
      isNotfrist = true;
    }
    if (due < opts.today) warnings.push("Frist liegt in der Vergangenheit");
    const description = val("description");
    const responsible = val("responsible");
    return {
      row,
      label,
      action: "create",
      warnings,
      write: {
        op: "create_page",
        slug: `legal/deadlines/import-${shortId(opts.projectId)}-${row}`,
        title,
        type: "legal_deadline",
        content: description,
        frontmatter: {
          type: "legal_deadline",
          event_type: "deadline",
          case_slug: target.slug,
          due_date: due,
          // Deadline lists show the description as the deadline's text.
          description: description ? `${title}: ${description}` : title,
          responsible: responsible || undefined,
          status: "pending",
          review_status: "unreviewed",
          imported_unverified: true,
          calculation_note: "Aus dem Altsystem übernommen. Fristberechnung nicht geprüft.",
          is_notfrist: isNotfrist,
          second_check_required: isNotfrist,
          source: IMPORT_SOURCE,
          import_project_id: opts.projectId,
          imported_at: opts.now,
          created_at: opts.now,
        },
      },
    };
  });
}

function timeKey(date: string, minutes: number, description: string): string {
  return `${date}|${minutes}|${normaliseName(description)}`;
}

function planTimeEntries(
  table: string[][],
  mapping: ColumnMapping,
  existing: ExistingData,
  opts: PlanOptions
): PlanRow[] {
  const resolve = caseResolver(existing.cases);
  const known = new Map<string, Set<string>>();
  const keysFor = (page: ExistingPage) => {
    let keys = known.get(page.slug);
    if (!keys) {
      keys = new Set();
      const list = Array.isArray(page.frontmatter?.time_entries)
        ? page.frontmatter.time_entries
        : [];
      for (const e of list as Array<Record<string, unknown>>) {
        keys.add(
          timeKey(
            String(e.date ?? "").slice(0, 10),
            Number(e.minutes ?? 0),
            String(e.description ?? "")
          )
        );
      }
      known.set(page.slug, keys);
    }
    return keys;
  };
  const project = shortId(opts.projectId);
  return table.map((cells, i) => {
    const row = i + 2;
    const val = reader(cells, mapping);
    const ref = val("case_ref");
    const description = val("description");
    const label = [ref, description].filter(Boolean).join(" · ") || `Zeile ${row}`;
    const warnings: string[] = [];
    if (!ref) return { row, label, action: "error", reason: "Akte fehlt", warnings };
    if (!description) return { row, label, action: "error", reason: "Tätigkeit fehlt", warnings };
    const dateRaw = val("date");
    const date = parseDate(dateRaw);
    if (!date) {
      return {
        row,
        label,
        action: "error",
        reason: dateRaw ? `Datum „${dateRaw}“ nicht erkannt` : "Datum fehlt",
        warnings,
      };
    }
    const minutesRaw = val("minutes");
    const hoursRaw = val("hours");
    const minutes = minutesRaw
      ? parseMinutes(minutesRaw, "minutes")
      : hoursRaw
        ? parseMinutes(hoursRaw, "hours")
        : null;
    if (!minutes) {
      const raw = minutesRaw || hoursRaw;
      return {
        row,
        label,
        action: "error",
        reason: raw ? `Dauer „${raw}“ nicht erkannt` : "Dauer fehlt",
        warnings,
      };
    }
    const target = resolve(ref);
    if ("error" in target) return { row, label, action: "error", reason: target.error, warnings };
    const keys = keysFor(target.page);
    const key = timeKey(date, minutes, description);
    if (keys.has(key)) {
      return {
        row,
        label,
        action: "skip",
        reason: "Gleicher Eintrag ist in der Akte schon erfasst",
        warnings,
      };
    }
    keys.add(key);
    const rateRaw = val("rate");
    const rate = rateRaw ? parseAmount(rateRaw) : null;
    if (rateRaw && rate === null)
      warnings.push(`Stundensatz „${rateRaw}“ nicht erkannt, weggelassen`);
    const billableRaw = val("billable");
    let billable = billableRaw ? parseYesNo(billableRaw) : true;
    if (billable === null) {
      warnings.push(`„${billableRaw}“ bei verrechenbar nicht erkannt, als verrechenbar übernommen`);
      billable = true;
    }
    const billedRaw = val("billed");
    let billed = billedRaw ? parseYesNo(billedRaw) : Boolean(opts.defaultBilled);
    if (billed === null) {
      warnings.push(`„${billedRaw}“ bei abgerechnet nicht erkannt, als abgerechnet übernommen`);
      billed = true;
    }
    const lawyer = val("lawyer");
    return {
      row,
      label,
      action: "create",
      warnings,
      write: {
        op: "add_time_entry",
        caseSlug: target.slug,
        entry: {
          id: `imp-${project}-${row}`,
          description,
          minutes,
          date,
          ...(rate !== null && rate > 0 ? { rate } : {}),
          billable,
          billed,
          ...(lawyer ? { lawyer } : {}),
          source: IMPORT_SOURCE,
          import_project_id: opts.projectId,
        },
      },
    };
  });
}

export function planImport(
  kind: ImportKind,
  rows: string[][],
  mapping: ColumnMapping,
  existing: ExistingData,
  opts: PlanOptions
): ImportPlan {
  if (!IMPORT_KINDS[kind]) throw new Error(`Unbekannte Importart ${kind}`);
  const planned =
    kind === "cases"
      ? planCases(rows, mapping, existing, opts)
      : kind === "contacts"
        ? planContacts(rows, mapping, existing, opts)
        : kind === "deadlines"
          ? planDeadlines(rows, mapping, existing, opts)
          : planTimeEntries(rows, mapping, existing, opts);
  return { kind, projectId: opts.projectId, rows: planned, counts: count(planned) };
}
