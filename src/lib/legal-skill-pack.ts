/**
 * Legal Skill Pack — Versionierter Katalog der Kanzlei-Workflows als Legal-Skills.
 *
 * P0-SKILL-001: Kanzlei-Workflows als versionierte Legal-Skills modellieren
 * und `check-resolvable` (Reachability/MECE/DRY) als CI-Gate aktivieren.
 *
 * Architektur:
 *   - Jedes Legal-Skill hat eine Version, Kategorie, Trigger, Abhängigkeiten
 *   - Skills sind nach Kanzlei-Domänen gruppiert (Litigation, Contract, Tax, Compliance, Insurance, Real Estate, Corporate)
 *   - Jedes Skill mappt zu einem GBrain-Skill-Pfad (server/skills/<name>/SKILL.md)
 *   - Der Katalog ist die Single-Source-of-Truth für CI-Gate-Validierung
 *   - `check-resolvable` prüft Reachability (alle Skills im RESOLVER.md), MECE (kein Overlap), DRY (keine Cross-Cutting-Rule-Inlining)
 */

// ── Types ─────────────────────────────────────────────────────────────

export type SkillCategory =
  | "litigation"
  | "contract"
  | "tax"
  | "compliance"
  | "insurance"
  | "real_estate"
  | "corporate"
  | "general_legal"
  | "workflow";

export type SkillSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface LegalSkillDependency {
  skill_id: string;
  required: boolean;
  reason: string;
}

export interface LegalSkillEntry {
  /** Unique skill identifier (matches GBrain skill directory name) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version */
  version: string;
  /** Category */
  category: SkillCategory;
  /** Description */
  description: string;
  /** Path to SKILL.md in the GBrain skills directory */
  skill_path: string;
  /** Trigger phrases that route to this skill */
  triggers: string[];
  /** Other skills this skill depends on */
  dependencies: LegalSkillDependency[];
  /** Whether this skill writes brain pages */
  writes_pages: boolean;
  /** Whether this skill is mutating (has side effects) */
  mutating: boolean;
  /** Brain filing directories (if writes_pages) */
  writes_to?: string[];
  /** Tools used by this skill */
  tools?: string[];
  /** Priority (higher = more specific, checked first) */
  priority: number;
  /** Whether this skill is enabled in the legal skill pack */
  enabled: boolean;
  /** Severity level for routing */
  severity: SkillSeverity;
  /** GoBD relevance */
  gobd_relevant: boolean;
  /** GDPR relevance */
  gdpr_relevant: boolean;
}

export interface LegalSkillCategory {
  id: SkillCategory;
  label: string;
  description: string;
  icon: string;
}

// ── Category Definitions ──────────────────────────────────────────────

export const SKILL_CATEGORIES: LegalSkillCategory[] = [
  {
    id: "litigation",
    label: "Litigation",
    description: "Prozessführung, Beweisführung, Fristenmanagement",
    icon: "⚖️",
  },
  {
    id: "contract",
    label: "Vertragsrecht",
    description: "Vertragsanalyse, Klauselprüfung, AGB-Kontrolle",
    icon: "📋",
  },
  {
    id: "tax",
    label: "Steuerrecht",
    description: "Subsumption, Gestaltung, Umsatzsteuer, Betriebsprüfung",
    icon: "💰",
  },
  {
    id: "compliance",
    label: "Compliance",
    description: "DSGVO, GwG/AML, GoBD, EU AI Act",
    icon: "✅",
  },
  {
    id: "insurance",
    label: "Versicherungsrecht",
    description: "Deckungsprüfung, Schadenmeldung, Bedarfsanalyse",
    icon: "🛡️",
  },
  {
    id: "real_estate",
    label: "Immobilienrecht",
    description: "Mietverträge, Due Diligence, Rent Roll",
    icon: "🏢",
  },
  {
    id: "corporate",
    label: "Corporate / M&A",
    description: "Deal Memo, Founder Tracking, Portfolio Review",
    icon: "📊",
  },
  {
    id: "general_legal",
    label: "Allgemeines Legal",
    description: "Legal Brain, Subsumption, Normen, Strategie, Beweislage",
    icon: "📚",
  },
  {
    id: "workflow",
    label: "Kanzlei-Workflows",
    description: "Vordefinierte Workflow-Templates für Kanzleiprozesse",
    icon: "🔄",
  },
];

