/**
 * Litigation Flow — Strukturierte prozessuale Phasenführung für Gerichtsverfahren.
 *
 * Phasen (DACH-angepasst):
 *   pre_filing    → Vorbereitung (Mandatsaufnahme, Recherche, Klageprüfung)
 *   filing        → Klageerhebung / Antragstellung
 *   discovery     → Beweisaufnahme / Schriftverkehr (AT: Streitverhalten)
 *   pre_trial     → Hauptverhandlungsvorbereitung / Terminsvorbereitung
 *   trial         → Hauptverhandlung / mündliche Verhandlung
 *   post_trial    → Urteil & Nachbereitung
 *   appeal        → Berufung / Revision
 *   enforcement   → Vollstreckung
 *   closed        → Abgeschlossen
 */

export type LitigationPhase =
  | "pre_filing"
  | "filing"
  | "discovery"
  | "pre_trial"
  | "trial"
  | "post_trial"
  | "appeal"
  | "enforcement"
  | "closed";

export type StepStatus = "pending" | "in_progress" | "completed" | "blocked" | "skipped";

export type StepType =
  | "task"
  | "filing"
  | "motion"
  | "hearing"
  | "deadline"
  | "document"
  | "communication"
  | "evidence"
  | "settlement"
  | "enforcement";

export interface LitigationStep {
  id: string;
  type: StepType;
  title: string;
  description?: string;
  status: StepStatus;
  dueDate?: string;
  completedAt?: string;
  assignedTo?: string;
  metadata?: Record<string, unknown>;
}

