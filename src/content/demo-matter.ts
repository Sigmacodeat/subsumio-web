/**
 * Public live-demo matter — single source of truth for the fictional
 * "Berger ./. Muster Werk GmbH" case. Consumed by:
 *   - scripts/seed-demo-template.ts  → writes the engine template sources
 *     (demo-template for AT, demo-template-de for DE) that every public demo
 *     session clones via POST /api/sources/clone.
 *   - src/lib/provision.ts           → seeds the same matter into a fresh
 *     tenant brain after signup so demo → trial continuity holds.
 *
 * EVERYTHING here is fictional. Names, companies, dates, amounts and file
 * numbers are invented for demo purposes; every page carries demo: true
 * and a visible disclaimer line so no visitor can mistake it for a real
 * mandate. No real person or firm data may ever be added here.
 *
 * Two jurisdictions share one story and the same slugs (they live in
 * separate template sources): AT (ASG Wien, § 105 ArbVG, ERV) and DE
 * (Arbeitsgericht München, KSchG, beA). Legal hooks differ where the law
 * differs — deadline lengths, statute references, court, filing channel.
 *
 * Pages carry frontmatter.demo_stage:
 *   "live"  — cloned when the visitor's session starts (the running firm).
 *   "inbox" — cloned on the guided "document intake" step, so the visitor
 *             sees extraction results (entities + deadline) appear for real.
 */

export type DemoJurisdiction = "at" | "de";