export const CATEGORY_LABELS: Record<SkillCategory, string> = Object.fromEntries(
  SKILL_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<SkillCategory, string>;

// ── Legal Skill Catalog ───────────────────────────────────────────────

export const LEGAL_SKILLS: LegalSkillEntry[] = [
  // ── General Legal ──────────────────────────────────────────────────
  {
    id: "legal-brain",
    name: "Legal Brain",
    version: "1.0.0",
    category: "general_legal",
    description: "Dispatcher für das Legal Brain Subsystem. Routet Legal-Queries zu Specialist-Skills.",
    skill_path: "skills/legal-brain/SKILL.md",
    triggers: ["legal brain", "create a case", "new legal case", "analyze opponent", "assess chances", "Rechtsfall", "Gegneranalyse", "Chancenbewertung", "Rechtsstrategie"],
    dependencies: [],
    writes_pages: true,
    mutating: true,
    writes_to: ["cases/"],
    tools: ["search", "query", "put_page"],
    priority: 60,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: true,
  },
  {
    id: "legal-subsumption",
    name: "Legal Subsumption",
    version: "1.0.0",
    category: "general_legal",
    description: "Juristische Subsumption im Gutachtenstil: Sachverhalt → Tatbestand → Rechtsfolge.",
    skill_path: "skills/legal-subsumption/SKILL.md",
    triggers: ["subsumiere", "subsumption", "prüfe den Sachverhalt", "Tatbestand prüfen", "Rechtsfolge", "Anspruchsgrundlage", "Gutachtenstil", "legal analysis", "apply the law"],
    dependencies: [{ skill_id: "legal-brain", required: false, reason: "Optional: für Fallkontext" }],
    writes_pages: true,
    mutating: false,
    writes_to: ["cases/"],
    tools: ["search", "query"],
    priority: 70,
    enabled: true,
    severity: "high",
    gobd_relevant: false,
    gdpr_relevant: false,
  },
  {
    id: "legal-normen",
    name: "Legal Normen",
    version: "1.0.0",
    category: "general_legal",
    description: "Normenrecherche: BGB, StGB, AO, BGB, ZPO etc. mit Quellenangabe.",
    skill_path: "skills/legal-normen/SKILL.md",
    triggers: ["Norm", "Gesetz", "Paragraph", "§ BGB", "Vorschrift", "legal norm", "statute lookup"],
    dependencies: [],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 50,
    enabled: true,
    severity: "medium",
    gobd_relevant: false,
    gdpr_relevant: false,
  },
  {
    id: "legal-strategie",
    name: "Legal Strategie",
    version: "1.0.0",
    category: "general_legal",
    description: "Strategieentwicklung: Prozessrisiken, Verhandlungsstrategie, Vergleichsoptionen.",
    skill_path: "skills/legal-strategie/SKILL.md",
    triggers: ["Strategie", "Prozessstrategie", "Verhandlungsstrategie", "Vergleich", "process strategy", "settlement strategy"],
    dependencies: [{ skill_id: "legal-brain", required: false, reason: "Optional: für Fallkontext" }],
    writes_pages: true,
    mutating: false,
    writes_to: ["cases/"],
    tools: ["search", "query"],
    priority: 65,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "legal-beweislage",
    name: "Legal Beweislage",
    version: "1.0.0",
    category: "general_legal",
    description: "Beweiswürdigung: Beweislast, Beweiswert, Beweislücken, Beweisführung.",
    skill_path: "skills/legal-beweislage/SKILL.md",
    triggers: ["Beweis", "Beweislast", "Beweiswürdigung", "Beweislücke", "evidence", "burden of proof", "proof analysis"],
    dependencies: [{ skill_id: "legal-brain", required: false, reason: "Optional: für Fallkontext" }],
    writes_pages: true,
    mutating: false,
    writes_to: ["cases/"],
    tools: ["search", "query"],
    priority: 65,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: false,
  },

  // ── Litigation ─────────────────────────────────────────────────────
  {
    id: "precedent-finder",
    name: "Precedent Finder",
    version: "1.0.0",
    category: "litigation",
    description: "Präzedenzfall-Recherche: BGH, OGH, BFH, EuGH Urteile und Leitentscheidungen.",
    skill_path: "skills/precedent-finder/SKILL.md",
    triggers: ["Präzedenzfall", "Leitentscheidung", "BGH-Urteil", "OGH-Urteil", "Rechtsprechung zu", "Urteile zu", "case law", "find precedent", "BFH-Urteil", "EuGH-Entscheidung", "Judikatur"],
    dependencies: [],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 55,
    enabled: true,
    severity: "medium",
    gobd_relevant: false,
    gdpr_relevant: false,
  },
  {
    id: "brief-generator",
    name: "Brief Generator",
    version: "1.0.0",
    category: "litigation",
    description: "Schriftsatzgenerator: Klage, Klageerwiderung, Berufung, Einspruch, Verfügung.",
    skill_path: "skills/brief-generator/SKILL.md",
    triggers: ["Schriftsatz", "erstelle Klage", "Klageschrift", "Klageerwiderung", "Berufungsbegründung", "draft brief", "write complaint", "Einspruch einlegen", "einstweilige Verfügung", "Abmahnung", "Anwaltsschreiben"],
    dependencies: [{ skill_id: "legal-subsumption", required: false, reason: "Optional: für rechtliche Einordnung" }],
    writes_pages: true,
    mutating: true,
    writes_to: ["cases/"],
    tools: ["search", "query", "put_page"],
    priority: 60,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: true,
  },
  {
    id: "cost-calculator",
    name: "Cost Calculator (RVG/RATG)",
    version: "1.0.0",
    category: "litigation",
    description: "Gebührenberechnung nach RVG (DE) / RATG (AT): Streitwert, Verfahrensgebühr, Termingebühr.",
    skill_path: "skills/cost-calculator/SKILL.md",
    triggers: ["Kostenrechner", "Gebühren berechnen", "RVG berechnen", "RATG", "Streitwert Gebühren", "Prozesskosten schätzen", "Anwaltskosten", "legal fee estimate", "Verfahrensgebühr", "Termingebühr"],
    dependencies: [],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 50,
    enabled: true,
    severity: "medium",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "deadline-extract",
    name: "Deadline Extract",
    version: "1.0.0",
    category: "litigation",
    description: "Fristenextraktion aus Dokumenten mit KI-Deadlinedetection.",
    skill_path: "skills/deadline-extract/SKILL.md",
    triggers: ["Frist extrahieren", "Deadlines aus Dokument", "Fristen erkennen", "deadline extraction", "extract deadlines"],
    dependencies: [],
    writes_pages: true,
    mutating: true,
    writes_to: ["cases/"],
    tools: ["search", "put_page"],
    priority: 70,
    enabled: true,
    severity: "critical",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "deadline-templates",
    name: "Deadline Templates",
    version: "1.0.0",
    category: "litigation",
    description: "Fristtemplates für wiederkehrende Fristen (Berufung, Revision, Beschwerde).",
    skill_path: "skills/deadline-templates/SKILL.md",
    triggers: ["Fristtemplate", "Fristvorlage", "deadline template", "recurring deadline"],
    dependencies: [{ skill_id: "deadline-extract", required: false, reason: "Optional: für Extraktion" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 40,
    enabled: true,
    severity: "medium",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "kollisionspruefung",
    name: "Kollisionsprüfung",
    version: "1.0.0",
    category: "litigation",
    description: "Interessenkonflikt-Prüfung nach § 43 BRAO: Mandantenkonflikt, Gegner-Check.",
    skill_path: "skills/kollisionspruefung/SKILL.md",
    triggers: ["Kollisionsprüfung", "Interessenkonflikt", "Konflikt prüfen", "Mandantenkonflikt", "conflict of interest", "check conflict", "BRAO 43", "Gegner prüfen vor Mandat"],
    dependencies: [{ skill_id: "legal-brain", required: false, reason: "Optional: für Mandantenabgleich" }],
    writes_pages: true,
    mutating: false,
    writes_to: ["cases/"],
    tools: ["search", "query"],
    priority: 75,
    enabled: true,
    severity: "critical",
    gobd_relevant: true,
    gdpr_relevant: true,
  },

  // ── Contract ───────────────────────────────────────────────────────
  {
    id: "contract-analysis",
    name: "Contract Analysis",
    version: "1.0.0",
    category: "contract",
    description: "Vertragsanalyse: Klauselmatrix, rote Flaggen, Änderungsvorschläge.",
    skill_path: "skills/contract-analysis/SKILL.md",
    triggers: ["Vertrag prüfen", "Vertragsanalyse", "AGB prüfen", "contract review", "NDA prüfen", "Klauseln prüfen", "analyze contract", "red flags im Vertrag", "Haftungsklausel", "Gewährleistung"],
    dependencies: [],
    writes_pages: true,
    mutating: false,
    writes_to: ["cases/"],
    tools: ["search", "query"],
    priority: 65,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "lease-review",
    name: "Lease Review",
    version: "1.0.0",
    category: "contract",
    description: "Mietvertragsprüfung: Kündigungsfrist, Staffelmiete, Indexmiete, Schönheitsreparaturen.",
    skill_path: "skills/lease-review/SKILL.md",
    triggers: ["Mietvertrag prüfen", "Lease prüfen", "Mietbedingungen", "Kündigungsfrist Miete", "Staffelmiete", "Indexmiete", "Schönheitsreparaturen", "review lease", "lease review", "break clause", "Mietvertrag analysieren"],
    dependencies: [{ skill_id: "contract-analysis", required: false, reason: "Optional: für allgemeine Vertragsanalyse" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 60,
    enabled: true,
    severity: "medium",
    gobd_relevant: false,
    gdpr_relevant: false,
  },

  // ── Tax ────────────────────────────────────────────────────────────
  {
    id: "tax-ruling-lookup",
    name: "Tax Ruling Lookup",
    version: "1.0.0",
    category: "tax",
    description: "Steuerbescheid-Prüfung, Einspruch Finanzamt, Betriebsprüfung, AO Verjährung.",
    skill_path: "skills/tax-ruling-lookup/SKILL.md",
    triggers: ["Steuerbescheid", "Einspruch Finanzamt", "Betriebsprüfung", "Steuerberechnung", "Umsatzsteuer prüfen", "Einkommensteuer", "Körperschaftsteuer", "tax assessment", "tax appeal", "VAT ruling", "Vorsteuerabzug", "Steuererklärung prüfen", "AO Verjährung"],
    dependencies: [],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 55,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "steuer-subsumption",
    name: "Steuer-Subsumption",
    version: "1.0.0",
    category: "tax",
    description: "Steuerliche Subsumption: steuerbar, absetzbar, Betriebsausgabe, Werbungskosten.",
    skill_path: "skills/steuer-subsumption/SKILL.md",
    triggers: ["steuerlich subsumieren", "Steuerfolge", "steuerliche Einordnung", "ist das steuerpflichtig", "ist das absetzbar", "Betriebsausgabe oder nicht", "Werbungskosten prüfen", "steuerbar oder steuerfrei", "tax subsumption", "is this taxable", "is this deductible", "tax treatment of"],
    dependencies: [{ skill_id: "legal-subsumption", required: false, reason: "Optional: für allgemeine Subsumption-Methodik" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 60,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "steuer-gestaltung",
    name: "Steuer-Gestaltung",
    version: "1.0.0",
    category: "tax",
    description: "Steuergestaltung: Rechtsformwahl, Holding, Thesaurierung, Umwandlung.",
    skill_path: "skills/steuer-gestaltung/SKILL.md",
    triggers: ["Steuergestaltung", "Steuer optimieren", "Steuern sparen", "Gestaltungsberatung", "Rechtsformwahl steuerlich", "Holding sinnvoll", "Thesaurieren oder ausschütten", "Umwandlung steuerlich", "tax structuring", "tax optimization", "tax planning", "Gestaltungsmissbrauch"],
    dependencies: [{ skill_id: "steuer-subsumption", required: false, reason: "Optional: für Subsumption" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 55,
    enabled: true,
    severity: "medium",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "umsatzsteuer-check",
    name: "Umsatzsteuer-Check",
    version: "1.0.0",
    category: "tax",
    description: "USt-Behandlung: Reverse Charge, 13b UStG, igL, igE, Leistungsort, OSS, E-Rechnung.",
    skill_path: "skills/umsatzsteuer-check/SKILL.md",
    triggers: ["Umsatzsteuer prüfen", "USt-Behandlung", "Reverse Charge", "13b UStG", "innergemeinschaftliche Lieferung", "innergemeinschaftlicher Erwerb", "Leistungsort", "Vorsteuerabzug", "OSS Verfahren", "E-Rechnung Pflicht", "USt-IdNr prüfen", "VAT treatment", "VAT compliance", "place of supply"],
    dependencies: [],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 60,
    enabled: true,
    severity: "high",
    gobd_relevant: true,
    gdpr_relevant: false,
  },
  {
    id: "datev-export",
    name: "DATEV Export",
    version: "1.0.0",
    category: "tax",
    description: "Buchhaltungsexport nach DATEV: Rechnungen, Zeiterfassung, Mandantenabrechnung.",
    skill_path: "skills/datev-export/SKILL.md",
    triggers: ["DATEV Export", "DATEV", "Buchhaltungsexport", "Rechnung exportieren", "Zeiterfassung exportieren", "Kanzlei-Buchhaltung", "Abrechnungsexport", "billing export", "time tracking export", "accounting export", "Kostenstelle", "USt-IdNr", "Mandantenabrechnung"],
    dependencies: [],
    writes_pages: false,
    mutating: true,
    tools: ["search", "put_page"],
    priority: 50,
    enabled: true,
    severity: "medium",
    gobd_relevant: true,
    gdpr_relevant: true,
  },

  // ── Compliance ─────────────────────────────────────────────────────
  {
    id: "dsgvo-compliance",
    name: "DSGVO Compliance",
    version: "1.0.0",
    category: "compliance",
    description: "DSGVO-Check: Verarbeitungsverzeichnis, DSFA, Datenschutzverletzung, Breach Notification.",
    skill_path: "skills/dsgvo-compliance/SKILL.md",
    triggers: ["DSGVO", "Datenschutz", "GDPR", "DSGVO-Check", "Datenschutzprüfung", "DSGVO-Konformität", "Datenverarbeitung prüfen", "privacy compliance", "data protection", "Verarbeitungsverzeichnis", "Datenschutz-Folgenabschätzung", "DSFA", "DPIA", "Datenschutzverletzung", "Breach notification"],
    dependencies: [],
    writes_pages: true,
    mutating: false,
    writes_to: ["compliance/"],
    tools: ["search", "query"],
    priority: 65,
    enabled: true,
    severity: "critical",
    gobd_relevant: true,
    gdpr_relevant: true,
  },
  {
    id: "aml-screener",
    name: "AML Screener",
    version: "1.0.0",
    category: "compliance",
    description: "GwG-Prüfung: KYC, Sanktionslisten, PEP, Geldwäsche-Screening.",
    skill_path: "skills/aml-screener/SKILL.md",
    triggers: ["AML-Prüfung", "KYC-Check", "Sanktionslistenprüfung", "PEP-Prüfung", "Geldwäscheprüfung", "aml screening", "sanction screening", "screen this entity", "Mandantenprüfung GwG", "due diligence compliance"],
    dependencies: [],
    writes_pages: true,
    mutating: false,
    writes_to: ["compliance/"],
    tools: ["search", "query"],
    priority: 70,
    enabled: true,
    severity: "critical",
    gobd_relevant: true,
    gdpr_relevant: true,
  },
  {
    id: "eu-ai-act-inventory",
    name: "EU AI Act Inventory",
    version: "1.0.0",
    category: "compliance",
    description: "KI-VO Einstufung: Hochrisiko KI, Annex III, Art. 50 Kennzeichnung.",
    skill_path: "skills/eu-ai-act-inventory/SKILL.md",
    triggers: ["AI Act Inventar", "KI-VO Einstufung", "EU AI Act", "Hochrisiko KI", "Annex III", "Art. 50 Kennzeichnung", "KI-System einstufen", "AI Act classification", "AI inventory", "high-risk AI", "AI Act obligations"],
    dependencies: [],
    writes_pages: true,
    mutating: false,
    writes_to: ["compliance/"],
    tools: ["search", "query"],
    priority: 55,
    enabled: true,
    severity: "high",
    gobd_relevant: false,
    gdpr_relevant: true,
  },
  {
    id: "control-effectiveness",
    name: "Control Effectiveness",
    version: "1.0.0",
    category: "compliance",
    description: "Kontrollwirksamkeit: IKS-Prüfung, Maßnahmebewertung, effectiveness assessment.",
    skill_path: "skills/control-effectiveness/SKILL.md",
    triggers: ["Kontrolle prüfen", "Kontrollwirksamkeit", "control effectiveness", "Wirksamkeit der Maßnahme", "ist die Kontrolle wirksam", "control testing", "Kontrolltest", "IKS prüfen", "effectiveness assessment", "Maßnahme bewerten"],
    dependencies: [],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 45,
    enabled: true,
    severity: "medium",
    gobd_relevant: true,
    gdpr_relevant: false,
  },

  // ── Insurance ──────────────────────────────────────────────────────
  {
    id: "policy-review",
    name: "Policy Review",
    version: "1.0.0",
    category: "insurance",
    description: "Versicherungsprüfung: Deckung, Ausschlüsse, Selbstbehalt, Sublimit.",
    skill_path: "skills/policy-review/SKILL.md",
    triggers: ["Police prüfen", "Vertrag prüfen Versicherung", "Deckung prüfen", "Versicherungsumfang", "Selbstbehalt", "Ausschlüsse prüfen", "Sublimit", "review policy", "policy review", "coverage check", "what does this policy cover", "exclusions"],
    dependencies: [{ skill_id: "contract-analysis", required: false, reason: "Optional: für allgemeine Vertragsanalyse" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 55,
    enabled: true,
    severity: "medium",
    gobd_relevant: false,
    gdpr_relevant: false,
  },
  {
    id: "claims-assist",
    name: "Claims Assist",
    version: "1.0.0",
    category: "insurance",
    description: "Schadenmeldung: Deckungsprüfung, Schadenregulierung, Meldung.",
    skill_path: "skills/claims-assist/SKILL.md",
    triggers: ["Schaden melden", "Schadenfall", "ist der Schaden gedeckt", "Schadenmeldung", "Schaden prüfen", "insurance claim", "coverage claim", "insurance claim notification", "Schadenregulierung"],
    dependencies: [{ skill_id: "policy-review", required: false, reason: "Optional: für Deckungsprüfung" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 60,
    enabled: true,
    severity: "medium",
    gobd_relevant: false,
    gdpr_relevant: true,
  },
  {
    id: "coverage-gap-finder",
    name: "Coverage Gap Finder",
    version: "1.0.0",
    category: "insurance",
    description: "Deckungslücken-Analyse: Unterversicherung, fehlende Versicherung, Bedarfsanalyse.",
    skill_path: "skills/coverage-gap-finder/SKILL.md",
    triggers: ["Deckungslücke", "Unterversicherung", "fehlende Versicherung", "was fehlt an Deckung", "Cross-Sell Versicherung", "Bedarfsanalyse", "coverage gap", "underinsured", "what coverage is missing", "insurance needs analysis"],
    dependencies: [{ skill_id: "policy-review", required: false, reason: "Optional: für aktuelle Deckung" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 50,
    enabled: true,
    severity: "low",
    gobd_relevant: false,
    gdpr_relevant: false,
  },

  // ── Real Estate ────────────────────────────────────────────────────
  {
    id: "property-due-diligence",
    name: "Property Due Diligence",
    version: "1.0.0",
    category: "real_estate",
    description: "Immobilien-Due-Diligence: Grundbuch, Lasten, Objektprüfung, Transaktionsprüfung.",
    skill_path: "skills/property-due-diligence/SKILL.md",
    triggers: ["Due Diligence Immobilie", "Ankaufsprüfung", "Immobilie kaufen prüfen", "Objektprüfung", "Grundbuch prüfen", "Lasten Immobilie", "property due diligence", "real estate due diligence", "acquisition checklist", "Transaktionsprüfung"],
    dependencies: [],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 55,
    enabled: true,
    severity: "high",
    gobd_relevant: false,
    gdpr_relevant: false,
  },
  {
    id: "rent-roll-analysis",
    name: "Rent Roll Analysis",
    version: "1.0.0",
    category: "real_estate",
    description: "Mietaufstellungs-Analyse: Mieterträge, Leerstand, WALT, Portfolio.",
    skill_path: "skills/rent-roll-analysis/SKILL.md",
    triggers: ["Rent Roll", "Mietaufstellung", "Mieterträge analysieren", "Leerstand", "WALT", "Mietvertragsablauf", "Portfolio Miete", "rent roll", "occupancy analysis", "lease expiry", "portfolio analysis"],
    dependencies: [{ skill_id: "lease-review", required: false, reason: "Optional: für Mietvertragsdetails" }],
    writes_pages: false,
    mutating: false,
    tools: ["search"],
    priority: 50,
    enabled: true,
    severity: "medium",
    gobd_relevant: false,
    gdpr_relevant: false,
  },
];

// ── Workflow-to-Skill Mapping ─────────────────────────────────────────

export interface WorkflowSkillMapping {
  workflow_id: string;
  workflow_label: string;
  skill_ids: string[];
  description: string;
}

export const WORKFLOW_SKILL_MAPPINGS: WorkflowSkillMapping[] = [
  {
    workflow_id: "due_diligence",
    workflow_label: "Due Diligence",
    skill_ids: ["contract-analysis", "legal-beweislage", "legal-strategie", "kollisionspruefung"],
    description: "Risikoprüfung aller Verträge und Dokumente einer Akte",
  },
  {
    workflow_id: "contract_review",
    workflow_label: "Vertrags-Review",
    skill_ids: ["contract-analysis", "lease-review"],
    description: "Klauselmatrix, rote Flaggen und Änderungsvorschläge",
  },
  {
    workflow_id: "litigation_prep",
    workflow_label: "Litigation Prep",
    skill_ids: ["legal-subsumption", "legal-normen", "precedent-finder", "legal-beweislage", "deadline-extract", "cost-calculator"],
    description: "Sachverhalt, Gesetze, Präzedenzfälle, Beweisstrategie",
  },
  {
    workflow_id: "compliance_check",
    workflow_label: "Compliance-Check",
    skill_ids: ["dsgvo-compliance", "aml-screener", "eu-ai-act-inventory", "control-effectiveness"],
    description: "DSGVO, GwG, GoBD — Handlungsbedarf mit Priorisierung",
  },
  {
    workflow_id: "fristen_management",
    workflow_label: "Fristen-Management",
    skill_ids: ["deadline-extract", "deadline-templates"],
    description: "Alle Fristen einer Akte erfassen und bestätigen",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

export function getSkill(id: string): LegalSkillEntry | undefined {
  return LEGAL_SKILLS.find((s) => s.id === id);
}

export function getSkillsByCategory(category: SkillCategory): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) => s.category === category && s.enabled);
}

export function getEnabledSkills(): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) => s.enabled);
}

export function getSkillByPath(skillPath: string): LegalSkillEntry | undefined {
  return LEGAL_SKILLS.find((s) => s.skill_path === skillPath);
}

export function getDependencies(skillId: string): LegalSkillEntry[] {
  const skill = getSkill(skillId);
  if (!skill) return [];
  return skill.dependencies
    .map((d) => getSkill(d.skill_id))
    .filter((s): s is LegalSkillEntry => s !== undefined);
}

export function getDependents(skillId: string): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) =>
    s.dependencies.some((d) => d.skill_id === skillId),
  );
}

export function getSkillsBySeverity(severity: SkillSeverity): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) => s.severity === severity && s.enabled);
}

export function getCriticalSkills(): LegalSkillEntry[] {
  return getSkillsBySeverity("critical");
}

export function getWritingSkills(): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) => s.writes_pages && s.enabled);
}

export function getGoBdRelevantSkills(): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) => s.gobd_relevant && s.enabled);
}