export interface LitigationMatter {
  slug: string;
  caseSlug: string;
  caseTitle: string;
  phase: LitigationPhase;
  court?: string;
  courtFileNumber?: string;
  instance: string;
  steps: LitigationStep[];
  phaseHistory: Array<{ phase: LitigationPhase; changedAt: string; changedBy?: string }>;
  settlement?: {
    status: "none" | "offered" | "negotiating" | "agreed" | "failed";
    amount?: number;
    currency?: string;
    date?: string;
    notes?: string;
  };
  judgment?: {
    outcome: "favorable" | "unfavorable" | "partial" | "pending";
    date?: string;
    summary?: string;
    appealable: boolean;
    appealedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const PHASE_ORDER: LitigationPhase[] = [
  "pre_filing",
  "filing",
  "discovery",
  "pre_trial",
  "trial",
  "post_trial",
  "appeal",
  "enforcement",
  "closed",
];

export const PHASE_TRANSITIONS: Record<LitigationPhase, LitigationPhase[]> = {
  pre_filing: ["filing", "closed"],
  filing: ["discovery", "pre_trial", "closed"],
  discovery: ["pre_trial", "trial", "filing", "closed"],
  pre_trial: ["trial", "discovery", "closed"],
  trial: ["post_trial", "closed"],
  post_trial: ["appeal", "enforcement", "closed"],
  appeal: ["pre_trial", "trial", "post_trial", "closed"],
  enforcement: ["closed"],
  closed: ["pre_filing"],
};

export function canAdvancePhase(from: LitigationPhase, to: LitigationPhase): boolean {
  return (PHASE_TRANSITIONS[from] ?? []).includes(to);
}

export function getNextPhases(current: LitigationPhase): LitigationPhase[] {
  return [...(PHASE_TRANSITIONS[current] ?? [])];
}

export function getPhaseProgress(current: LitigationPhase): number {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0) return 0;
  return Math.round((idx / (PHASE_ORDER.length - 1)) * 100);
}

export const PHASE_LABELS_DE: Record<LitigationPhase, string> = {
  pre_filing: "Vorbereitung",
  filing: "Klageerhebung",
  discovery: "Beweisaufnahme",
  pre_trial: "Terminsvorbereitung",
  trial: "Hauptverhandlung",
  post_trial: "Urteil & Nachbereitung",
  appeal: "Berufung / Revision",
  enforcement: "Vollstreckung",
  closed: "Abgeschlossen",
};

export const PHASE_LABELS_EN: Record<LitigationPhase, string> = {
  pre_filing: "Pre-Filing",
  filing: "Filing",
  discovery: "Discovery",
  pre_trial: "Pre-Trial",
  trial: "Trial",
  post_trial: "Post-Trial",
  appeal: "Appeal",
  enforcement: "Enforcement",
  closed: "Closed",
};

export const STEP_TYPE_LABELS_DE: Record<StepType, string> = {
  task: "Aufgabe",
  filing: "Schriftsatz",
  motion: "Antrag",
  hearing: "Termin",
  deadline: "Frist",
  document: "Dokument",
  communication: "Kommunikation",
  evidence: "Beweis",
  settlement: "Vergleich",
  enforcement: "Vollstreckung",
};

export const STEP_STATUS_LABELS_DE: Record<StepStatus, string> = {
  pending: "Offen",
  in_progress: "In Bearbeitung",
  completed: "Erledigt",
  blocked: "Blockiert",
  skipped: "Übersprungen",
};

export const STEP_STATUS_COLORS: Record<StepStatus, string> = {
  pending: "#6a6a8a",
  in_progress: "#6366f1",
  completed: "#22c55e",
  blocked: "#ef4444",
  skipped: "#6a6a8a",
};

export const PHASE_ICONS: Record<LitigationPhase, string> = {
  pre_filing: "FileSearch",
  filing: "FileText",
  discovery: "Search",
  pre_trial: "CalendarClock",
  trial: "Gavel",
  post_trial: "FileCheck",
  appeal: "ArrowUpCircle",
  enforcement: "Shield",
  closed: "CheckCircle",
};

interface DefaultStep {
  type: StepType;
  title: string;
  description: string;
}

export const DEFAULT_STEPS_BY_PHASE: Record<LitigationPhase, DefaultStep[]> = {
  pre_filing: [
    {
      type: "task",
      title: "Mandatsaufnahme",
      description: "Vollmacht, Mandatsvereinbarung, Aktenanlage",
    },
    {
      type: "task",
      title: "Sachverhaltsanalyse",
      description: "Fakten sammeln, rechtliche Prüfung",
    },
    {
      type: "evidence",
      title: "Beweissicherung",
      description: "Dokumente sichern, Zeugen identifizieren",
    },
    {
      type: "task",
      title: "Klageprüfung",
      description: "Schlüssigkeit, Zuständigkeit, Streitwert",
    },
    { type: "task", title: "Kollisionsprüfung", description: "BRAO § 43a, BORA § 31" },
  ],
  filing: [
    { type: "filing", title: "Klageschrift", description: "Klage einreichen beim Gericht" },
    { type: "deadline", title: "Klagefrist", description: "Frist für Klageerhebung prüfen" },
    { type: "document", title: "Anlagen", description: "Klagebeilagen vorbereiten" },
  ],
  discovery: [
    { type: "evidence", title: "Beweisantritt", description: "Beweismittel benennen" },
    {
      type: "communication",
      title: "Schriftverkehr",
      description: "Schriftsätze an Gericht und Gegner",
    },
    { type: "task", title: "Beweisaufnahme", description: "Zeugenladung, Gutachten, Urkunden" },
  ],
  pre_trial: [
    {
      type: "task",
      title: "Terminsvorbereitung",
      description: "Schriftsatzvorbereitung, Aktenstudium",
    },
    {
      type: "hearing",
      title: "Termin vereinbart",
      description: "Hauptverhandlungstermin bestätigen",
    },
    {
      type: "task",
      title: "Mandantenvorbereitung",
      description: "Mandant auf Verhandlung vorbereiten",
    },
  ],
  trial: [
    { type: "hearing", title: "Hauptverhandlung", description: "Mündliche Verhandlung" },
    { type: "motion", title: "Beweisanträge", description: "Anträge in der Verhandlung" },
    { type: "communication", title: "Plädoyer", description: "Abschlussvortrag" },
  ],
  post_trial: [
    { type: "deadline", title: "Urteil zugestellt", description: "Zustellungsdatum dokumentieren" },
    {
      type: "deadline",
      title: "Berufungsfrist",
      description: "Frist für Berufung/Revision prüfen",
    },
    {
      type: "task",
      title: "Mandanteninformation",
      description: "Urteil besprechen, nächste Schritte",
    },
  ],
  appeal: [
    { type: "filing", title: "Berufungsschrift", description: "Berufung einreichen" },
    { type: "deadline", title: "Berufungsfrist", description: "Frist wahren" },
    { type: "document", title: "Berufungsbegründung", description: "Begründungsschrift" },
  ],
  enforcement: [
    {
      type: "enforcement",
      title: "Vollstreckungsantrag",
      description: "Klausel und Vollstreckung",
    },
    { type: "task", title: "Vollstreckung", description: "Zwangsvollstreckung durchführen" },
  ],
  closed: [
    { type: "task", title: "Aktenabschluss", description: "Akten schließen, Archivierung" },
    { type: "task", title: "Kostenabrechnung", description: "RVG-Abrechnung, DATEV-Export" },
  ],
};

export function generateDefaultSteps(phase: LitigationPhase): LitigationStep[] {
  const defaults = DEFAULT_STEPS_BY_PHASE[phase] ?? [];
  return defaults.map((s, i) => ({
    id: `${phase}_${i}_${Date.now()}`,
    type: s.type,
    title: s.title,
    description: s.description,
    status: "pending" as StepStatus,
  }));
}

export function parseLitigationMatter(
  slug: string,
  frontmatter: Record<string, unknown>
): LitigationMatter | null {
  if (frontmatter.type !== "litigation_matter") return null;
  const rawSteps = (frontmatter.steps as LitigationStep[]) ?? [];
  const rawHistory = (frontmatter.phase_history as LitigationMatter["phaseHistory"]) ?? [];
  return {
    slug,
    caseSlug: (frontmatter.case_slug as string) ?? "",
    caseTitle: (frontmatter.case_title as string) ?? "",
    phase: (frontmatter.phase as LitigationPhase) ?? "pre_filing",
    court: frontmatter.court as string | undefined,
    courtFileNumber: frontmatter.court_file_number as string | undefined,
    instance: (frontmatter.instance as string) ?? "1. Instanz",
    steps: rawSteps,
    phaseHistory: rawHistory,
    settlement: frontmatter.settlement as LitigationMatter["settlement"],
    judgment: frontmatter.judgment as LitigationMatter["judgment"],
    createdAt: (frontmatter.created_at as string) ?? new Date().toISOString(),
    updatedAt: (frontmatter.updated_at as string) ?? new Date().toISOString(),
  };
}
