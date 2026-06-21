import type { QueryMode } from "@/lib/matter-context-types";

export type ChatRole = "user" | "assistant";

export type ChatContextType = "global" | "case" | "brain_page";

export interface ChatCitation {
  slug: string;
  title: string;
  quote?: string;
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

export const DEFAULT_EXAMPLE_QUERIES: string[] = [
  "Was muss ich vor dem nächsten Meeting wissen?",
  "Welche offenen Punkte gibt es mit Kunde X?",
  "Zeige mir alle Entscheidungen aus dem letzten Quartal",
  "Wer arbeitet an Projekt Y und was ist der Status?",
  "Was sind die wichtigsten Risiken in meinem Brain?",
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