export interface DemoMatterPage {
  slug: string;
  title: string;
  type: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export const DEMO_CASE_SLUG = "legal/cases/demo-2026-001-berger-vs-muster";
export const DEMO_SECONDARY_CASE_SLUG = "legal/cases/demo-2026-007-novak-vs-hafen";
export const DEMO_INBOX_DOC_SLUG = "legal/documents/demo-klagebeantwortung-muster";
export const DEMO_INBOX_DEADLINE_SLUG = "legal/deadlines/demo-frist-replik-berger";
export const DEMO_TEMPLATE_SOURCE = "demo-template";
export const DEMO_TEMPLATE_SOURCE_DE = "demo-template-de";

export function demoTemplateSource(jur: DemoJurisdiction = "at"): string {
  return jur === "de" ? DEMO_TEMPLATE_SOURCE_DE : DEMO_TEMPLATE_SOURCE;
}

/** Free question budget before the e-mail gate — shared with the banner
 * (client) so it can't drift from the server-side cap in demo/session.ts. */
export const DEMO_QUESTIONS_FREE = 8;

/**
 * Jurisdiction-specific vocabulary and legal hooks. Everything the story
 * needs to be *correct* in the respective legal system lives here.
 */
const JUR = {
  at: {
    code: "AT",
    city: "Wien",
    plz: "1010",
    court: "Arbeits- und Sozialgericht Wien",
    courtShort: "ASG Wien",
    civilCourt: "Bezirksgericht Innere Stadt Wien",
    channel: "ERV",
    channelLong: "eingelangt via ERV (Elektronischer Rechtsverkehr)",
    contract: "Dienstvertrag",
    contractUpper: "DIENSTVERTRAG",
    employmentRel: "Dienstverhältnis",
    answerBrief: "Klagebeantwortung",
    answerBriefFile: "Klagebeantwortung_MusterWerk_ERV.pdf",
    salary:
      "Bruttomonatsgehalt EUR 4.850,– (14 × jährlich), Kollektivvertrag der Informationstechnologie, Verwendungsgruppe III.",
    allInLaw: "Pauschalierungsklausel — Spezifizierungsgebot (§ 2g AVRAG, OGH 9 ObA 44/16z)",
    allInIssue:
      "Prüfung der pauschalierten All-in-Klausel im Dienstvertrag auf Angemessenheit (Spezifizierungsgebot).",
    challengeLaw: "§ 105 ArbVG",
    challengeGoal:
      "Anfechtung der Kündigung wegen Sozialwidrigkeit (§ 105 Abs 3 Z 2 ArbVG) beim Arbeits- und Sozialgericht Wien.",
    challengeDeadlineTitle: "Anfechtungsfrist — Berger ./. Muster Werk",
    challengeDeadlineBody:
      "Anfechtung der Kündigung beim Arbeits- und Sozialgericht Wien — § 105 Abs 4 ArbVG: Klage binnen zwei Wochen ab Zugang der Kündigung (Frist aus dem Betriebsrats-Verfahren bereits berücksichtigt).",
    challengeDeadlineDesc:
      "Kündigungsanfechtung Berger ./. Muster Werk GmbH beim ASG Wien einbringen (§ 105 ArbVG).",
    challengeDays: 14,
    vacationClaim: "Urlaubsersatzleistung für 12,5 offene Urlaubstage (§ 10 UrlG)",
    referenceLaw: "§ 39 AngG",
    noticeClause:
      "§ 11 Kündigung: gegenseitige Kündigungsfrist 3 Monate zum Letzten eines Kalendervierteljahres; Kündigungstermine 31.03., 30.06., 30.09., 31.12.",
    noticeTermDate: "31.12.2026",
    monthJan: "Jänner",
    lawyerTitle: "Mag.",
    replyLaw:
      "Replik binnen vier Wochen ab Zustellung (§ 257 Abs 3 ZPO analog, richterliche Frist)",
    replyDays: 28,
    tenancyLaw: "MRG / § 1096 ABGB",
    tenancyBody:
      "Familie Novak begehrt von der Hafen Immo GmbH die Behebung eines massiven Fensterschadens (Zugluft, Schimmelgefahr) in der Mietwohnung sowie Mietzinsminderung nach § 1096 ABGB. Mietrecht, Vollanwendungsbereich MRG, Wien.",
    suggested: [
      "Was fehlt vor der Klagebeantwortung in der Akte Berger?",
      "Welche Fristen laufen in dieser Akte und welche ist am kritischsten?",
      "Gibt es Widersprüche zwischen der Kündigung und dem Zwischenzeugnis?",
    ],
  },
  de: {
    code: "DE",
    city: "München",
    plz: "80331",
    court: "Arbeitsgericht München",
    courtShort: "ArbG München",
    civilCourt: "Amtsgericht München",
    channel: "beA",
    channelLong: "eingegangen via beA (besonderes elektronisches Anwaltspostfach)",
    contract: "Arbeitsvertrag",
    contractUpper: "ARBEITSVERTRAG",
    employmentRel: "Arbeitsverhältnis",
    answerBrief: "Klageerwiderung",
    answerBriefFile: "Klageerwiderung_MusterWerk_beA.pdf",
    salary: "Bruttomonatsgehalt EUR 5.650,– (12 × jährlich), außertariflich.",
    allInLaw:
      "Pauschale Überstundenabgeltung — Transparenzgebot (§ 307 Abs 1 S 2 BGB, BAG 5 AZR 765/10)",
    allInIssue:
      "Prüfung der pauschalen Überstundenklausel im Arbeitsvertrag auf Wirksamkeit (Transparenzgebot § 307 BGB — BAG: Umfang muss erkennbar sein).",
    challengeLaw: "§ 1 KSchG",
    challengeGoal:
      "Kündigungsschutzklage wegen sozialer Ungerechtfertigkeit (§ 1 Abs 2 KSchG) beim Arbeitsgericht München.",
    challengeDeadlineTitle: "Klagefrist KSchG — Berger ./. Muster Werk",
    challengeDeadlineBody:
      "Kündigungsschutzklage beim Arbeitsgericht München — § 4 S 1 KSchG: Klage binnen drei Wochen nach Zugang der schriftlichen Kündigung; Versäumung heilt die Kündigung (§ 7 KSchG).",
    challengeDeadlineDesc:
      "Kündigungsschutzklage Berger ./. Muster Werk GmbH beim ArbG München einreichen (§ 4 KSchG, 3 Wochen).",
    challengeDays: 21,
    vacationClaim: "Urlaubsabgeltung für 12,5 offene Urlaubstage (§ 7 Abs 4 BUrlG)",
    referenceLaw: "§ 109 GewO",
    noticeClause:
      "§ 11 Kündigung: Kündigungsfrist nach § 622 BGB, mindestens jedoch 3 Monate zum Monatsende.",
    noticeTermDate: "31.12.2026",
    monthJan: "Januar",
    lawyerTitle: "RAin",
    replyLaw: "Replik binnen vier Wochen (richterliche Frist nach § 61a Abs 4 ArbGG)",
    replyDays: 28,
    tenancyLaw: "§ 536 BGB",
    tenancyBody:
      "Familie Novak begehrt von der Hafen Immo GmbH die Beseitigung eines massiven Fensterschadens (Zugluft, Schimmelgefahr) in der Mietwohnung sowie Mietminderung nach § 536 BGB. Wohnraummietrecht, München.",
    suggested: [
      "Was fehlt vor der Klageerwiderung in der Akte Berger?",
      "Welche Fristen laufen in dieser Akte und welche ist am kritischsten?",
      "Gibt es Widersprüche zwischen der Kündigung und dem Zwischenzeugnis?",
    ],
  },
} as const;

/** Display metadata for the staged incoming brief (chapter 2 of the tour). */
export function demoInboxFile(jur: DemoJurisdiction = "at"): { name: string; size: string } {
  return { name: JUR[jur].answerBriefFile, size: "214 KB · 14 Seiten" };
}
export const DEMO_INBOX_FILE = demoInboxFile("at");

/** Suggested questions surfaced above the assistant input in demo mode. */
export function demoSuggestedQuestions(jur: DemoJurisdiction = "at"): readonly string[] {
  return JUR[jur].suggested;
}
export const DEMO_SUGGESTED_QUESTIONS = JUR.at.suggested;

const lines = (...l: string[]) => l.join("\n");

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateDE(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/**
 * All demo pages. `now` anchors the relative dates (deadline in ~2–3 weeks,
 * reply deadline ~4 weeks after the incoming brief) so the matter always
 * looks current — the template seed passes its own seed time.
 */
export function demoMatterPages(
  now: Date = new Date(),
  jur: DemoJurisdiction = "at"
): DemoMatterPage[] {
  const J = JUR[jur];
  const kuendigung = new Date(Date.UTC(now.getUTCFullYear(), 8, 1)); // 01.09. des laufenden Jahres
  const challengeDue = new Date(now.getTime() + J.challengeDays * 86_400_000);
  const replikDue = new Date(now.getTime() + J.replyDays * 86_400_000);
  const novakDue = new Date(now.getTime() + 45 * 86_400_000);
  const createdAt = now.toISOString();
  const firm = `Kanzlei ${J.lawyerTitle} Johannes Falk`;
  const responsible = `${J.lawyerTitle} Johannes Falk`;
  const shared = { demo: true, jurisdiction: J.code };

  const pages: DemoMatterPage[] = [
    // ── Hauptakte ──────────────────────────────────────────────────
    {
      slug: DEMO_CASE_SLUG,
      title: "Demo-Akte: Berger ./. Muster Werk GmbH",
      type: "legal_case",
      content: lines(
        "**DEMO-AKTE — fiktives Mandat zum Testen, keine echten Mandantendaten.**",
        "",
        "Mag. Anna Berger (Key Account Managerin, beschäftigt seit 01.03.2019) wurde",
        `von der Muster Werk GmbH, ${J.city}, am 01.09.2026 ordentlich gekündigt.`,
        "Die Kündigung wird mit „wiederholter Unzuverlässigkeit und Fehlzeiten“",
        "begründet.",
        "",
        "## Mandatsziel",
        "",
        `1. ${J.challengeGoal}`,
        "2. Geltendmachung offener Ansprüche: rund 87 nicht abgegoltene",
        `   Überstunden sowie ${J.vacationClaim}.`,
        `3. ${J.allInIssue}`,
        "",
        "## Wichtige Dokumente",
        "",
        `- ${J.contract} vom 01.03.2019 (Überstundenklausel § 9)`,
        "- Kündigungsschreiben vom 01.09.2026",
        "- Zwischenzeugnis vom 15.07.2026 — widerspricht der Kündigungsbegründung",
        `- Überstundenaufzeichnungen ${J.monthJan}–August 2026`,
        "- E-Mail-Verkehr zur Überstundenkontroverse",
        "",
        "## Strategie (Entwurf)",
        "",
        "Das Zwischenzeugnis vom 15.07.2026 („stets zu unserer vollsten",
        "Zufriedenheit“) untergräbt die behauptete Unzuverlässigkeit.",
        "Erfolgsaussichten sind gut; parallel Vergleichsangebot auf Auszahlung",
        "der Überstunden plus Abfindungsaufschlag vorbereiten."
      ),
      frontmatter: {
        type: "legal_case",
        case_number: "DEMO-2026-001",
        legal_area: "Arbeitsrecht",
        status: "open",
        priority: "high",
        client_name: "Mag. Anna Berger",
        opponent_name: "Muster Werk GmbH",
        court_name: J.court,
        responsible,
        tags: ["demo", "arbeitsrecht", "kuendigung"],
        demo_stage: "live",
        portal_enabled: false,
        version: 0,
        ...shared,
      },
    },
    {
      slug: "legal/documents/demo-dienstvertrag-berger",
      title: `${J.contract} Mag. Anna Berger (Demo)`,
      type: "document",
      content: lines(
        "**DEMO-DOKUMENT — fiktiver Vertragstext zum Testen.**",
        "",
        `${J.contractUpper} — Muster Werk GmbH / Mag. Anna Berger`,
        "Geschlossen am 15.02.2019, Arbeitsbeginn 01.03.2019.",
        "",
        "§ 3 Funktion: Key Account Managerin, direkte Berichtslinie an die",
        "Geschäftsführung.",
        "",
        `§ 5 Entgelt: ${J.salary}`,
        "",
        "§ 9 Überstunden: „Mit dem vereinbarten Grundgehalt sind sämtliche",
        "über die Normalarbeitszeit hinausgehenden Arbeitsleistungen",
        "abgegolten.“ — Ohne Angabe von Anzahl oder Umfang der",
        "pauschal abgegoltenen Stunden.",
        "",
        J.noticeClause,
        "",
        `§ 14 Gerichtsstand: ${J.court}.`
      ),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        doc_kind: "dienstvertrag",
        extraction_status: "done",
        tags: ["demo", "vertrag"],
        demo_stage: "live",
        ...shared,
      },
    },
    {
      slug: "legal/documents/demo-kuendigungsschreiben",
      title: "Kündigungsschreiben Muster Werk GmbH (Demo)",
      type: "document",
      content: lines(
        "**DEMO-DOKUMENT — fiktives Schreiben zum Testen.**",
        "",
        `Muster Werk GmbH, Musterstraße 12, ${J.plz} ${J.city}`,
        `${J.city}, am 01.09.2026`,
        "",
        "Sehr geehrte Frau Mag. Berger,",
        "",
        `hiermit kündigen wir das mit Ihnen bestehende ${J.employmentRel}`,
        `ordentlich und fristgerecht zum ${J.noticeTermDate}.`,
        "",
        "Diese Kündigung erfolgt aus verhaltensbedingten Gründen: trotz",
        "mehrerer mündlicher Ermahnungen kam es zuletzt wiederholt zu",
        "Unzuverlässigkeiten und unentschuldigten Fehlzeiten, die den",
        "betrieblichen Ablauf erheblich belastet haben.",
        "",
        "Mit freundlichen Grüßen",
        "Thomas Muster, Geschäftsführer",
        "Muster Werk GmbH"
      ),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        doc_kind: "kuendigung",
        sender: "Muster Werk GmbH",
        document_date: "2026-09-01",
        extraction_status: "done",
        tags: ["demo", "kuendigung"],
        demo_stage: "live",
        ...shared,
      },
    },
    {
      slug: "legal/documents/demo-zwischenzeugnis-berger",
      title: "Zwischenzeugnis Mag. Anna Berger (Demo)",
      type: "document",
      content: lines(
        "**DEMO-DOKUMENT — fiktives Zeugnis zum Testen.**",
        "",
        `ZWISCHENZEUGNIS (${J.referenceLaw}) — Muster Werk GmbH, ${J.city}, 15.07.2026`,
        "",
        "Frau Mag. Anna Berger ist seit 01.03.2019 als Key Account Managerin",
        "in unserem Unternehmen tätig.",
        "",
        "Sie überzeugt durch fachliche Kompetenz, außerordentliche",
        "Zuverlässigkeit und ein stets vorbildliches Engagement. Ihre",
        "Arbeitsleistung fand zu jeder Zeit unsere vollste Zufriedenheit.",
        "Termine und Abgaben hält sie stets zuverlässig ein.",
        "",
        "Wir danken Frau Berger für ihre wertvolle Mitarbeit.",
        "",
        "Thomas Muster, Geschäftsführer"
      ),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        doc_kind: "zwischenzeugnis",
        sender: "Muster Werk GmbH",
        document_date: "2026-07-15",
        extraction_status: "done",
        tags: ["demo", "zeugnis"],
        demo_stage: "live",
        ...shared,
      },
    },
    {
      slug: "legal/documents/demo-zeitaufzeichnung-berger",
      title: `Überstundenaufzeichnung Berger ${J.monthJan.slice(0, 3)}–Aug 2026 (Demo)`,
      type: "document",
      content: lines(
        "**DEMO-DOKUMENT — fiktive Aufzeichnung zum Testen.**",
        "",
        "ÜBERSTUNDENAUFZEICHNUNG — Mag. Anna Berger",
        `Zeitraum: ${J.monthJan} bis August 2026, Quelle: Zeiterfassungssystem`,
        "",
        "Auszug (Mehrleistungen über 40h/Woche, nicht ausgeglichen):",
        "",
        `- ${J.monthJan} 2026: 11 Überstunden (Projekt „Nordlicht“)`,
        "- Februar 2026: 8 Überstunden",
        "- März 2026: 14 Überstunden (Quartalsabschluss)",
        "- April 2026: 9 Überstunden",
        "- Mai 2026: 12 Überstunden",
        "- Juni 2026: 10 Überstunden",
        "- Juli 2026: 13 Überstunden (Messevorbereitung)",
        "- August 2026: 10 Überstunden",
        "",
        "Summe: 87 Überstunden. Kein Zeitausgleich, keine Zulagen ausbezahlt.",
        "Anmerkung: Teile davon sind qualifizierte Überstunden (Zuschlag)."
      ),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        doc_kind: "zeitaufzeichnung",
        extraction_status: "done",
        tags: ["demo", "ueberstunden"],
        demo_stage: "live",
        ...shared,
      },
    },
    {
      slug: "legal/documents/demo-vollmacht-berger",
      title: "Vollmacht Berger → Kanzlei Falk (Demo)",
      type: "document",
      content: lines(
        "**DEMO-DOKUMENT — fiktive Vollmacht zum Testen.**",
        "",
        "VOLLMACHT",
        "",
        `Mag. Anna Berger, Seilerstraße 4, ${J.plz} ${J.city}, erteilt der ${firm},`,
        `Rotenturmstraße 20, ${J.plz} ${J.city}, Vollmacht zur Vertretung in`,
        `sämtlichen Angelegenheiten des ${J.employmentRel}ses mit der`,
        "Muster Werk GmbH, insbesondere zur Bekämpfung der Kündigung vom",
        `01.09.2026 sowie zur Geltendmachung aller Ansprüche aus dem ${J.employmentRel}.`,
        "",
        `${J.city}, am 05.09.2026 — Mag. Anna Berger`
      ),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        doc_kind: "vollmacht",
        document_date: "2026-09-05",
        extraction_status: "done",
        tags: ["demo", "vollmacht"],
        demo_stage: "live",
        ...shared,
      },
    },
    {
      slug: "legal/communications/demo-email-ueberstunden-berger",
      title: "E-Mail-Verkehr Überstunden Berger ↔ GF (Demo)",
      type: "document",
      content: lines(
        "**DEMO-DOKUMENT — fiktiver E-Mail-Verlauf zum Testen.**",
        "",
        "Von: anna.berger@musterwerk.example — 12.08.2026, 09:14",
        "An: thomas.muster@musterwerk.example",
        "",
        "„Sehr geehrter Herr Muster, anbei meine Überstundenaufstellung für",
        `${J.monthJan} bis Juli. Ich ersuche um Abgeltung der 77 geleisteten`,
        "Überstunden bzw. um Zeitausgleich.“",
        "",
        "Von: thomas.muster@musterwerk.example — 12.08.2026, 15:02",
        "",
        "„Frau Berger, Ihr Gehalt ist pauschal vereinbart — Überstunden sind",
        "mit dem Grundgehalt abgegolten. Eine gesonderte Abgeltung kommt",
        "nicht in Betracht.“",
        "",
        "Von: anna.berger@musterwerk.example — 13.08.2026, 08:47",
        "",
        `„Die Klausel im ${J.contract} nennt weder Anzahl noch Umfang der`,
        "pauschal abgegoltenen Stunden. Ich halte sie für unwirksam und",
        "bleibe bei meinem Verlangen.“",
        "",
        "Anmerkung Kanzlei: Schriftliches Anerkenntnis der Überstundenmenge",
        "durch die Gegenseite liegt nicht vor — die Zahlen stammen aus dem",
        "eigenen Zeiterfassungssystem der Mandantin.",
        `Rechtlicher Anker: ${J.allInLaw}.`
      ),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        doc_kind: "email_thread",
        document_date: "2026-08-13",
        extraction_status: "done",
        tags: ["demo", "korrespondenz", "ueberstunden"],
        demo_stage: "live",
        ...shared,
      },
    },
    {
      slug: "legal/intake/demo-eingang-berger",
      title: "Aktennotiz Erstberatung Berger (Demo)",
      type: "intake_request",
      content: lines(
        "**DEMO-EINTRAG — fiktive Aktennotiz zum Testen.**",
        "",
        "Erstberatung Mag. Anna Berger, 04.09.2026, 45 Minuten:",
        "",
        "- Kündigung vom 01.09.2026 zugestellt; Mandantin bestreitet",
        "  Unzuverlässigkeit, verweist auf Zwischenzeugnis.",
        `- Überstunden: eigene Aufzeichnung vorhanden, Klausel § 9 ${J.contract}`,
        `  prüfen (${J.allInLaw}).`,
        "- Urlaub: 12,5 offene Tage lt. Urlaubskonto.",
        `- Mandantin wünscht Klage (${J.challengeLaw}) + außergerichtlichen`,
        "  Vergleich als Fallback.",
        "",
        "Konfliktprüfung: keine Kollision (Gegenseite unbekannt)."
      ),
      frontmatter: {
        type: "intake_request",
        source: "meeting",
        status: "processed",
        client_name: "Mag. Anna Berger",
        legal_area: "Arbeitsrecht",
        summary:
          "Erstberatung: Kündigung soll bekämpft werden, Überstunden und Urlaubsansprüche prüfen (Demo).",
        conflict_check_status: "clear",
        case_slug: DEMO_CASE_SLUG,
        demo_stage: "live",
        created_at: createdAt,
        updated_at: createdAt,
        ...shared,
      },
    },
    {
      slug: "legal/deadlines/demo-anfechtungsfrist-berger",
      title: J.challengeDeadlineTitle,
      type: "legal_deadline",
      content: lines(
        "**DEMO-FRIST — fiktiv.**",
        "",
        `Kündigung vom ${fmtDateDE(kuendigung)}. ${J.challengeDeadlineBody}`,
        "Vorbereitet und von der Kanzlei geprüft."
      ),
      frontmatter: {
        type: "legal_deadline",
        event_type: "deadline",
        due_date: fmtDate(challengeDue),
        description: J.challengeDeadlineDesc,
        law: J.challengeLaw,
        status: "pending",
        review_status: "reviewed",
        source: "kanzlei",
        case_slug: DEMO_CASE_SLUG,
        demo_stage: "live",
        created_at: createdAt,
        ...shared,
      },
    },
    {
      slug: "legal/contacts/demo-anna-berger",
      title: "Mag. Anna Berger — Mandantin (Demo)",
      type: "contact",
      content: lines(
        "**DEMO-KONTAKT — fiktiv.**",
        "",
        "Mag. Anna Berger, geb. 1988, Key Account Managerin.",
        "Mandantin in Berger ./. Muster Werk GmbH.",
        "Bevorzugter Kontakt: E-Mail. Erstberatung am 04.09.2026."
      ),
      frontmatter: {
        type: "contact",
        contact_kind: "client",
        email: "anna.berger@beispiel.invalid",
        case_slug: DEMO_CASE_SLUG,
        demo_stage: "live",
        ...shared,
      },
    },
    {
      slug: "legal/contacts/demo-muster-werk",
      title: "Muster Werk GmbH — Gegenseite (Demo)",
      type: "contact",
      content: lines(
        "**DEMO-KONTAKT — fiktives Unternehmen.**",
        "",
        `Muster Werk GmbH, Musterstraße 12, ${J.plz} ${J.city}.`,
        "Geschäftsführer: Thomas Muster.",
        "Gegenseite in Berger ./. Muster Werk GmbH (Kündigungsstreit)."
      ),
      frontmatter: {
        type: "contact",
        contact_kind: "opponent",
        case_slug: DEMO_CASE_SLUG,
        demo_stage: "live",
        ...shared,
      },
    },
    // ── Zweite Akte für realistische Listen/Fristenbuch ─────────────
    {
      slug: DEMO_SECONDARY_CASE_SLUG,
      title: "Demo-Akte: Familie Novak ./. Hafen Immo GmbH",
      type: "legal_case",
      content: lines(
        "**DEMO-AKTE — fiktives Mandat zum Testen.**",
        "",
        J.tenancyBody,
        "",
        "Status: außergerichtliche Mängelaufforderung läuft."
      ),
      frontmatter: {
        type: "legal_case",
        case_number: "DEMO-2026-007",
        legal_area: "Mietrecht",
        status: "open",
        priority: "normal",
        client_name: "Familie Novak",
        opponent_name: "Hafen Immo GmbH",
        court_name: J.civilCourt,
        responsible,
        tags: ["demo", "mietrecht"],
        demo_stage: "live",
        portal_enabled: false,
        version: 0,
        ...shared,
      },
    },
    {
      slug: "legal/deadlines/demo-frist-novak",
      title: "Mängelbeseitigungsfrist — Novak ./. Hafen Immo",
      type: "legal_deadline",
      content: lines(
        "**DEMO-FRIST — fiktiv.**",
        "",
        `Aufforderung zur Mängelbeseitigung mit angemessener Frist läuft (${J.tenancyLaw});`,
        "danach Ersatzvornahme/Klage vorbereiten."
      ),
      frontmatter: {
        type: "legal_deadline",
        event_type: "deadline",
        due_date: fmtDate(novakDue),
        description: "Mängelbeseitigungsfrist Hafen Immo GmbH endet; Ersatzvornahme prüfen (Demo).",
        law: J.tenancyLaw,
        status: "pending",
        review_status: "reviewed",
        source: "kanzlei",
        case_slug: DEMO_SECONDARY_CASE_SLUG,
        demo_stage: "live",
        created_at: createdAt,
        ...shared,
      },
    },
    // ── Inbox-Stage: wird erst beim geführten „Einlesen“ geklont ─────
    {
      slug: DEMO_INBOX_DOC_SLUG,
      title: `${J.answerBrief} Muster Werk GmbH (Demo)`,
      type: "document",
      content: lines(
        "**DEMO-DOKUMENT — fiktiver Schriftsatz zum Testen.**",
        "",
        `${J.answerBrief.toUpperCase()} — ${J.court}`,
        "Az. DEMO-2026-001 — eingereicht durch RA Dr. Konrad Weiss",
        `für die Muster Werk GmbH, ${J.channelLong}.`,
        "",
        "Die beklagte Partei beantragt die Abweisung der Klage",
        "und trägt zusammenfassend vor:",
        "",
        "1. Die Kündigung vom 01.09.2026 erfolgte aus verhaltensbedingten",
        "   Gründen; Frau Berger habe Termine wiederholt nicht eingehalten.",
        "2. Das Zwischenzeugnis vom 15.07.2026 sei „eine allgemein",
        "   übliche Höflichkeitsformulierung“ ohne Beweiswert.",
        `3. Die Überstunden seien durch die Klausel des § 9 ${J.contract}`,
        "   zur Gänze abgegolten; es lägen keine offenen Ansprüche vor.",
        "4. Hilfsweise wird die Aufrechnung mit einer angeblichen",
        "   Schadenersatzforderung von EUR 2.400,– erklärt.",
        "",
        `Das Gericht setzt eine Frist zur ${J.replyLaw}.`
      ),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        doc_kind: "schriftsatz",
        sender: "RA Dr. Konrad Weiss",
        received_via: J.channel.toLowerCase(),
        document_date: fmtDate(now),
        extraction_status: "done",
        tags: ["demo", "schriftsatz", J.answerBrief.toLowerCase()],
        demo_stage: "inbox",
        ...shared,
      },
    },
    {
      slug: DEMO_INBOX_DEADLINE_SLUG,
      title: "Replikfrist — Berger ./. Muster Werk (KI-Vorschlag)",
      type: "legal_deadline",
      content: lines(
        "**DEMO-FRIST — fiktiv, vom System aus dem Schriftsatz erkannt.**",
        "",
        `Erkannte Frist aus der ${J.answerBrief}: ${J.replyLaw}`,
        `beim ${J.courtShort}. KI-Vorschlag — vom Anwalt zu prüfen und zu bestätigen.`
      ),
      frontmatter: {
        type: "legal_deadline",
        event_type: "deadline",
        due_date: fmtDate(replikDue),
        description: `Replik auf die ${J.answerBrief} der Muster Werk GmbH beim ${J.courtShort} einreichen.`,
        status: "pending",
        review_status: "unreviewed",
        source: "extraction",
        source_quote: `Das Gericht setzt eine Frist zur ${J.replyLaw}.`,
        confidence: "high",
        case_slug: DEMO_CASE_SLUG,
        demo_stage: "inbox",
        created_at: createdAt,
        ...shared,
      },
    },
    {
      slug: "legal/contacts/demo-ra-weiss",
      title: "RA Dr. Konrad Weiss — Gegenseite-Vertreter (Demo)",
      type: "contact",
      content: lines(
        "**DEMO-KONTAKT — fiktive Person.**",
        "",
        "RA Dr. Konrad Weiss, Weiss & Partner Rechtsanwälte,",
        `Kohlmarkt 8, ${J.plz} ${J.city}. Rechtsvertreter der Muster Werk GmbH`,
        "in Berger ./. Muster Werk GmbH."
      ),
      frontmatter: {
        type: "contact",
        contact_kind: "opposing_counsel",
        case_slug: DEMO_CASE_SLUG,
        demo_stage: "inbox",
        ...shared,
      },
    },
  ];

  return pages;
}

/** Slugs cloned when the guided intake step runs (the "incoming brief"). */
export function demoInboxSlugs(jur: DemoJurisdiction = "at"): string[] {
  return demoMatterPages(new Date(), jur)
    .filter((p) => p.frontmatter.demo_stage === "inbox")
    .map((p) => p.slug);
}

/** Slugs cloned at session start. */
export function demoLiveSlugs(jur: DemoJurisdiction = "at"): string[] {
  return demoMatterPages(new Date(), jur)
    .filter((p) => p.frontmatter.demo_stage === "live")
    .map((p) => p.slug);
}

export const DEMO_INBOX_SLUGS: string[] = demoInboxSlugs("at");
export const DEMO_LIVE_SLUGS: string[] = demoLiveSlugs("at");