export function getGdprRelevantSkills(): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) => s.gdpr_relevant && s.enabled);
}

export function getWorkflowMapping(workflowId: string): WorkflowSkillMapping | undefined {
  return WORKFLOW_SKILL_MAPPINGS.find((w) => w.workflow_id === workflowId);
}

export function getSkillsForWorkflow(workflowId: string): LegalSkillEntry[] {
  const mapping = getWorkflowMapping(workflowId);
  if (!mapping) return [];
  return mapping.skill_ids
    .map((id) => getSkill(id))
    .filter((s): s is LegalSkillEntry => s !== undefined);
}

/** Check if all dependencies of a skill are enabled */
export function areDependenciesSatisfied(skillId: string): boolean {
  const deps = getDependencies(skillId);
  return deps.every((d) => d.enabled);
}

/** Get skills with unsatisfied dependencies */
export function getSkillsWithUnsatisfiedDependencies(): LegalSkillEntry[] {
  return LEGAL_SKILLS.filter((s) => !areDependenciesSatisfied(s.id));
}

/** Check for MECE violations: triggers that match multiple skills */
export function findMeceOverlaps(): Array<{ trigger: string; skills: string[] }> {
  const triggerMap = new Map<string, string[]>();
  for (const skill of LEGAL_SKILLS) {
    if (!skill.enabled) continue;
    for (const trigger of skill.triggers) {
      const normalized = trigger.toLowerCase().trim();
      if (!triggerMap.has(normalized)) triggerMap.set(normalized, []);
      triggerMap.get(normalized)!.push(skill.id);
    }
  }
  const overlaps: Array<{ trigger: string; skills: string[] }> = [];
  for (const [trigger, skills] of triggerMap) {
    if (skills.length > 1) {
      overlaps.push({ trigger, skills });
    }
  }
  return overlaps;
}

