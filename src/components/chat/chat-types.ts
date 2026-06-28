import type { QueryMode } from "@/lib/matter-context-types";

export type ChatRole = "user" | "assistant";

export type ChatContextType = "global" | "case" | "brain_page";

export interface ChatCitation {
  slug: string;
  title: string;
  quote?: string;
  confidence?: number;
  case_slug?: string;
  chunk_index?: number;
  page_number?: number;
  char_offset_start?: number;
  char_offset_end?: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  citations?: ChatCitation[];
  gaps?: string[];
  isStreaming?: boolean;
  createdAt: string;
  tokensUsed?: number;
  latencyMs?: number;
  model?: string;
  mode?: QueryMode;
  attachments?: Array<{ name: string; slug: string }>;
  error?: string;
  replyTo?: { id: string; role: ChatRole; preview: string };
  toolCalls?: ToolCall[];
}

export type ToolType =
  | "navigate"
  | "search_cases"
  | "search_deadlines"
  | "search_knowledge"
  | "create_case"
  | "case_summary"
  | "email_draft"
  | "deadline_extract"
  | "document_summary"
  | "conflict_check"
  | "time_entry"
  | "client_update"
  | "meeting_tasks"
  | "intake_create"
  | "rvg_calculate"
  | "document_request_create"
  | "precedent_search"
  | "translate_text"
  | "obligation_extract"
  | "tabular_review"
  | "send_email";

export const DESTRUCTIVE_TOOLS: ReadonlySet<ToolType> = new Set([
  "create_case",
  "intake_create",
  "time_entry",
  "document_request_create",
  "send_email",
]);

export interface ToolCall {
  id: string;
  type: ToolType;
  label: string;
  params: Record<string, unknown>;
  status: "pending" | "executing" | "completed" | "error";
  result?: ToolResult;
  requiresConfirmation?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  display: ToolResultDisplay;
}

export interface ToolResultDisplay {
  kind: "navigation" | "list" | "summary" | "confirmation";
  title: string;
  items?: Array<{ label: string; value?: string; href?: string }>;
  href?: string;
  message?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  contextType: ChatContextType;
  caseSlug?: string;
  pageSlug?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastPreview?: string;
  pinned?: boolean;
  tags?: string[];
}

export interface ChatFeatures {
  modelSelector?: boolean;
  modeSelector?: boolean;
  caseSelector?: boolean;
  jurisdictionSelector?: boolean;
  fileUpload?: boolean;
  markdownRendering?: boolean;
  sessionHistory?: boolean;
  tokenWidget?: boolean;
  brainStatus?: boolean;
  exampleQueries?: boolean;
  exportChat?: boolean;
  messageActions?: boolean;
}

export const DEFAULT_FEATURES: Required<ChatFeatures> = {
  modelSelector: true,
  modeSelector: true,
  caseSelector: true,
  jurisdictionSelector: true,
  fileUpload: true,
  markdownRendering: true,
  sessionHistory: true,
  tokenWidget: true,
  brainStatus: true,
  exampleQueries: true,
  exportChat: true,
  messageActions: true,
};

export interface ChatPanelConfig {
  context?: {
    type: ChatContextType;
    caseSlug?: string;
    pageSlug?: string;
  };
  features?: ChatFeatures;
  persistHistory?: boolean;
  className?: string;
  title?: string;
}

export type Jurisdiction = "de" | "at" | "ch" | "eu";

export type ThinkMode = "conservative" | "balanced" | "tokenmax";

export interface ChatQueryOptions {
  query: string;
  mode?: ThinkMode;
  queryMode?: QueryMode;
  caseSlug?: string;
  model?: string;
  jurisdiction?: Jurisdiction;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
}

export interface ChatQueryResult {
  answer: string;
  citations: ChatCitation[];
  gaps: string[];
  tokensUsed?: number;
  latencyMs?: number;
  mode?: ThinkMode;
}

export const GAP_ICONS: Record<string, string> = {
  missing_document: "📄",
  missing_deadline: "⏰",
  missing_power_of_attorney: "✍️",
  missing_attachment: "📎",
  missing_deadline_confirmation: "✅",
  unclear_opponent: "❓",
  unreviewed_document: "🔍",
  contradictory_facts: "⚠️",
  stale_knowledge_asset: "📅",
  missing_client_info: "👤",
  engine_unreachable: "🔌",
  incomplete_coverage: "📊",
  missing_communication_log: "💬",
  unprivileged_communication: "🔒",
  ethical_wall_violation: "🚫",
};

export const GAP_LABELS: Record<string, string> = {
  missing_document: "Fehlendes Dokument",
  missing_deadline: "Fehlende Frist",
  missing_power_of_attorney: "Fehlende Vollmacht",
  missing_attachment: "Fehlender Anhang",
  missing_deadline_confirmation: "Fehlende Fristbestätigung",
  unclear_opponent: "Unklarer Gegner",
  unreviewed_document: "Ungeprüftes Dokument",
  contradictory_facts: "Widersprüchliche Fakten",
  stale_knowledge_asset: "Veraltete Wissensquelle",
  missing_client_info: "Fehlende Mandantendaten",
  engine_unreachable: "Engine nicht erreichbar",
  incomplete_coverage: "Unvollständige Abdeckung",
  missing_communication_log: "Fehlendes Kommunikationsprotokoll",
  unprivileged_communication: "Nicht-privilegierte Kommunikation",
  ethical_wall_violation: "Ethical Wall Verletzung",
};

