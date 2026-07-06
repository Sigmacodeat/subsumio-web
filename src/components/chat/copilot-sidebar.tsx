"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  MessageSquareText,
  X,
  PanelRightClose,
  PanelRightOpen,
  Clock,
  Briefcase,
  CalendarClock,
  Search,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Circle,
  Loader2,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { useMediaQuery } from "@/lib/use-media-query";
import { useResizable } from "@/lib/use-resizable";
import { useLang, type TFunc } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/chat-panel";
import { CopilotNotifications } from "@/components/copilot/copilot-notifications";
import { CopilotMemoryPanel } from "@/components/copilot/copilot-memory-panel";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useMotionValue, useTransform } from "framer-motion";
import type { ChatContextType } from "@/components/chat/chat-types";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import { useRealtime } from "@/lib/realtime";
import { caseSlugFromDashboardPath } from "@/lib/matter-route-path";

interface CopilotSidebarProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

type PanelMode = "activity" | "chat";

interface RouteContext {
  type: ChatContextType;
  caseSlug?: string;
  pageSlug?: string;
  label: string;
  quickActions: QuickAction[];
}

interface QuickAction {
  label: string;
  query?: string;
  href?: string;
  icon: "case" | "deadline" | "research" | "draft" | "search" | "generic";
}

const QUICK_ACTION_ICONS: Record<QuickAction["icon"], typeof MessageSquareText> = {
  case: Briefcase,
  deadline: CalendarClock,
  research: Search,
  draft: FileText,
  search: Search,
  generic: ChevronRight,
};