/** Check for unreachable skills: skills not referenced by any workflow or dependency */
export function findUnreachableSkills(): LegalSkillEntry[] {
  const referenced = new Set<string>();
  for (const mapping of WORKFLOW_SKILL_MAPPINGS) {
    for (const id of mapping.skill_ids) {
      referenced.add(id);
    }
  }
  for (const skill of LEGAL_SKILLS) {
    for (const dep of skill.dependencies) {
      referenced.add(dep.skill_id);
    }
  }
  return LEGAL_SKILLS.filter((s) => s.enabled && !referenced.has(s.id));
}

/** Check for missing skill files: skills whose SKILL.md path doesn't exist in the catalog */
export function findMissingSkillPaths(existingPaths: string[]): LegalSkillEntry[] {
  const existingSet = new Set(existingPaths);
  return LEGAL_SKILLS.filter((s) => s.enabled && !existingSet.has(s.skill_path));
}

/** Get the pack version */
export function getPackVersion(): string {
  return "1.0.0";
}

// ── Summary ───────────────────────────────────────────────────────────

export interface LegalSkillPackSummary {
  total_skills: number;
  enabled_skills: number;
  by_category: Record<SkillCategory, number>;
  by_severity: Record<SkillSeverity, number>;
  writing_skills: number;
  gobd_relevant: number;
  gdpr_relevant: number;
  total_triggers: number;
  total_dependencies: number;
  workflow_mappings: number;
  mece_overlaps: number;
  unreachable_skills: number;
  pack_version: string;
}

export function getPackSummary(): LegalSkillPackSummary {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let totalTriggers = 0;
  let totalDeps = 0;

  for (const skill of LEGAL_SKILLS) {
    byCategory[skill.category] = (byCategory[skill.category] ?? 0) + 1;
    bySeverity[skill.severity] = (bySeverity[skill.severity] ?? 0) + 1;
    totalTriggers += skill.triggers.length;
    totalDeps += skill.dependencies.length;
  }

  return {
    total_skills: LEGAL_SKILLS.length,
    enabled_skills: getEnabledSkills().length,
    by_category: byCategory as Record<SkillCategory, number>,
    by_severity: bySeverity as Record<SkillSeverity, number>,
    writing_skills: getWritingSkills().length,
    gobd_relevant: getGoBdRelevantSkills().length,
    gdpr_relevant: getGdprRelevantSkills().length,
    total_triggers: totalTriggers,
    total_dependencies: totalDeps,
    workflow_mappings: WORKFLOW_SKILL_MAPPINGS.length,
    mece_overlaps: findMeceOverlaps().length,
    unreachable_skills: findUnreachableSkills().length,
    pack_version: getPackVersion(),
  };
}
