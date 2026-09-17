// What can be imported, which columns each kind has, and how headers of common
// exports are recognised.

export type ImportKind = "cases" | "contacts" | "deadlines" | "time_entries";

export interface ImportFieldDef {
  key: string;
  label: string;
  required: boolean;
  guess: RegExp;
}

export interface ImportKindDef {
  label: string;
  /** Plural noun for counts, e.g. "Akten". */
  noun: string;
  description: string;
  fields: ImportFieldDef[];
  /** At least one field of each group must be mapped. */
  requireOneOf?: string[][];
}

const CASE_REF: ImportFieldDef = {
  key: "case_ref",
  label: "Akte (Aktenzahl oder Bezeichnung)",
  required: true,
  guess: /(aktenz|akten-?nr|aktennummer|^akte$|^az$|geschäftszahl|geschaeftszahl|^gz$|rubrum)/i,
};

export const IMPORT_KINDS: Record<ImportKind, ImportKindDef> = {
  cases: {
    label: "Akten",
    noun: "Akten",
    description:
      "Aktenliste mit Aktenzahl, Mandant, Gegner, Rechtsgebiet, Gericht, Sachbearbeiter und Status. Mandant, Gegner und Gericht werden als Kontakte angelegt und verknüpft.",
    fields: [
      {
        key: "title",
        label: "Bezeichnung / Rubrum",
        required: true,
        guess: /(rubrum|bezeichnung|kurzbez|betreff|^sache$|gegenstand)/i,
      },
      {
        key: "case_number",
        label: "Aktenzahl",
        required: false,
        guess:
          /(aktenz|akten-?nr|aktennummer|^az$|registernummer|geschäftszahl|geschaeftszahl|^gz$)/i,
      },
      {
        key: "client_name",
        label: "Mandant",
        required: false,
        guess: /(mandant|auftraggeber|klient)/i,
      },
      {
        key: "opponent_name",
        label: "Gegner",
        required: false,
        guess: /(gegner|gegenseite|gegenpartei)/i,
      },
      {
        key: "legal_area",
        label: "Rechtsgebiet",
        required: false,
        guess: /(rechtsgebiet|sachgebiet|referat|fachgebiet)/i,
      },
      { key: "court_name", label: "Gericht", required: false, guess: /(gericht|instanz)/i },
      {
        key: "own_lawyer_name",
        label: "Sachbearbeiter",
        required: false,
        guess: /(sachbearb|bearbeiter|dezernent|^sb$|zuständig|zustaendig)/i,
      },
      { key: "status", label: "Status", required: false, guess: /(status|zustand|^stand$)/i },
      {
        key: "opened_at",
        label: "Angelegt am",
        required: false,
        guess: /(angelegt|anlage|eröffnet|eroeffnet|beginn|datum)/i,
      },
    ],
  },
  contacts: {
    label: "Kontakte",
    noun: "Kontakte",
    description:
      "Adressbuch mit Name, Rolle, Firma, E-Mail, Telefon und Anschrift. Vorhandene Kontakte werden nur um leere Angaben ergänzt, nie überschrieben.",
    fields: [
      {
        key: "name",
        label: "Name",
        required: true,
        guess: /(^name$|nachname|vollständiger name|anzeigename|kontakt|bezeichnung)/i,
      },
      { key: "role", label: "Rolle", required: false, guess: /(rolle|typ|art|kategorie)/i },
      {
        key: "company",
        label: "Firma",
        required: false,
        guess: /(firma|unternehmen|organisation)/i,
      },
      { key: "email", label: "E-Mail", required: false, guess: /(e-?mail|mail)/i },
      {
        key: "phone",
        label: "Telefon",
        required: false,
        guess: /(telefon|tel\b|phone|mobil|handy)/i,
      },
      {
        key: "address",
        label: "Anschrift",
        required: false,
        guess: /(anschrift|adresse|straße|strasse)/i,
      },
      { key: "notes", label: "Notiz", required: false, guess: /(notiz|bemerkung|anmerkung)/i },
    ],
  },
  deadlines: {
    label: "Fristen",
    noun: "Fristen",
    description:
      "Offene Fristen und Termine je Akte. Sie kommen in der Fristenliste als „Ungeprüft“ an, bis jemand sie kontrolliert.",
    fields: [
      CASE_REF,
      {
        key: "title",
        label: "Bezeichnung der Frist",
        required: true,
        guess: /(frist|termin|bezeichnung|betreff|was)/i,
      },
      {
        key: "due_date",
        label: "Fällig am",
        required: true,
        guess: /(fällig|faellig|ablauf|datum|ende|bis)/i,
      },
      {
        key: "description",
        label: "Beschreibung",
        required: false,
        guess: /(beschreibung|notiz|bemerkung|anmerkung)/i,
      },
      { key: "is_notfrist", label: "Notfrist (ja/nein)", required: false, guess: /notfrist/i },
      {
        key: "done",
        label: "Erledigt (ja/nein)",
        required: false,
        guess: /(erledigt|abgehakt|status)/i,
      },
      {
        key: "responsible",
        label: "Zuständig",
        required: false,
        guess: /(zuständig|zustaendig|sachbearb|bearbeiter)/i,
      },
    ],
  },
  time_entries: {
    label: "Zeiten",
    noun: "Zeiteinträge",
    description:
      "Erfasste Leistungen je Akte mit Datum, Dauer und Tätigkeit. Bereits abgerechnete Zeiten bleiben abgerechnet, damit nichts doppelt verrechnet wird.",
    fields: [
      CASE_REF,
      { key: "date", label: "Datum", required: true, guess: /(datum|tag|leistungsdatum)/i },
      { key: "minutes", label: "Dauer in Minuten", required: false, guess: /(minuten|^min)/i },
      {
        key: "hours",
        label: "Dauer in Stunden",
        required: false,
        guess: /(stunden|^std|dauer|zeit)/i,
      },
      {
        key: "description",
        label: "Tätigkeit",
        required: true,
        guess: /(tätigkeit|taetigkeit|leistung|beschreibung|text)/i,
      },
      {
        key: "lawyer",
        label: "Bearbeiter",
        required: false,
        guess: /(bearbeiter|sachbearb|anwalt|mitarbeiter)/i,
      },
      { key: "rate", label: "Stundensatz", required: false, guess: /(satz|stundensatz|rate)/i },
      {
        key: "billable",
        label: "Verrechenbar (ja/nein)",
        required: false,
        guess: /(verrechenbar|abrechenbar|billable)/i,
      },
      {
        key: "billed",
        label: "Abgerechnet (ja/nein)",
        required: false,
        guess: /(abgerechnet|fakturiert|verrechnet|billed)/i,
      },
    ],
    requireOneOf: [["minutes", "hours"]],
  },
};

export type ColumnMapping = Record<string, number>;

/** Each header is proposed for at most one field; fields are tried in order. */
export function guessMapping(kind: ImportKind, headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_KINDS[kind].fields) {
    const index = headers.findIndex((h, i) => !used.has(i) && field.guess.test(h.trim()));
    mapping[field.key] = index;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

/** Labels of required fields (or field groups) that have no column. */
export function missingMappings(kind: ImportKind, mapping: ColumnMapping): string[] {
  const def = IMPORT_KINDS[kind];
  const mapped = (key: string) => (mapping[key] ?? -1) >= 0;
  const missing = def.fields.filter((f) => f.required && !mapped(f.key)).map((f) => f.label);
  for (const group of def.requireOneOf ?? []) {
    if (!group.some(mapped)) {
      missing.push(
        group.map((k) => def.fields.find((f) => f.key === k)?.label ?? k).join(" oder ")
      );
    }
  }
  return missing;
}