const ROUTE_PATTERNS: Array<{
  pattern: RegExp;
  context: (match: RegExpMatchArray, t: TFunc, lang: Lang) => RouteContext;
}> = [
  {
    pattern: /^\/dashboard\/cases(?:\/(.+))?$/,
    context: (m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: m[1] ? "case" : "global",
        caseSlug: m[1] ? decodeURIComponent(m[1]) : undefined,
        label: m[1] ? `${t("copilot.ctx.case_prefix")} ${m[1]}` : t("copilot.ctx.cases"),
        quickActions: m[1]
          ? [
              {
                label: t("copilot.qa.case_deadlines"),
                query: isEn
                  ? `Which deadlines are open in case ${m[1]}?`
                  : `Welche Fristen sind in der Akte ${m[1]} offen?`,
                icon: "deadline",
              },
              {
                label: t("copilot.qa.case_summary"),
                query: isEn
                  ? `Summarize the current status of case ${m[1]}.`
                  : `Fasse den aktuellen Stand der Akte ${m[1]} zusammen.`,
                icon: "case",
              },
              {
                label: t("copilot.qa.case_missing_docs"),
                query: isEn
                  ? `Which documents are missing in case ${m[1]}?`
                  : `Welche Dokumente fehlen in der Akte ${m[1]}?`,
                icon: "search",
              },
            ]
          : [
              {
                label: t("copilot.qa.open_deadlines"),
                query: isEn
                  ? "Show me all open deadlines across all cases."
                  : "Zeige mir alle offenen Fristen über alle Akten.",
                icon: "deadline",
              },
              {
                label: t("copilot.qa.high_effort_cases"),
                query: isEn
                  ? "Which cases have the highest effort this quarter?"
                  : "Welche Akten haben den höchsten Aufwand in diesem Quartal?",
                icon: "case",
              },
            ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/deadlines$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.deadlines"),
        quickActions: [
          {
            label: t("copilot.qa.deadlines_this_week"),
            query: isEn
              ? "Which deadlines are due this week?"
              : "Welche Fristen fallen diese Woche an?",
            icon: "deadline",
          },
          {
            label: t("copilot.qa.deadlines_overdue"),
            query: isEn
              ? "Are there any overdue deadlines? Which are most critical?"
              : "Gibt es überfällige Fristen? Welche sind am kritischsten?",
            icon: "deadline",
          },
          {
            label: t("copilot.qa.deadline_export"),
            href: "/dashboard/calendar-export",
            icon: "generic",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/intake$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.intake"),
        quickActions: [
          {
            label: t("copilot.qa.intake_convert"),
            query: isEn
              ? "Which intake requests should be converted to cases next?"
              : "Welche Intake-Anfragen sollten als nächstes in Akten überführt werden?",
            icon: "case",
          },
          {
            label: t("copilot.qa.intake_missing_docs"),
            query: isEn
              ? "Which documents are missing in the open intake requests?"
              : "Welche Unterlagen fehlen in den offenen Intake-Anfragen?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/contacts$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.contacts"),
      quickActions: [
        {
          label: t("copilot.qa.contact_conflict"),
          href: "/dashboard/kollisionspruefung",
          icon: "generic",
        },
        {
          label: t("copilot.qa.contact_opponents"),
          href: "/dashboard/opponents",
          icon: "generic",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/bea$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.bea"),
        quickActions: [
          {
            label: t("copilot.qa.bea_deadlines"),
            query: isEn
              ? "Which beA incoming messages could trigger deadlines?"
              : "Welche beA-Eingänge können Fristen auslösen?",
            icon: "deadline",
          },
          {
            label: t("copilot.qa.bea_draft"),
            query: isEn
              ? "Draft a beA response based on the current case context."
              : "Entwirf eine beA-Antwort anhand des aktuellen Aktenkontexts.",
            icon: "draft",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/research$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.research"),
        quickActions: [
          {
            label: t("copilot.qa.research_bgb"),
            query: isEn
              ? "What's new in BGB case law?"
              : "Was gibt es Neues in der Rechtsprechung zum BGB?",
            icon: "research",
          },
          {
            label: t("copilot.qa.research_eugh"),
            query: isEn
              ? "Which CJEU rulings were published this week?"
              : "Welche EuGH-Urteile wurden diese Woche veröffentlicht?",
            icon: "research",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/vault$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.vault"),
      quickActions: [
        {
          label: t("copilot.qa.vault_review"),
          href: "/dashboard/tabular-review",
          icon: "generic",
        },
        {
          label: t("copilot.qa.vault_analyze"),
          href: "/dashboard/analyze",
          icon: "generic",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/drafting$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.drafting"),
        quickActions: [
          {
            label: t("copilot.qa.draft_klage"),
            query: isEn ? "Help me draft a lawsuit." : "Hilf mir, einen Klageentwurf zu verfassen.",
            icon: "draft",
          },
          {
            label: t("copilot.qa.draft_berufung"),
            query: isEn
              ? "How should I structure an appeal brief?"
              : "Wie strukturiere ich eine Berufungsbegründung?",
            icon: "draft",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/invoicing$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.invoicing"),
        quickActions: [
          {
            label: t("copilot.qa.rvg_calculate"),
            query: isEn
              ? "Calculate RVG fees for a dispute value of 10,000 EUR."
              : "Berechne RVG-Gebühren für einen Streitwert von 10.000 EUR.",
            icon: "generic",
          },
          {
            label: t("copilot.qa.datev_export"),
            href: "/dashboard/datev-export",
            icon: "generic",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/brain(?:\/(.+))?$/,
    context: (m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: m[1] ? "brain_page" : "global",
        pageSlug: m[1],
        label: m[1] ? `${t("copilot.ctx.page_prefix")} ${m[1]}` : t("copilot.ctx.brain"),
        quickActions: [
          {
            label: t("copilot.qa.brain_gaps"),
            query: isEn
              ? "What knowledge gaps exist in the database?"
              : "Welche Wissenslücken gibt es in der Datenbank?",
            icon: "search",
          },
          {
            label: t("copilot.qa.brain_updates"),
            query: isEn
              ? "What were the latest changes in the knowledge base?"
              : "Was wurden die letzten Änderungen in der Wissensdatenbank?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/contracts$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.contracts"),
        quickActions: [
          {
            label: t("copilot.qa.contract_analysis"),
            query: isEn
              ? "How do I analyze a contract for risks?"
              : "Wie analysiere ich einen Vertrag auf Risiken?",
            icon: "case",
          },
          {
            label: t("copilot.qa.clause_library"),
            href: "/dashboard/clause-library",
            icon: "generic",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/compliance$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.compliance"),
        quickActions: [
          {
            label: t("copilot.qa.gdpr_check"),
            query: isEn
              ? "What are the key GDPR compliance points for a law firm?"
              : "Was sind die wichtigsten DSGVO-Compliance-Punkte für eine Kanzlei?",
            icon: "research",
          },
          {
            label: t("copilot.qa.retention_periods"),
            href: "/dashboard/compliance/retention",
            icon: "generic",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/whatsapp$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.whatsapp"),
        quickActions: [
          {
            label: t("copilot.qa.whatsapp_intakes"),
            href: "/dashboard/intake",
            icon: "generic",
          },
          {
            label: t("copilot.qa.whatsapp_summarize"),
            query: isEn
              ? "Summarize the latest WhatsApp conversations and highlight action items."
              : "Fasse die neuesten WhatsApp-Konversationen zusammen und hebe Handlungsbedarf hervor.",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/documents$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.documents"),
        quickActions: [
          {
            label: t("copilot.qa.docs_unanalyzed"),
            query: isEn
              ? "Which documents haven't been analyzed yet?"
              : "Welche Dokumente wurden noch nicht analysiert?",
            icon: "search",
          },
          {
            label: t("copilot.qa.docs_upload"),
            href: "/dashboard/upload",
            icon: "generic",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/graph$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.graph"),
        quickActions: [
          {
            label: t("copilot.qa.graph_explain"),
            query: isEn
              ? "Explain the key entity relationships in the knowledge graph."
              : "Erkläre die wichtigsten Entitäts-Beziehungen im Knowledge Graph.",
            icon: "research",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/sources$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.sources"),
        quickActions: [
          {
            label: t("copilot.qa.sources_connected"),
            query: isEn
              ? "Which data sources are currently connected and what's their status?"
              : "Welche Datenquellen sind aktuell verbunden und wie ist ihr Status?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/approvals$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.approvals"),
        quickActions: [
          {
            label: t("copilot.qa.approvals_pending"),
            query: isEn
              ? "Show me all pending approvals that need my attention."
              : "Zeige mir alle offenen Freigaben, die meine Aufmerksamkeit erfordern.",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/document-requests$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.document_requests"),
        quickActions: [
          {
            label: t("copilot.qa.doc_requests_open"),
            query: isEn
              ? "Which document requests are still open and overdue?"
              : "Welche Dokumentenanforderungen sind noch offen oder überfällig?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/litigation$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.litigation"),
        quickActions: [
          {
            label: t("copilot.qa.litigation_active"),
            query: isEn
              ? "Show me all active litigation flows and their current phases."
              : "Zeige mir alle aktiven Litigation-Flows und ihre aktuellen Phasen.",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/review-sets$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.review_sets"),
        quickActions: [
          {
            label: t("copilot.qa.review_set_progress"),
            query: isEn
              ? "What's the progress of the active review sets?"
              : "Wie ist der Fortschritt der aktiven Review-Sets?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/trust-accounting$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.trust_accounting"),
        quickActions: [
          {
            label: t("copilot.qa.trust_balances"),
            query: isEn
              ? "Show me the current trust account balances and any pending reconciliations."
              : "Zeige mir die aktuellen Trust-Kontostände und ausstehende Abstimmungen.",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/litigation-analytics$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.litigation_analytics"),
        quickActions: [
          {
            label: t("copilot.qa.win_loss_stats"),
            query: isEn
              ? "Show me win/loss statistics across all cases by court and judge."
              : "Zeige mir Gewinn/Verlust-Statistiken über alle Akten nach Gericht und Richter.",
            icon: "research",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/directory$/,
    context: (_m, t, _lang) => ({
      type: "global",
      label: t("copilot.ctx.directory"),
      quickActions: [],
    }),
  },
  {
    pattern: /^\/dashboard\/settings/,
    context: (_m, t, _lang) => ({
      type: "global",
      label: t("copilot.ctx.settings"),
      quickActions: [],
    }),
  },
  {
    pattern: /^\/dashboard\/team$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.team"),
      quickActions: [],
    }),
  },
  {
    pattern: /^\/dashboard\/audit$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.audit"),
      quickActions: [],
    }),
  },
  {
    pattern: /^\/dashboard\/tax-returns$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.tax_returns"),
        quickActions: [
          {
            label: t("copilot.qa.tax_filing_status"),
            query: isEn
              ? "Which tax returns are still pending?"
              : "Welche Steuererklärungen sind noch offen?",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/tax-deadlines$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.tax_deadlines"),
        quickActions: [
          {
            label: t("copilot.qa.tax_deadlines_urgent"),
            query: isEn
              ? "Which tax deadlines are most urgent?"
              : "Welche Steuerfristen sind am dringendsten?",
            icon: "deadline",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/elster$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.elster"),
        quickActions: [
          {
            label: t("copilot.qa.elster_status"),
            query: isEn
              ? "What's the status of recent ELSTER submissions?"
              : "Was ist der Status der letzten ELSTER-Übermittlungen?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/tabular-review$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.tabular_review"),
        quickActions: [
          {
            label: t("copilot.qa.tabular_review_progress"),
            query: isEn
              ? "How far along is the tabular review?"
              : "Wie weit ist der tabellarische Review fortgeschritten?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/upload$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.upload"),
        quickActions: [
          {
            label: t("copilot.qa.upload_ocr"),
            query: isEn
              ? "Which uploaded documents haven't been OCR-processed yet?"
              : "Welche hochgeladenen Dokumente wurden noch nicht per OCR erfasst?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/translate$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.translate"),
        quickActions: [
          {
            label: t("copilot.qa.translate_help"),
            query: isEn
              ? "Help me translate a legal document."
              : "Hilf mir, ein juristisches Dokument zu übersetzen.",
            icon: "draft",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/anonymize$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.anonymize"),
        quickActions: [
          {
            label: t("copilot.qa.anonymize_help"),
            query: isEn
              ? "Which documents contain personal data that should be anonymized?"
              : "Welche Dokumente enthalten personenbezogene Daten, die anonymisiert werden sollten?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/case-scanner$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.case_scanner"),
        quickActions: [
          {
            label: t("copilot.qa.case_scanner_risks"),
            query: isEn
              ? "Which cases have the highest risks according to the scanner?"
              : "Welche Akten haben die höchsten Risiken laut Scanner?",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/process-strategy$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.process_strategy"),
        quickActions: [
          {
            label: t("copilot.qa.strategy_recommend"),
            query: isEn
              ? "Recommend a litigation strategy for the current case."
              : "Empfiehl eine Prozessstrategie für den aktuellen Fall.",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/controlling$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.controlling"),
        quickActions: [
          {
            label: t("copilot.qa.controlling_kpi"),
            query: isEn
              ? "Show me the key KPIs for this quarter."
              : "Zeige mir die wichtigsten KPIs für dieses Quartal.",
            icon: "research",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/workflows$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.workflows"),
        quickActions: [
          {
            label: t("copilot.qa.workflows_active"),
            query: isEn
              ? "Which workflows are currently active and where are bottlenecks?"
              : "Welche Workflows sind aktuell aktiv und wo gibt es Engpässe?",
            icon: "case",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/monitoring$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.monitoring"),
        quickActions: [
          {
            label: t("copilot.qa.monitoring_alerts"),
            query: isEn
              ? "Are there any current system alerts or anomalies?"
              : "Gibt es aktuelle System-Warnungen oder Anomalien?",
            icon: "search",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/calendar$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.calendar"),
        quickActions: [
          {
            label: t("copilot.qa.calendar_this_week"),
            query: isEn
              ? "What deadlines and appointments are scheduled this week?"
              : "Welche Fristen und Termine stehen diese Woche an?",
            icon: "deadline",
          },
          {
            label: t("copilot.qa.calendar_overdue"),
            query: isEn
              ? "Are there any overdue deadlines in the calendar?"
              : "Gibt es überfällige Fristen im Kalender?",
            icon: "deadline",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/tasks$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.tasks"),
        quickActions: [
          {
            label: t("copilot.qa.tasks_open"),
            query: isEn
              ? "Show me all open tasks across all cases."
              : "Zeige mir alle offenen Aufgaben über alle Akten.",
            icon: "case",
          },
          {
            label: t("copilot.qa.tasks_due_soon"),
            query: isEn
              ? "Which tasks are due in the next 3 days?"
              : "Welche Aufgaben sind in den nächsten 3 Tagen fällig?",
            icon: "deadline",
          },
        ],
      };
    },
  },
  {
    pattern: /^\/dashboard\/time-tracking$/,
    context: (_m, t, lang) => {
      const isEn = lang === "en";
      return {
        type: "global",
        label: t("copilot.ctx.time_tracking"),
        quickActions: [
          {
            label: t("copilot.qa.time_unbilled"),
            query: isEn
              ? "How many hours are still unbilled?"
              : "Wie viele Stunden sind noch nicht abgerechnet?",
            icon: "case",
          },
          {
            label: t("copilot.qa.time_this_week"),
            query: isEn
              ? "How many hours have I recorded this week?"
              : "Wie viele Stunden habe ich diese Woche erfasst?",
            icon: "case",
          },
        ],
      };
    },
  },
];

interface ActivityItem {
  slug: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
}

function ActivityFeedPanel({ lang }: { lang: Lang }) {
  const { t } = useLang();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await csrfFetch("/api/pages?type=agent_action&limit=20");
      if (!res.ok) return;
      const data = await res.json();
      const pages: ActivityItem[] = (data.pages ?? []).map((p: Record<string, unknown>) => ({
        slug: String(p.slug ?? ""),
        title: String(p.title ?? p.type ?? "—"),
        type: String(p.type ?? ""),
        status: String((p.frontmatter as Record<string, unknown>)?.status ?? "pending"),
        created_at: String(p.created_at ?? new Date().toISOString()),
      }));
      setItems(pages);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await fetchItems();
    })();
    const interval = setInterval(() => {
      if (!cancelled) void fetchItems();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchItems]);

  // ── Realtime: refresh on workflow/case events ──
  useRealtime("workflow.started", () => void fetchItems());
  useRealtime("workflow.step_changed", () => void fetchItems());
  useRealtime("workflow.completed", () => void fetchItems());
  useRealtime("workflow.failed", () => void fetchItems());
  useRealtime("case.updated", () => void fetchItems());

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-[color:var(--ds-text-subtle)]">
        <Loader2 size={13} className="animate-spin" />
        {t("copilot.loading")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-3.5 py-4 text-[13px] text-[color:var(--ds-text-muted)]">
        {t("copilot.activity_empty")}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-1 px-3.5 py-3">
        {items.map((item) => {
          const status = item.status.toLowerCase();
          const isDone = ["done", "completed", "approved", "signed", "fulfilled"].includes(status);
          const isRunning = [
            "processing",
            "running",
            "pending",
            "in_progress",
            "uploaded",
            "ocr_processing",
          ].includes(status);
          const Icon = isDone ? CheckSquare : isRunning ? Loader2 : Circle;
          const iconClass = isDone
            ? "text-[color:var(--ds-success-text)]"
            : isRunning
              ? "text-[color:var(--brand-primary)]"
              : "text-[color:var(--ds-text-subtle)]";
          return (
            <div key={item.slug} className="flex items-center gap-2.5 py-1.5 text-[13px]">
              <Icon
                size={14}
                className={`shrink-0 ${iconClass} ${isRunning ? "animate-spin" : ""}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text)]">
                {item.title}
              </span>
              <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                {new Date(item.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function resolveRouteContext(pathname: string, t: TFunc, lang: Lang): RouteContext {
  const isEn = lang === "en";
  for (const { pattern, context } of ROUTE_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) return context(match, t, lang);
  }
  return {
    type: "global",
    label: t("copilot.ctx.dashboard"),
    quickActions: [
      {
        label: t("copilot.qa.case_overview"),
        query: isEn
          ? "Give me an overview of all active cases."
          : "Gib mir eine Übersicht über alle aktiven Akten.",
        icon: "case",
      },
      {
        label: t("copilot.qa.open_deadlines_urgent"),
        query: isEn
          ? "Which deadlines are most urgent right now?"
          : "Welche Fristen sind aktuell am dringendsten?",
        icon: "deadline",
      },
      {
        label: t("copilot.qa.firm_stats"),
        query: isEn
          ? "How is the firm performing this quarter?"
          : "Wie performt die Kanzlei in diesem Quartal?",
        icon: "search",
      },
    ],
  };
}

// ── Matter Context Card ──────────────────────────────────────────────

interface MatterContextInfo {
  title: string;
  caseNumber: string;
  status: string;
  openDeadlines: number;
  totalDeadlines: number;
  openTasks: number;
  totalTasks: number;
  documentCount: number;
  nextDeadlineDate?: string;
}

function MatterContextCard({ info, lang }: { info: MatterContextInfo; lang: Lang }) {
  const { t } = useLang();
  const isEn = lang === "en";
  return (
    <div className="shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)]">
          <Briefcase size={12} className="text-[color:var(--brand-primary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-tight font-medium text-[color:var(--ds-text)]">
            {info.title}
          </div>
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
            <span className="font-mono">{info.caseNumber}</span>
            <span className="h-3 w-px bg-[color:var(--ds-border)]" />
            <span className="tabular-nums">
              {info.openDeadlines}/{info.totalDeadlines} {t("copilot.matter_deadlines")}
            </span>
            <span className="tabular-nums">
              {info.openTasks}/{info.totalTasks} {t("copilot.matter_tasks")}
            </span>
          </div>
        </div>
        {info.nextDeadlineDate && (
          <div className="shrink-0 rounded-md bg-[color:var(--ds-warning-bg)] px-2 py-1 text-xs font-medium text-[color:var(--ds-warning-text)]">
            {new Date(info.nextDeadlineDate).toLocaleDateString(isEn ? "en-GB" : "de-DE", {
              day: "2-digit",
              month: "short",
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface ProactiveAlertsProps {
  alerts: Array<{ label: string; query: string; severity: "urgent" | "warning" }>;
  onQuery: (query: string) => void;
  onDismiss: (key: string) => void;
  t: TFunc;
  className?: string;
}

function ProactiveAlerts({ alerts, onQuery, onDismiss, t, className }: ProactiveAlertsProps) {
  if (alerts.length === 0) return null;
  return (
    <div className={cn("shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2", className)}>
      <div className="space-y-1">
        {alerts.map((alert) => {
          const alertKey = `${alert.label}-${alert.query}`;
          return (
            <button
              key={alertKey}
              onClick={() => onQuery(alert.query)}
              className={cn(
                "group/alert flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-[background-color,border-color] duration-200 ease-[var(--ds-ease-smooth)]",
                alert.severity === "urgent"
                  ? "border-l-2 border-l-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg-hover)]"
                  : "border-l-2 border-l-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] hover:bg-[color:var(--ds-warning-bg-hover)]"
              )}
            >
              <Clock size={11} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{alert.label}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(alertKey);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/alert:opacity-100 hover:bg-[color:var(--ds-hover)]"
                aria-label={t("copilot.dismiss_hint")}
                role="button"
                tabIndex={0}
              >
                <X size={10} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface QuickActionsChipsProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  t: TFunc;
  variant?: "mobile" | "desktop";
}

function QuickActionsChips({
  actions,
  onAction,
  expanded,
  onToggleExpanded,
  t,
  variant = "desktop",
}: QuickActionsChipsProps) {
  if (actions.length === 0) return null;
  const visibleActions = expanded ? actions : actions.slice(0, 4);
  const isDesktop = variant === "desktop";
  return (
    <div
      className={cn(
        "shrink-0 border-b border-[color:var(--ds-border)]",
        isDesktop ? "px-3 py-2" : "px-3 py-2"
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleActions.map((action) => {
          const Icon = QUICK_ACTION_ICONS[action.icon];
          return (
            <button
              key={action.label}
              onClick={() => onAction(action)}
              className="group/action inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-left text-xs text-[color:var(--ds-text-subtle)] transition-[border-color,background-color,color] duration-200 ease-[var(--ds-ease-smooth)] hover:border-[var(--brand-primary)]/40 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-1 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              <Icon
                size={11}
                className="shrink-0 text-[color:var(--ds-text-subtle)] transition-colors group-hover/action:text-[color:var(--brand-primary)]"
              />
              <span className="max-w-[110px] truncate">{action.label}</span>
            </button>
          );
        })}
        {actions.length > 4 && (
          <button
            onClick={onToggleExpanded}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-[color,background-color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            aria-expanded={expanded}
            aria-label={expanded ? t("copilot.show_less_aria") : t("copilot.show_more_aria")}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? t("copilot.show_less") : `+${actions.length - 4}`}
          </button>
        )}
      </div>
    </div>
  );
}

export function CopilotSidebar({ open, onToggle, className }: CopilotSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  // "Compact" mode renders the Copilot as an overlay drawer instead of a docked
  // side panel. Applies below lg (1024px) so the panel never squeezes the main
  // content on tablet / split-screen widths (kept named isMobile to avoid churn).
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { t, lang } = useLang();
  const { reduceMotion, panelTransition, tapTransition: softTransition } = useDashboardMotion();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const quickActionNavRef = useRef(false);
  const onToggleRef = useRef(onToggle);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Swipe-to-close: track horizontal drag progress (0 = open, 1 = fully swiped away)
  const swipeX = useMotionValue(0);
  const swipeOpacity = useTransform(swipeX, [0, 0.5, 1], [1, 0.6, 0]);
  const swipeScale = useTransform(swipeX, [0, 1], [1, 0.96]);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [panelMode, setPanelMode] = useState<PanelMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("copilot-panel-mode");
      if (saved === "chat" || saved === "activity") return saved;
    }
    return "chat";
  });
  const [matterContextInfo, setMatterContextInfo] = useState<MatterContextInfo | null>(null);

  // Keep onToggle ref current to avoid stale closure in route-change effect
  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  // Persist panel mode preference
  useEffect(() => {
    localStorage.setItem("copilot-panel-mode", panelMode);
  }, [panelMode]);

  // Fetch matter context info when on a matter page
  useEffect(() => {
    if (!pathname?.startsWith("/dashboard/cases/")) {
      setMatterContextInfo(null);
      return;
    }
    const slug = caseSlugFromDashboardPath(pathname);
    if (!slug) {
      setMatterContextInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const page = await api.brain.getPage(slug);
        if (cancelled || !page) return;
        const fm = caseFrontmatter(page);
        const deadlines = fm.deadlines || [];
        const tasks = fm.tasks || [];
        const documents = fm.documents || [];
        const openDeadlines = deadlines.filter((d) => d.status !== "done");
        const openTasks = tasks.filter((t) => !t.done);
        const nextDeadline = openDeadlines
          .map((d) => d.due_date || "")
          .filter(Boolean)
          .sort()[0];
        setMatterContextInfo({
          title: page.title || slug,
          caseNumber: fm.case_number || slug,
          status: fm.status || "open",
          openDeadlines: openDeadlines.length,
          totalDeadlines: deadlines.length,
          openTasks: openTasks.length,
          totalTasks: tasks.length,
          documentCount: documents.length,
          nextDeadlineDate: nextDeadline || undefined,
        });
      } catch {
        if (!cancelled) setMatterContextInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const {
    width: panelWidth,
    isResizing,
    handleMouseDown: handleResizeStart,
    setWidth: setPanelWidth,
  } = useResizable({
    minWidth: 280,
    maxWidth: 560,
    initialWidth: typeof window !== "undefined" && window.innerWidth < 1024 ? 300 : 360,
    storageKey: "subsumio-copilot-width",
    side: "right",
  });

  // Re-evaluate panel width on orientation change (portrait ↔ landscape)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOrientationChange = () => {
      const maxW = window.innerWidth < 1024 ? 300 : 360;
      setPanelWidth((w) => {
        if (w <= maxW) return w;
        return Math.min(w, maxW);
      });
    };
    window.addEventListener("orientationchange", handleOrientationChange);
    return () => window.removeEventListener("orientationchange", handleOrientationChange);
  }, [setPanelWidth]);

  // Sync `open` prop with mobile drawer — when toggled on mobile, open the drawer
  useEffect(() => {
    if (open && isMobile) {
      setMobileOpen(true);
    } else if (!open) {
      setMobileOpen(false);
    }
  }, [open, isMobile]);

  // Reset swipe progress when drawer closes
  useEffect(() => {
    if (!mobileOpen) swipeX.set(0);
  }, [mobileOpen, swipeX]);

  // Close mobile drawer on route change — but not if a quick action triggered the navigation
  useEffect(() => {
    if (quickActionNavRef.current) {
      quickActionNavRef.current = false;
      return;
    }
    setMobileOpen(false);
    if (open && isMobile) {
      onToggleRef.current();
    }
  }, [pathname, open, isMobile]);

  // ── G6: Proactive Suggestions — fetch from /api/notifications (unified) ──
  const [proactiveAlerts, setProactiveAlerts] = useState<
    Array<{ label: string; query: string; severity: "urgent" | "warning" }>
  >([]);
  const alertsCacheRef = useRef<{ data: typeof proactiveAlerts; ts: number } | null>(null);
  const ALERTS_TTL_MS = 60_000;

  useEffect(() => {
    if (!open && !mobileOpen) return;
    let cancelled = false;

    // Use cached alerts if fresh
    if (alertsCacheRef.current && Date.now() - alertsCacheRef.current.ts < ALERTS_TTL_MS) {
      setProactiveAlerts(alertsCacheRef.current.data);
      return;
    }

    (async () => {
      try {
        const res = await csrfFetch("/api/notifications?unread=true&limit=10");
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const notifs: Array<{
          id: string;
          type: string;
          data: Record<string, unknown>;
          createdAt: string;
        }> = data.notifications ?? [];

        // Filter for deadline-related notifications
        const deadlineNotifs = notifs.filter(
          (n) =>
            n.type === "deadline" || n.type === "deadline_alert" || n.type === "deadline_overdue"
        );

        if (deadlineNotifs.length === 0) {
          setProactiveAlerts([]);
          alertsCacheRef.current = { data: [], ts: Date.now() };
          return;
        }

        const alerts = deadlineNotifs.slice(0, 3).map((n) => {
          const isOverdue =
            n.type === "deadline_overdue" ||
            (n.data?.daysRemaining !== undefined && (n.data.daysRemaining as number) < 0);
          const title =
            (n.data?.title as string) ??
            (n.data?.caseTitle as string) ??
            t("copilot.alert.deadline");
          const days = n.data?.daysRemaining as number | undefined;

          const isEn = lang === "en";
          return {
            label: isOverdue
              ? `${t("copilot.alert.overdue_prefix")} ${title}${days !== undefined ? ` (${Math.abs(days)}${isEn ? "d" : "T"})` : ""}`
              : `${t("copilot.alert.deadline_prefix")} ${title}${days !== undefined ? ` (in ${days}${isEn ? "d" : "T"})` : ""}`,
            query: isOverdue
              ? isEn
                ? `The deadline "${title}" is overdue. What do I need to do?`
                : `Die Frist "${title}" ist überfällig. Was muss ich tun?`
              : isEn
                ? `What are the details for deadline "${title}"?`
                : `Welche Details gibt es zur Frist "${title}"?`,
            severity: isOverdue ? ("urgent" as const) : ("warning" as const),
          };
        });
        setProactiveAlerts(alerts);
        alertsCacheRef.current = { data: alerts, ts: Date.now() };
      } catch {
        // Non-blocking — proactive alerts are nice-to-have
        setProactiveAlerts([]);
        alertsCacheRef.current = { data: [], ts: Date.now() };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, mobileOpen, pathname, t, lang]);

  const routeContext = useMemo(() => resolveRouteContext(pathname, t, lang), [pathname, t, lang]);

  // Keyboard shortcut: Cmd+J toggles on desktop and switches to chat mode, opens on mobile
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (!isMobile) {
          if (!open) {
            onToggle();
          }
          setPanelMode("chat");
        } else {
          setMobileOpen((v) => !v);
          onToggle();
          setPanelMode("chat");
        }
      }
      if (e.key === "Escape") {
        if (mobileOpen) {
          setMobileOpen(false);
          if (open) onToggle();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onToggle, mobileOpen, isMobile, open]);

  // Blur active element when desktop sidebar closes — prevents focus from
  // remaining inside an inert/aria-hidden subtree (WAI-ARIA violation).
  useEffect(() => {
    if (!open && !isMobile) {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest("[inert]")) {
        active.blur();
      }
    }
  }, [open, isMobile]);

  // Focus management for mobile drawer
  const prevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (mobileOpen) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    }
  }, [mobileOpen]);

  // Focus trap within mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    function handleTabKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleTabKey);
    return () => {
      document.removeEventListener("keydown", handleTabKey);
    };
  }, [mobileOpen]);

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.href) {
        quickActionNavRef.current = true;
        router.push(action.href);
      } else if (action.query) {
        chatRef.current?.sendMessage(action.query);
      }
    },
    [router]
  );

  // Panel → fullscreen handoff: carry the running session into /dashboard/chat
  const handleOpenFullscreen = useCallback(() => {
    const sessionId = chatRef.current?.getActiveSessionId();
    router.push(
      sessionId ? `/dashboard/chat?session=${encodeURIComponent(sessionId)}` : "/dashboard/chat"
    );
  }, [router]);

  const handleDismissAlert = useCallback((alertKey: string) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(alertKey);
      return next;
    });
  }, []);

  const visibleAlerts = useMemo(
    () => proactiveAlerts.filter((a) => !dismissedAlerts.has(`${a.label}-${a.query}`)),
    [proactiveAlerts, dismissedAlerts]
  );
  return (
    <>
      {/* Mobile overlay */}
      <motion.div
        initial={false}
        animate={{
          opacity: mobileOpen ? 1 : 0,
          backdropFilter: mobileOpen && !reduceMotion ? "blur(8px)" : "blur(0px)",
        }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed inset-0 z-50 bg-black/30 lg:hidden",
          mobileOpen ? "" : "pointer-events-none"
        )}
        onClick={() => {
          setMobileOpen(false);
          if (open) onToggle();
        }}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <motion.div
        ref={drawerRef}
        initial={false}
        animate={{ x: mobileOpen ? 0 : "100%" }}
        transition={panelTransition}
        drag={mobileOpen && !reduceMotion ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        onDrag={(_, info) => {
          const drawerWidth = drawerRef.current?.offsetWidth ?? 390;
          swipeX.set(Math.max(0, Math.min(1, info.offset.x / drawerWidth)));
        }}
        onDragEnd={(_, info) => {
          swipeX.set(0);
          if (info.offset.x > 120 || info.velocity.x > 500) {
            setMobileOpen(false);
            if (open) onToggle();
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              navigator.vibrate(8);
            }
          }
        }}
        style={
          mobileOpen && !reduceMotion ? { opacity: swipeOpacity, scale: swipeScale } : undefined
        }
        className="fixed top-0 right-0 z-50 h-full w-full max-w-md will-change-transform lg:hidden"
        role="dialog"
        aria-label={t("copilot.title")}
        aria-modal={mobileOpen ? "true" : undefined}
        {...(!mobileOpen ? { inert: true } : {})}
      >
        <div className="flex h-full flex-col bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] pb-[calc(3.75rem+env(safe-area-inset-bottom))] shadow-2xl">
          {/* Swipe handle — visual affordance for swipe-to-close */}
          {mobileOpen && !reduceMotion && (
            <div
              className="absolute top-1/2 left-0 z-10 flex h-12 w-1.5 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-r-full bg-[color:var(--ds-border-strong)] opacity-40"
              aria-hidden="true"
            />
          )}
          {/* Mobile header bar — compact single-row */}
          <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPanelMode("chat")}
                className={cn(
                  "flex items-center gap-1.5 rounded-l-md px-2 py-1 text-xs font-medium transition-all",
                  panelMode === "chat"
                    ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
                aria-label={t("copilot.tab_chat")}
              >
                <MessageSquareText size={13} />
                {t("copilot.tab_chat")}
              </button>
              <button
                onClick={() => setPanelMode("activity")}
                className={cn(
                  "flex items-center gap-1.5 rounded-r-md px-2 py-1 text-xs font-medium transition-all",
                  panelMode === "activity"
                    ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
                aria-label={t("copilot.tab_activity")}
              >
                <Activity size={13} />
                {t("copilot.tab_activity")}
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleOpenFullscreen}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("copilot.open_fullscreen")}
                title={t("copilot.open_fullscreen")}
              >
                <Maximize2 size={14} />
              </button>
              <button
                ref={closeButtonRef}
                onClick={() => {
                  setMobileOpen(false);
                  onToggle();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("copilot.close_esc")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Matter context card — mobile */}
          {matterContextInfo && <MatterContextCard info={matterContextInfo} lang={lang} />}

          {/* Proactive deadline alerts (G6) — mobile */}
          <ProactiveAlerts
            alerts={visibleAlerts}
            onQuery={(q) => {
              setPanelMode("chat");
              chatRef.current?.sendMessage(q);
            }}
            onDismiss={handleDismissAlert}
            t={t}
          />

          {/* Quick actions — mobile */}
          <QuickActionsChips
            actions={routeContext.quickActions}
            onAction={(action) => {
              if (action.query) setPanelMode("chat");
              handleQuickAction(action);
            }}
            expanded={actionsExpanded}
            onToggleExpanded={() => setActionsExpanded((v) => !v)}
            t={t}
            variant="mobile"
          />

          {/* Activity feed or Chat — mobile */}
          {panelMode === "activity" ? (
            <ActivityFeedPanel lang={lang} />
          ) : (
            isMobile && (
              <ChatPanel
                ref={chatRef}
                context={{
                  type: routeContext.type,
                  caseSlug: routeContext.caseSlug,
                  pageSlug: routeContext.pageSlug,
                }}
                className="h-full rounded-none border-0"
                placeholder={
                  routeContext.caseSlug ? t("chat.placeholder_case") : t("chat.placeholder_global")
                }
              />
            )
          )}
        </div>
      </motion.div>

      {/* ── Desktop: Persistent collapsible side panel ── */}
      <motion.aside
        data-tour="copilot-panel"
        initial={false}
        animate={{
          width: open ? panelWidth : 0,
          opacity: open ? 1 : 0,
        }}
        transition={panelTransition}
        className={cn(
          "dashboard-panel-surface fixed inset-y-0 right-0 z-40 hidden min-w-0 overflow-hidden border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] lg:relative lg:inset-auto lg:block lg:shrink-0",
          isResizing ? "transition-none" : "will-change-[width,opacity]",
          className
        )}
        aria-label={t("copilot.title")}
        {...(!open ? { inert: true } : {})}
      >
        {/* Resize handle — drag to resize panel width */}
        {open && (
          <div
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setPanelWidth((w) => {
                  const nw = Math.max(280, w - 24);
                  try {
                    localStorage.setItem("subsumio-copilot-width", String(nw));
                  } catch {}
                  return nw;
                });
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setPanelWidth((w) => {
                  const nw = Math.min(600, w + 24);
                  try {
                    localStorage.setItem("subsumio-copilot-width", String(nw));
                  } catch {}
                  return nw;
                });
              }
            }}
            className={cn(
              "absolute top-0 left-0 z-40 h-full w-1.5 cursor-col-resize transition-[width,background-color] duration-150 select-none focus-visible:bg-[var(--brand-primary)] focus-visible:outline-none",
              isResizing
                ? "w-2 bg-[var(--brand-primary)]"
                : "bg-transparent hover:w-2 hover:bg-[color:var(--ds-border-strong)]"
            )}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("copilot.resize")}
            tabIndex={0}
            aria-valuenow={panelWidth}
            aria-valuemin={280}
            aria-valuemax={600}
          />
        )}
        {/* Inner wrapper — fixed width matches panel, never reflows. Only outer aside clips. */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0.92 }}
          transition={softTransition}
          className={cn(
            "flex h-full flex-col",
            isResizing ? "transition-none" : "will-change-opacity"
          )}
          style={{ width: panelWidth }}
        >
          {/* Collapse toggle — premium vertical tab */}
          <button
            onClick={onToggle}
            className={cn(
              "group absolute top-1/2 -left-6 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-sm transition-[width,background-color,opacity] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-smooth)] hover:w-7 hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none",
              !open && "pointer-events-none opacity-0"
            )}
            aria-label={t("copilot.collapse")}
            title={t("copilot.collapse")}
          >
            <PanelRightClose
              size={12}
              className="text-[color:var(--ds-text-muted)] transition-colors group-hover:text-[color:var(--ds-text)]"
            />
          </button>

          {/* Panel content — stays mounted during transition for smooth animation */}
          <motion.div
            initial={false}
            animate={{
              opacity: open ? 1 : 0,
              x: open ? 0 : 12,
            }}
            transition={softTransition}
            className={cn(
              "flex h-full min-w-0 flex-col overflow-hidden",
              open ? "" : "pointer-events-none"
            )}
            {...(!open ? { inert: true } : {})}
          >
            {/* Context header — compact single-row */}
            <div className="relative shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPanelMode("chat")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-l-md px-2 py-1 text-xs font-medium transition-all",
                      panelMode === "chat"
                        ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                        : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    )}
                    aria-label={t("copilot.tab_chat")}
                  >
                    <MessageSquareText size={12} />
                    {t("copilot.tab_chat")}
                  </button>
                  <button
                    onClick={() => setPanelMode("activity")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-r-md px-2 py-1 text-xs font-medium transition-all",
                      panelMode === "activity"
                        ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                        : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    )}
                    aria-label={t("copilot.tab_activity")}
                  >
                    <Activity size={12} />
                    {t("copilot.tab_activity")}
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={handleOpenFullscreen}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    aria-label={t("copilot.open_fullscreen")}
                    title={t("copilot.open_fullscreen")}
                  >
                    <Maximize2 size={13} />
                  </button>
                  <button
                    onClick={onToggle}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    aria-label={t("copilot.close_panel")}
                    title={t("copilot.close_panel")}
                  >
                    <PanelRightClose size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Matter context card — desktop */}
            {matterContextInfo && <MatterContextCard info={matterContextInfo} lang={lang} />}

            {/* Proactive deadline alerts (G6) */}
            <ProactiveAlerts
              alerts={visibleAlerts}
              onQuery={(q) => {
                setPanelMode("chat");
                chatRef.current?.sendMessage(q);
              }}
              onDismiss={handleDismissAlert}
              t={t}
            />

            {/* Quick actions — contextual icon chips */}
            <QuickActionsChips
              actions={routeContext.quickActions}
              onAction={(action) => {
                if (action.query) setPanelMode("chat");
                handleQuickAction(action);
              }}
              expanded={actionsExpanded}
              onToggleExpanded={() => setActionsExpanded((v) => !v)}
              t={t}
              variant="desktop"
            />

            {/* Activity feed or Chat panel — desktop */}
            {panelMode === "activity" ? (
              <ActivityFeedPanel lang={lang} />
            ) : (
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                {!isMobile && (
                  <>
                    <div className="border-b border-[color:var(--ds-border)] px-3 py-2">
                      <CopilotNotifications />
                    </div>
                    <div className="border-b border-[color:var(--ds-border)] px-3 py-2">
                      <CopilotMemoryPanel />
                    </div>
                    <ChatPanel
                      ref={chatRef}
                      context={{
                        type: routeContext.type,
                        caseSlug: routeContext.caseSlug,
                        pageSlug: routeContext.pageSlug,
                      }}
                      className="h-full rounded-none border-0"
                      placeholder={
                        routeContext.caseSlug
                          ? t("chat.placeholder_case")
                          : t("chat.placeholder_global")
                      }
                    />
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      </motion.aside>

      {/* Desktop expand button — premium vertical tab with hover label */}
      <motion.button
        onClick={onToggle}
        initial={false}
        animate={{
          x: open ? panelWidth + 20 : 0,
          opacity: open ? 0 : 1,
          scale: open ? 0.96 : 1,
        }}
        whileHover={reduceMotion || open ? undefined : { x: -2, scale: 1.015 }}
        whileTap={reduceMotion || open ? undefined : { scale: 0.965 }}
        transition={softTransition}
        className={cn(
          "group fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-4 pr-2 pl-2.5 shadow-md transition-[padding,box-shadow] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-panel)] hover:pl-3 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none lg:flex",
          open && "pointer-events-none"
        )}
        aria-label={t("copilot.expand")}
        title={t("copilot.expand_hint")}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
      >
        <PanelRightOpen
          size={16}
          className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-muted)] transition-colors"
        />
        <span className="max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap text-[color:var(--ds-text-muted)] opacity-0 transition-[max-width,opacity,color] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)] group-hover:max-w-[100px] group-hover:text-[color:var(--ds-text)] group-hover:opacity-100">
          {t("copilot.copilot")}
        </span>
      </motion.button>
    </>
  );
}