export const GAP_LABELS_EN: Record<string, string> = {
  missing_document: "Missing document",
  missing_deadline: "Missing deadline",
  missing_power_of_attorney: "Missing power of attorney",
  missing_attachment: "Missing attachment",
  missing_deadline_confirmation: "Missing deadline confirmation",
  unclear_opponent: "Unclear opponent",
  unreviewed_document: "Unreviewed document",
  contradictory_facts: "Contradictory facts",
  stale_knowledge_asset: "Stale knowledge asset",
  missing_client_info: "Missing client information",
  engine_unreachable: "Engine unreachable",
  incomplete_coverage: "Incomplete coverage",
  missing_communication_log: "Missing communication log",
  unprivileged_communication: "Unprivileged communication",
  ethical_wall_violation: "Ethical wall violation",
};

export const DEFAULT_EXAMPLE_QUERIES: string[] = [
  "Welche Fristen und offenen Aufgaben sind heute kritisch?",
  "Fasse eine Akte mit Risiken, Belegen und nächsten Schritten zusammen.",
  "Prüfe ein Dokument auf Fristen, Anlagen und Widersprüche.",
  "Erstelle ein Mandantenupdate aus dem aktuellen Aktenstand.",
  "Welche Unterlagen oder Signaturen fehlen noch?",
];

export const DEFAULT_EXAMPLE_QUERIES_EN: string[] = [
  "Which deadlines and open tasks are critical today?",
  "Summarize a case with risks, citations, and next steps.",
  "Check a document for deadlines, attachments, and contradictions.",
  "Create a client update from the current case status.",
  "Which documents or signatures are still missing?",
];

export interface ChatTemplate {
  id: string;
  label: string;
  template: string;
  category: "recherche" | "drafting" | "fristen" | "aktenanalyse" | "allgemein";
}

export const CHAT_TEMPLATES: ChatTemplate[] = [
  {
    id: "tpl-recherche-rechtslage",
    label: "Rechtslage recherchieren",
    template:
      "Bitte recherchiere die aktuelle Rechtslage zu folgendem Thema und zitiere die relevanten Normen: ",
    category: "recherche",
  },
  {
    id: "tpl-drafting-klage",
    label: "Klageentwurf erstellen",
    template:
      "Erstelle einen Klageentwurf mit folgenden Eckdaten:\n- Gericht: \n- Kläger: \n- Beklagter: \n- Streitgegenstand: ",
    category: "drafting",
  },
  {
    id: "tpl-fristen-berechnen",
    label: "Frist berechnen",
    template:
      "Berechne die Frist für folgende Angabe und nenne den letzten Tag der Frist:\n- Fristbeginn: \n- Fristdauer: ",
    category: "fristen",
  },
  {
    id: "tpl-aktenanalyse-zusammenfassung",
    label: "Aktenzusammenfassung",
    template:
      "Fasse die wichtigsten Fakten, Parteien und offenen Fragen aus dieser Akte zusammen: ",
    category: "aktenanalyse",
  },
  {
    id: "tpl-aktenanalyse-risiken",
    label: "Risikoanalyse Akte",
    template:
      "Analysiere die Risiken in dieser Akte: Welche prozessualen, materiell-rechtlichen und strategischen Risiken bestehen? ",
    category: "aktenanalyse",
  },
  {
    id: "tpl-recherche-präzedenzfälle",
    label: "Präzedenzfälle suchen",
    template: "Suche nach relevanten Präzedenzfällen und Urteilen zu folgendem Sachverhalt: ",
    category: "recherche",
  },
  {
    id: "tpl-drafting-vertrag",
    label: "Vertragsentwurf",
    template:
      "Erstelle einen Vertragsentwurf für folgende Vereinbarung:\n- Vertragsart: \n- Parteien: \n- Wesentliche Inhalte: ",
    category: "drafting",
  },
  {
    id: "tpl-allgemein-erklärung",
    label: "Rechtsbegriff erklären",
    template: "Erkläre den folgenden Rechtsbegriff verständlich und mit Beispielen: ",
    category: "allgemein",
  },
];

export const CHAT_TEMPLATES_EN: ChatTemplate[] = [
  {
    id: "tpl-recherche-rechtslage",
    label: "Research legal situation",
    template:
      "Please research the current legal situation on the following topic and cite the relevant statutes: ",
    category: "recherche",
  },
  {
    id: "tpl-drafting-klage",
    label: "Draft a lawsuit",
    template:
      "Draft a lawsuit with the following details:\n- Court: \n- Plaintiff: \n- Defendant: \n- Subject matter: ",
    category: "drafting",
  },
  {
    id: "tpl-fristen-berechnen",
    label: "Calculate deadline",
    template:
      "Calculate the deadline for the following and state the last day:\n- Start date: \n- Duration: ",
    category: "fristen",
  },
  {
    id: "tpl-aktenanalyse-zusammenfassung",
    label: "Case summary",
    template: "Summarize the key facts, parties, and open questions from this case: ",
    category: "aktenanalyse",
  },
  {
    id: "tpl-aktenanalyse-risiken",
    label: "Risk analysis",
    template:
      "Analyze the risks in this case: What procedural, substantive, and strategic risks exist? ",
    category: "aktenanalyse",
  },
  {
    id: "tpl-recherche-präzedenzfälle",
    label: "Search precedents",
    template: "Search for relevant precedents and rulings on the following matter: ",
    category: "recherche",
  },
  {
    id: "tpl-drafting-vertrag",
    label: "Draft contract",
    template:
      "Draft a contract for the following agreement:\n- Contract type: \n- Parties: \n- Key terms: ",
    category: "drafting",
  },
  {
    id: "tpl-allgemein-erklärung",
    label: "Explain legal term",
    template: "Explain the following legal term in plain language with examples: ",
    category: "allgemein",
  },
];
