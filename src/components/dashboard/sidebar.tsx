"use client";

import { useState, useMemo, useEffect, useCallback, forwardRef, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Brain,
  BookOpen,
  BookMarked,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
  Bell,
  User,
  Users,
  CreditCard,
  X,
  Briefcase,
  CalendarClock,
  Clock,
  Landmark,
  Banknote,
  Plug,
  PenTool,
  UserCircle,
  ShieldCheck,
  FileSpreadsheet,
  ScrollText,
  FileSignature,
  FileSliders,
  EyeOff,
  Gavel,
  CloudOff,
  FolderOpen,
  MessageSquareText,
  Search,
  ClipboardList,
  FileSearch,
  Inbox,
  FileClock,
  Award,
  Bot,
  Receipt,
  FileUp,
  UserCog,
  Scale,
  FileCheck,
  Library,
  MessageCircle,
  Network,
  Calculator,
  Database,
  GitCompare,
  Share2,
  TrendingUp,
  Send,
  FileQuestion,
  ShieldX,
  Hammer,
  FileCode,
  Gauge,
  FileLock,
  FolderSearch,
  ScanSearch,
  MailOpen,
  FileArchive,
  ListChecks,
  CheckSquare,
  ListTodo,
  FileCheck2,
  Download,
  FileBarChart,
  BadgeCheck,
  FlaskConical,
  RefreshCw,
  GraduationCap,
  Grid3x3,
  ChartNoAxesColumn,
  SearchCheck,
  Cpu,
  Smartphone,
  ServerCog,
  MessagesSquare,
  Mailbox,
  CalendarSync,
  ShieldAlert,
  Layers,
  LayoutGrid,
  Languages,
  Mic,
  CalendarOff,
  Fingerprint,
  Lightbulb,
  Wallet,
  Calendar,
  Palette,
  Flag,
  Shield,
  Filter,
  Radar,
  Activity,
  Server,
  LogOut,
  FileText,
  ChevronsDownUp,
  BrainCog,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutationQueue } from "@/lib/use-mutation";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { useNetworkStatus } from "@/lib/use-offline-sync";
import { useLang } from "@/lib/use-lang";
import { useIsDesktop } from "@/lib/use-media-query";
import type { DashboardKey } from "@/content/dashboard";
import { MatterSidebarSection } from "@/components/dashboard/matter-sidebar-section";
import { SidebarQuickAccess } from "@/components/dashboard/sidebar-quick-access";
import { useSidebarBadges, type SidebarBadges } from "@/lib/queries/sidebar-badges";
import { useReviewInboxRealtime } from "@/lib/queries/review-inbox-realtime";
import { useResizable } from "@/lib/use-resizable";
import { useLogout } from "@/lib/queries/auth";

export type NavTier = "free" | "pro" | "enterprise" | "admin";
export type AudienceTier = "quick-start" | "erweitert" | "dach-integration" | "system";

const PLAN_RANK: Record<NavTier, number> = { free: 0, pro: 1, enterprise: 2, admin: 3 };

const CORE_SECTION_KEYS: DashboardKey[] = [
  "nav.section.clients_comm",
  "nav.section.schedule",
  "nav.section.docs_drafting",
];

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: DashboardKey;
  comingSoon?: boolean;
  keywords?: string;
  tier?: NavTier;
  audienceTier?: AudienceTier;
  tooltipKey?: DashboardKey;
};
type NavSection = {
  titleKey: DashboardKey;
  descKey?: DashboardKey;
  items: NavItem[];
  colorVar?: string;
};

// Workflow-ordered sidebar with all items grouped into collapsible sections.
// Primary items (overview, cases, deadlines, intake, chat) are always visible.
// Section items expand on click. Search filters across all items.
export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.clients_comm",
    descKey: "nav.section.desc.clients_comm",
    colorVar: "--nav-cat-cases",
    items: [
      {
        href: "/dashboard/search",
        icon: Search,
        labelKey: "nav.search",
        keywords: "suche search fulltext volltext filter scope",
        tooltipKey: "nav.tooltip.search",
      },
      {
        href: "/dashboard/contacts",
        icon: Users,
        labelKey: "nav.contacts",
        keywords: "mandanten klienten parteien clients",
        tooltipKey: "nav.tooltip.contacts",
      },
      {
        href: "/dashboard/opponents",
        icon: Scale,
        labelKey: "nav.opponents",
        keywords: "gegner processgegner opposite party",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.opponents",
      },
      {
        href: "/dashboard/kollisionspruefung",
        icon: ShieldX,
        labelKey: "nav.kollisionspruefung",
        keywords: "conflict check konflikt conflict search",
      },
      {
        href: "/dashboard/case-search",
        icon: Filter,
        labelKey: "nav.case_search",
        keywords: "case search faceted filter akten suche filter rechtsgebiet status priorität",
        tooltipKey: "nav.tooltip.case_search",
      },
      {
        href: "/dashboard/client-portal",
        icon: UserCircle,
        labelKey: "nav.client_portal",
        keywords: "mandantenportal portal client access",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/document-requests",
        icon: FileClock,
        labelKey: "nav.document_requests",
        keywords: "dokumentenanforderung unterlagen documents request",
      },
      {
        href: "/dashboard/bea",
        icon: Send,
        labelKey: "nav.bea",
        keywords: "bea elektronischer anwaltlicher austausch e-filing court",
        tooltipKey: "nav.tooltip.bea",
        audienceTier: "dach-integration",
      },
      {
        href: "/dashboard/communications",
        icon: Mailbox,
        labelKey: "nav.communications",
        keywords: "kommunikation inbox messages unified bea whatsapp email portal",
        tooltipKey: "nav.tooltip.communications",
      },
    ],
  },
  {
    titleKey: "nav.section.schedule",
    descKey: "nav.section.desc.schedule",
    colorVar: "--nav-cat-cases",
    items: [
      {
        href: "/dashboard/calendar",
        icon: CalendarClock,
        labelKey: "nav.calendar",
        keywords: "kalender calendar fristen termine deadlines",
        tooltipKey: "nav.tooltip.calendar",
      },
      {
        href: "/dashboard/deadlines",
        icon: Clock,
        labelKey: "nav.deadlines",
        keywords: "fristen termine deadlines",
      },
      {
        href: "/dashboard/fristenbuch",
        icon: BookOpen,
        labelKey: "nav.fristenbuch",
        keywords: "fristenbuch deadline register fristen chronologisch",
      },
      {
        href: "/dashboard/tasks",
        icon: CheckSquare,
        labelKey: "nav.tasks",
        keywords: "aufgaben tasks todos",
        tooltipKey: "nav.tooltip.tasks",
      },
      {
        href: "/dashboard/wiedervorlagen",
        icon: CalendarClock,
        labelKey: "nav.wiedervorlagen",
        keywords: "wiedervorlage follow-up erinnerung intern",
      },
      {
        href: "/dashboard/time-suggestions",
        icon: Lightbulb,
        labelKey: "nav.time_suggestions",
        keywords: "zeit vorschläge passive zeiterfassung time suggestions tracking",
        audienceTier: "erweitert",
      },
    ],
  },
  {
    titleKey: "nav.section.docs_drafting",
    descKey: "nav.section.desc.docs_drafting",
    colorVar: "--nav-cat-docs",
    items: [
      {
        href: "/dashboard/vault",
        icon: FolderOpen,
        labelKey: "nav.vault",
        keywords: "dokumente vault archiv dms",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/upload",
        icon: FileUp,
        labelKey: "nav.upload",
        keywords: "hochladen datei upload file",
      },
      {
        href: "/dashboard/drafting",
        icon: PenTool,
        labelKey: "nav.drafting",
        keywords: "entwurf drafting schreiben write",
        tooltipKey: "nav.tooltip.drafting",
      },
      {
        href: "/dashboard/templates",
        icon: FileCode,
        labelKey: "nav.templates",
        keywords: "vorlagen templates muster",
      },
      {
        href: "/dashboard/review-sets",
        icon: FolderSearch,
        labelKey: "nav.review_sets",
        keywords: "review sets review-sets e-discovery privilege",
        tooltipKey: "nav.tooltip.review_sets",
      },
      {
        href: "/dashboard/dictation",
        icon: Mic,
        labelKey: "nav.dictation",
        keywords: "diktat dictation voice transcription aufnahme",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/document-interviews",
        icon: FileQuestion,
        labelKey: "nav.document_interviews",
        keywords: "interview fragebogen document assembly geführt mandant",
        audienceTier: "erweitert",
      },
    ],
  },
  {
    titleKey: "nav.section.contracts",
    descKey: "nav.section.desc.contracts",
    colorVar: "--nav-cat-docs",
    items: [
      {
        href: "/dashboard/contracts",
        icon: FileCheck,
        labelKey: "nav.contracts",
        keywords: "vertrag contracts vertrage",
      },
      {
        href: "/dashboard/clause-library",
        icon: Library,
        labelKey: "nav.clause_library",
        keywords: "klauseln bibliothek clauses library",
      },
      {
        href: "/dashboard/signature",
        icon: FileSignature,
        labelKey: "nav.signature",
        keywords: "unterschrift sign docusign signatur",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/obligation-tracking",
        icon: ListChecks,
        labelKey: "nav.obligation_tracking",
        keywords: "obligationen verpflichtungen obligations tracking",
      },
      {
        href: "/dashboard/playbooks",
        icon: BookMarked,
        labelKey: "nav.playbooks",
        keywords: "playbooks handbucher manuals vorlagen",
      },
    ],
  },
  {
    titleKey: "nav.section.knowledge",
    descKey: "nav.section.desc.knowledge",
    colorVar: "--nav-cat-research",
    items: [
      {
        href: "/dashboard/brain",
        icon: Brain,
        labelKey: "nav.brain",
        keywords: "wissen knowledge base explorer seiten",
        tooltipKey: "nav.tooltip.brain",
      },
      {
        href: "/dashboard/graph",
        icon: Network,
        labelKey: "nav.graph",
        keywords: "graph netzwerk entitaten beziehungen entities",
        tooltipKey: "nav.tooltip.graph",
      },
      {
        href: "/dashboard/sources",
        icon: Database,
        labelKey: "nav.sources",
        keywords: "quellen datenquellen connectors sources",
        tooltipKey: "nav.tooltip.sources",
      },
    ],
  },
  {
    titleKey: "nav.section.litigation",
    descKey: "nav.section.desc.litigation",
    colorVar: "--nav-cat-cases",
    items: [
      {
        href: "/dashboard/litigation",
        icon: Hammer,
        labelKey: "nav.litigation",
        keywords: "prozess gericht klage litigation court",
        tooltipKey: "nav.tooltip.litigation",
      },
      {
        href: "/dashboard/process-strategy",
        icon: Gavel,
        labelKey: "nav.process_strategy",
        keywords: "strategie prozess strategy litigation",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/analytics",
        icon: TrendingUp,
        labelKey: "nav.analytics_hub",
        keywords: "analytics berichte insights statistik gericht portfolio reports",
      },
      {
        href: "/dashboard/court-analytics",
        icon: Scale,
        labelKey: "nav.court_analytics",
        keywords: "entscheider analytics gericht dauer erfolg quote",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/red-team",
        icon: ShieldAlert,
        labelKey: "nav.red_team",
        keywords: "red team adversarial prüfung schwächen gegenargument",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/berufungs-agent",
        icon: Landmark,
        labelKey: "nav.berufungs_agent",
        keywords: "berufung appeal revision aktanalyse berufungsgründe",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/war-room",
        icon: Radar,
        labelKey: "nav.war_room",
        keywords: "war room perspektiven richter gegner mandant perspektivenraum",
        audienceTier: "erweitert",
      },
    ],
  },
  {
    titleKey: "nav.section.honorar",
    descKey: "nav.section.desc.honorar",
    colorVar: "--nav-cat-billing",
    items: [
      {
        href: "/dashboard/invoicing",
        icon: Receipt,
        labelKey: "nav.invoicing",
        keywords: "rechnung invoice rvg gebühren",
        tooltipKey: "nav.tooltip.invoicing",
      },
      {
        href: "/dashboard/time",
        icon: Clock,
        labelKey: "nav.time",
        keywords: "zeiterfassung time tracking stunden leistungen timer",
      },
      {
        href: "/dashboard/cost-calculator",
        icon: Calculator,
        labelKey: "nav.cost_calculator",
        keywords: "kostenrechner rvg calculator streitwert",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/fee-agreements",
        icon: Wallet,
        labelKey: "nav.fee_agreements",
        keywords: "honorar vereinbarung budget fee agreement deckelung",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/trust-accounting",
        icon: Landmark,
        labelKey: "nav.trust_accounting",
        keywords: "treuhand trust klientengelder fiduciary",
        tooltipKey: "nav.tooltip.trust_accounting",
      },
      {
        href: "/dashboard/claim-account",
        icon: Gavel,
        labelKey: "nav.claim_account",
        keywords: "mahnung zwangsvollstreckung forderung claim mahnbescheid zv",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/legal-insurance",
        icon: ShieldCheck,
        labelKey: "nav.legal_insurance",
        keywords: "rechtsschutz rsv drebis deckungsanfrage versicherung",
        audienceTier: "dach-integration",
      },
    ],
  },
  {
    titleKey: "nav.section.buchhaltung",
    descKey: "nav.section.desc.buchhaltung",
    colorVar: "--nav-cat-billing",
    items: [
      {
        href: "/dashboard/fibu",
        icon: Banknote,
        labelKey: "nav.fibu",
        keywords: "fibu finanzbuchhaltung bank opos mahnung zahlung payment",
        tooltipKey: "nav.tooltip.fibu",
      },
      {
        href: "/dashboard/datev-export",
        icon: FileSpreadsheet,
        labelKey: "nav.datev_export",
        keywords: "datev export buhaltung steuer",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.datev_export",
      },
      {
        href: "/dashboard/datev-direct",
        icon: FileSpreadsheet,
        labelKey: "nav.datev_direct",
        keywords: "datev direct api rechnungsdaten buchungsdaten geplant",
        tooltipKey: "nav.tooltip.datev_direct",
        comingSoon: true,
        audienceTier: "dach-integration",
      },
    ],
  },
  {
    titleKey: "nav.section.kanzleisteuerung",
    descKey: "nav.section.desc.kanzleisteuerung",
    colorVar: "--nav-cat-ops",
    items: [
      {
        href: "/dashboard/kanzlei-tools",
        icon: Calculator,
        labelKey: "nav.kanzlei_tools",
        keywords: "fachrechner gericht pkh rsv fax kyc vollmacht fao rubrum tools",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/controlling",
        icon: Gauge,
        labelKey: "nav.controlling",
        keywords: "controlling kpi kennzahlen kanzlei steuerung analytics",
        tooltipKey: "nav.tooltip.controlling",
      },
      {
        href: "/dashboard/peer-benchmark",
        icon: TrendingUp,
        labelKey: "nav.peer_benchmark",
        keywords: "benchmark vergleich kanzlei erfolgsquote durchlaufzeit",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/notifications",
        icon: Bell,
        labelKey: "nav.notifications",
        keywords: "benachrichtigung notifications alerts erwähnung frist",
      },
    ],
  },
  {
    titleKey: "nav.section.firm_ops",
    descKey: "nav.section.desc.firm_ops",
    colorVar: "--nav-cat-billing",
    items: [
      {
        href: "/dashboard/workflows",
        icon: ClipboardList,
        labelKey: "nav.workflows",
        keywords: "workflows automation prozesse workflow",
      },
      {
        href: "/dashboard/approvals",
        icon: BadgeCheck,
        labelKey: "nav.approvals",
        keywords: "approvals freigaben genehmigung approval",
      },
      {
        href: "/dashboard/shared-spaces",
        icon: Share2,
        labelKey: "nav.shared_spaces",
        keywords: "shared spaces kollaboration teams",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/absences",
        icon: CalendarOff,
        labelKey: "nav.absences",
        keywords: "urlaub vertretung absences vacation delegation abwesenheit",
        audienceTier: "erweitert",
        tooltipKey: "nav.tooltip.absences",
      },
      {
        href: "/dashboard/fao-tracking",
        icon: GraduationCap,
        labelKey: "nav.fao_tracking",
        keywords: "fao fortbildung nachweise fachanwalt",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/team-meeting",
        icon: Users,
        labelKey: "nav.team_meeting",
        keywords: "team besprechung agenda woechentlich",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/case-assignment",
        icon: Users,
        labelKey: "nav.case_assignment",
        keywords: "case assignment team zuweisung aktenverteilung workload",
        audienceTier: "erweitert",
        tooltipKey: "nav.tooltip.case_assignment",
      },
      {
        href: "/dashboard/online-booking",
        icon: Calendar,
        labelKey: "nav.online_booking",
        keywords: "online booking termine slots mandanten buchung",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/bulk-cases",
        icon: Layers,
        labelKey: "nav.bulk_cases",
        keywords: "massenakten bulk import csv portfolien migration",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/white-label",
        icon: Palette,
        labelKey: "nav.white_label",
        keywords: "white label branding pwa portal logo farben",
        audienceTier: "erweitert",
      },
    ],
  },
  {
    titleKey: "nav.section.mandate_docs",
    descKey: "nav.section.desc.mandate_docs",
    colorVar: "--nav-cat-cases",
    items: [
      {
        href: "/dashboard/power-of-attorney",
        icon: FileSignature,
        labelKey: "nav.power_of_attorney",
        keywords: "vollmacht power of attorney mandatsvollmacht",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/review-queue",
        icon: ListTodo,
        labelKey: "nav.review_queue",
        keywords: "review queue warteschlange freigabe",
      },
    ],
  },
  {
    titleKey: "nav.section.compliance",
    descKey: "nav.section.desc.compliance",
    colorVar: "--nav-cat-billing",
    items: [
      {
        href: "/dashboard/compliance",
        icon: ShieldCheck,
        labelKey: "nav.compliance",
        keywords: "compliance dsgvo gdpr brao compliance",
        tooltipKey: "nav.tooltip.compliance",
        audienceTier: "dach-integration",
      },
      {
        href: "/dashboard/compliance/retention",
        icon: FileArchive,
        labelKey: "nav.retention",
        keywords: "aufbewahrung retention fristen archivierung",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.retention",
      },
      {
        href: "/dashboard/verfahrensdoku",
        icon: FileCheck2,
        labelKey: "nav.verfahrensdoku",
        keywords: "verfahrensdokumentation gobd protokoll",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.verfahrensdoku",
      },
      {
        href: "/dashboard/legal-hold",
        icon: Shield,
        labelKey: "nav.legal_hold",
        keywords: "legal hold litigation hold beweissicherungsbeschluss erhaltung",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.legal_hold",
      },
      {
        href: "/dashboard/outbound-register",
        icon: Send,
        labelKey: "nav.outbound_register",
        keywords: "postausgangsbuch versand zustellung outbound register",
        audienceTier: "dach-integration",
      },
      {
        href: "/dashboard/data-export",
        icon: Download,
        labelKey: "nav.data_export",
        keywords: "export daten download csv",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.data_export",
      },
      {
        href: "/dashboard/kyc",
        icon: Fingerprint,
        labelKey: "nav.kyc",
        keywords: "kyc gwg geldwäsche identitätsprüfung risk assessment",
        audienceTier: "dach-integration",
      },
    ],
  },
];

export const BOTTOM_ITEMS: NavItem[] = [
  {
    href: "/dashboard/settings",
    icon: Settings,
    labelKey: "nav.settings",
    keywords: "einstellungen settings konfiguration preferences",
    tooltipKey: "nav.tooltip.settings",
    tier: "free",
  },
  {
    href: "/dashboard/team",
    icon: UserCog,
    labelKey: "nav.admin",
    keywords: "team verwaltung admin benutzer users mitarbeiter",
    tier: "admin",
  },
  {
    href: "/dashboard/audit",
    icon: ScrollText,
    labelKey: "nav.audit_log",
    keywords: "audit log protokoll nachverfolgung trail",
    tier: "admin",
    audienceTier: "system",
    tooltipKey: "nav.tooltip.audit_log",
  },
  {
    href: "/dashboard/directory",
    icon: Grid3x3,
    labelKey: "nav.directory",
    keywords: "alle funktionen verzeichnis directory ubersicht features",
    tier: "free",
    audienceTier: "quick-start",
  },
];

const PRIMARY_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    labelKey: "nav.overview",
    keywords: "ubersicht dashboard home startseite overview heute",
  },
  {
    href: "/dashboard/cases",
    icon: Briefcase,
    labelKey: "nav.cases",
    keywords: "akten mandante falle cases matters bestandsakten",
    tooltipKey: "nav.tooltip.cases",
  },
  {
    href: "/dashboard/deadlines",
    icon: CalendarClock,
    labelKey: "nav.deadlines",
    keywords: "fristen termine deadlines calendar kalender",
    tooltipKey: "nav.tooltip.deadlines",
  },
  {
    href: "/dashboard/intake",
    icon: Inbox,
    labelKey: "nav.intake",
    keywords: "mandantsaufnahme intake eingang neue posteingang bea whatsapp email",
    tooltipKey: "nav.tooltip.intake",
  },
  {
    href: "/dashboard/research",
    icon: SearchCheck,
    labelKey: "nav.legal_research",
    keywords: "recherche rechtsprechung gesetze urteile research hub",
    tooltipKey: "nav.tooltip.research",
  },
  {
    href: "/dashboard/chat",
    icon: MessageSquareText,
    labelKey: "nav.chat",
    keywords: "chat copilot assistent ki fragen recherche drafting",
    tooltipKey: "nav.tooltip.chat",
  },
];

const PRIMARY_COLOR_VARS: string[] = [
  "--brand-primary",
  "--nav-cat-cases",
  "--nav-cat-cases",
  "--nav-cat-comm",
  "--nav-cat-research",
  "--nav-cat-comm",
];

const ADMIN_SECTION: NavSection = {
  titleKey: "nav.section.admin",
  descKey: "nav.section.desc.admin",
  colorVar: "--nav-cat-admin",
  items: [
    ...BOTTOM_ITEMS,
    {
      href: "/dashboard/admin",
      icon: LayoutDashboard,
      labelKey: "nav.admin_overview",
      keywords: "admin overview dashboard kunden uebersicht stats mrr",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/users",
      icon: Users,
      labelKey: "nav.admin_users",
      keywords: "kunden users benutzer customers verwaltung plan role",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/mailbox",
      icon: Mailbox,
      labelKey: "nav.admin_mailbox",
      keywords: "mailbox mail email inbox posteingang",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/billing",
      icon: CreditCard,
      labelKey: "nav.billing",
      keywords: "billing abo plan subscription zahlung",
      tier: "free",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/agents",
      icon: Bot,
      labelKey: "nav.agents",
      keywords: "agenten bots automation ki agents",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/crypto-forensics",
      icon: Radar,
      labelKey: "nav.crypto_forensics",
      keywords: "krypto forensik rciid wallet bitcoin ethereum blockchain fraud",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/connectors",
      icon: Plug,
      labelKey: "nav.connectors",
      keywords: "connectors integrationen schnittstellen apis",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/api-keys",
      icon: FileLock,
      labelKey: "nav.api_keys",
      keywords: "api keys schlussel tokens zugang",
      tier: "admin",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/settings/kanzlei",
      icon: ServerCog,
      labelKey: "nav.kanzlei",
      keywords: "kanzlei firma einstellungen orga",
      tier: "admin",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.kanzlei_settings",
    },
    {
      href: "/dashboard/settings/security",
      icon: ShieldAlert,
      labelKey: "nav.security",
      keywords: "sicherheit security 2fa passwort schutz",
      tier: "free",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/settings/scim",
      icon: Network,
      labelKey: "nav.scim",
      keywords: "scim provisioning sso saml benutzer",
      tier: "enterprise",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/settings/ai-model",
      icon: Cpu,
      labelKey: "nav.ai_model",
      keywords: "ki modell ai model llm konfiguration",
      tier: "admin",
      audienceTier: "system",
      tooltipKey: "nav.tooltip.ai_model",
    },
    {
      href: "/dashboard/settings/memory",
      icon: BrainCog,
      labelKey: "nav.memory",
      keywords: "gedaechtnis memory erinnerungen praferenzen",
      tier: "free",
      audienceTier: "quick-start",
      tooltipKey: "nav.tooltip.memory",
    },
    {
      href: "/dashboard/import-kanzlei",
      icon: FileSliders,
      labelKey: "nav.import_kanzlei",
      keywords: "import kanzlei migration daten",
      tier: "admin",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.import_kanzlei",
    },
    {
      href: "/dashboard/admin/backup",
      icon: Database,
      labelKey: "nav.backup_restore",
      keywords: "backup restore sicherung daten export import",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/dr",
      icon: Server,
      labelKey: "nav.dr",
      keywords: "disaster recovery dr backup rpo rto restore drill",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/feature-flags",
      icon: Flag,
      labelKey: "nav.feature_flags",
      keywords: "feature flags feature toggle rollout freigaben",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/slo",
      icon: Activity,
      labelKey: "nav.slo",
      keywords: "slo service level objective monitoring metrics alerts",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/corpus",
      icon: Database,
      labelKey: "nav.corpus_dashboard",
      keywords: "corpus embedding chunking chunks vector hnsw index retrieval quality",
      tier: "admin",
      audienceTier: "system",
      tooltipKey: "nav.tooltip.corpus_dashboard",
    },
    {
      href: "/dashboard/mobile",
      icon: Smartphone,
      labelKey: "nav.mobile",
      keywords: "mobile app handy smartphone install",
      tier: "free",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/onboarding",
      icon: Award,
      labelKey: "nav.onboarding",
      keywords: "onboarding einfuhrung setup start",
      tier: "free",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/experience",
      icon: GraduationCap,
      labelKey: "nav.experience",
      keywords: "erfahrung profil lebenslauf attorney",
      tier: "free",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/rag-eval",
      icon: FlaskConical,
      labelKey: "nav.rag_eval",
      keywords: "rag eval evaluation qualitat test",
      tier: "admin",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/ai-quality",
      icon: ShieldCheck,
      labelKey: "nav.ai_quality",
      keywords: "ai quality hallucination guardrail ece calibration reasoning trace",
      tier: "admin",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/chat/analytics",
      icon: ChartNoAxesColumn,
      labelKey: "nav.chat_analytics",
      keywords: "chat analytics statistik nutzung",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/chat/compare",
      icon: GitCompare,
      labelKey: "nav.chat_compare",
      keywords: "modell vergleich compare benchmark",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/whatsapp/templates",
      icon: MessagesSquare,
      labelKey: "nav.whatsapp_templates",
      keywords: "whatsapp vorlagen templates",
      tier: "pro",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.whatsapp_templates",
    },
    {
      href: "/dashboard/calendar-export",
      icon: CalendarSync,
      labelKey: "nav.calendar_export",
      keywords: "kalender export ics sync outlook",
      tier: "free",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.calendar_export",
    },
    {
      href: "/dashboard/judgements-sync",
      icon: RefreshCw,
      labelKey: "nav.judgements_sync",
      keywords: "urteile sync rechtsprechung update",
      tier: "admin",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.judgements_sync",
    },
    {
      href: "/dashboard/monitoring",
      icon: Bell,
      labelKey: "nav.monitoring",
      keywords: "monitoring uberwachung alerts health",
      tier: "admin",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/admin/compliance-export",
      icon: FileText,
      labelKey: "nav.compliance_export",
      keywords: "compliance audit export reasoning traces eu ai act",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/feedback-triage",
      icon: MessagesSquare,
      labelKey: "nav.feedback_triage",
      keywords: "feedback triage queue error classification correction",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/guardrails",
      icon: ShieldAlert,
      labelKey: "nav.guardrails",
      keywords: "guardrails ai safety monitoring queries blocked flagged",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/rag-optimizer",
      icon: BrainCog,
      labelKey: "nav.rag_optimizer",
      keywords: "rag optimizer retrieval augmented generation baseline auto-tune",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/eval-review",
      icon: ClipboardCheck,
      labelKey: "nav.eval_review",
      keywords: "eval fixture review jurist ground truth retrieval eval correction",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/deep-analysis",
      icon: ScanSearch,
      labelKey: "nav.deep_analysis",
      keywords: "tiefenanalyse cross-document deep analysis zusammenhange",
      tier: "admin",
      audienceTier: "erweitert",
      tooltipKey: "nav.tooltip.deep_analysis",
    },
    {
      href: "/dashboard/translate",
      icon: Languages,
      labelKey: "nav.translate",
      keywords: "ubersetzung translate juristische fachsprache",
      tier: "admin",
      audienceTier: "erweitert",
      tooltipKey: "nav.tooltip.translate",
    },
    {
      href: "/dashboard/anonymize",
      icon: EyeOff,
      labelKey: "nav.anonymize",
      keywords: "anonymisierung datenschutz privacy redact",
      tier: "admin",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.anonymize",
    },
    {
      href: "/dashboard/autonomous",
      icon: Zap,
      labelKey: "nav.autonomous",
      keywords: "autopilot autonomous overnight nacht jobs approval queue",
      tier: "admin",
      audienceTier: "erweitert",
    },
  ],
};

export const ALL_NAV_ITEMS: NavItem[] = (() => {
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const item of [
    ...PRIMARY_ITEMS,
    ...NAV_SECTIONS.flatMap((s) => s.items),
    ...ADMIN_SECTION.items,
  ]) {
    if (!seen.has(item.href)) {
      seen.add(item.href);
      items.push(item);
    }
  }
  return items;
})();

export const PREFERRED_SECTION_BY_HREF: Array<{ href: string; section: DashboardKey }> = (() => {
  const seen = new Set<string>();
  const entries: Array<{ href: string; section: DashboardKey }> = [];
  for (const section of [...NAV_SECTIONS, ADMIN_SECTION]) {
    for (const item of section.items) {
      if (!seen.has(item.href)) {
        seen.add(item.href);
        entries.push({ href: item.href, section: section.titleKey });
      }
    }
  }
  return entries;
})();

// ── Industry-conditional navigation ──────────────────────────────────────────

export interface IndustryNavConfig {
  primaryItems: NavItem[];
  primaryColorVars: string[];
  sections: NavSection[];
  adminSection: NavSection;
  bottomItems: NavItem[];
  allNavItems: NavItem[];
  preferredSectionByHref: Array<{ href: string; section: DashboardKey }>;
}

const LEGAL_NAV: IndustryNavConfig = {
  primaryItems: PRIMARY_ITEMS,
  primaryColorVars: PRIMARY_COLOR_VARS,
  sections: NAV_SECTIONS,
  adminSection: ADMIN_SECTION,
  bottomItems: BOTTOM_ITEMS,
  allNavItems: ALL_NAV_ITEMS,
  preferredSectionByHref: PREFERRED_SECTION_BY_HREF,
};

const TAX_PRIMARY_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    labelKey: "nav.overview",
    keywords: "ubersicht dashboard home startseite overview",
  },
  {
    href: "/dashboard/contacts",
    icon: Users,
    labelKey: "nav.clients",
    keywords: "mandanten klienten clients",
  },
  {
    href: "/dashboard/tax-deadlines",
    icon: CalendarClock,
    labelKey: "nav.tax_deadlines",
    keywords: "steuerfristen fristen deadlines kalender",
  },
  {
    href: "/dashboard/intake",
    icon: Inbox,
    labelKey: "nav.intake",
    keywords: "mandantsaufnahme intake eingang neue",
  },
  {
    href: "/dashboard/chat",
    icon: MessageSquareText,
    labelKey: "nav.chat",
    keywords: "chat copilot assistent ki fragen",
  },
];

const TAX_PRIMARY_COLOR_VARS: string[] = [
  "--brand-primary",
  "--nav-cat-cases",
  "--nav-cat-cases",
  "--nav-cat-cases",
  "--nav-cat-comm",
];

const TAX_NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.clients",
    descKey: "nav.section.desc.clients_comm",
    colorVar: "--nav-cat-cases",
    items: [
      {
        href: "/dashboard/contacts",
        icon: Users,
        labelKey: "nav.contacts",
        keywords: "mandanten klienten parteien clients",
      },
      {
        href: "/dashboard/client-portal",
        icon: UserCircle,
        labelKey: "nav.client_portal",
        keywords: "mandantenportal portal client access",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/document-requests",
        icon: FileClock,
        labelKey: "nav.document_requests",
        keywords: "dokumentenanforderung unterlagen documents request",
      },
    ],
  },
  {
    titleKey: "nav.section.tax_returns",
    descKey: "nav.section.desc.tax_returns",
    colorVar: "--nav-cat-ops",
    items: [
      {
        href: "/dashboard/tax-returns",
        icon: FileSpreadsheet,
        labelKey: "nav.tax_returns",
        keywords: "steuererklarung tax returns einkommensteuer",
      },
      {
        href: "/dashboard/tax-assessments",
        icon: FileCheck,
        labelKey: "nav.tax_assessments",
        keywords: "steuerbescheide assessments bescheid",
      },
      {
        href: "/dashboard/tax-audit",
        icon: Search,
        labelKey: "nav.tax_audit",
        keywords: "betriebsprufung audit finanzamt",
      },
      {
        href: "/dashboard/tax-clients",
        icon: Users,
        labelKey: "nav.tax_clients",
        keywords: "mandanten steuer clients",
      },
      {
        href: "/dashboard/tax-stbvv",
        icon: Calculator,
        labelKey: "nav.tax_stbvv",
        keywords: "stbvv gebuhren honorar calculator",
      },
      {
        href: "/dashboard/elster",
        icon: Send,
        labelKey: "nav.elster",
        keywords: "elster finanzamt ubermittlung",
      },
    ],
  },
  {
    titleKey: "nav.section.documents",
    descKey: "nav.section.desc.docs_drafting",
    colorVar: "--nav-cat-docs",
    items: [
      {
        href: "/dashboard/upload",
        icon: FileUp,
        labelKey: "nav.upload",
        keywords: "hochladen datei upload file",
      },
      {
        href: "/dashboard/vault",
        icon: FolderOpen,
        labelKey: "nav.vault",
        keywords: "dokumente vault archiv dms",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/templates",
        icon: FileCode,
        labelKey: "nav.templates",
        keywords: "vorlagen templates muster",
      },
      {
        href: "/dashboard/analyze",
        icon: FileSearch,
        labelKey: "nav.analyze",
        keywords: "analyse scan untersuchung examination",
      },
      {
        href: "/dashboard/signature",
        icon: FileSignature,
        labelKey: "nav.signature",
        keywords: "unterschrift sign docusign signatur",
        audienceTier: "erweitert",
      },
    ],
  },
  {
    titleKey: "nav.section.billing_compliance",
    descKey: "nav.section.desc.billing",
    colorVar: "--nav-cat-billing",
    items: [
      {
        href: "/dashboard/invoicing",
        icon: Receipt,
        labelKey: "nav.invoicing",
        keywords: "rechnung invoice gebuhren honorar",
      },
      {
        href: "/dashboard/datev-export",
        icon: FileSpreadsheet,
        labelKey: "nav.datev_export",
        keywords: "datev export buhaltung steuer",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.datev_export",
      },
      {
        href: "/dashboard/cost-calculator",
        icon: Calculator,
        labelKey: "nav.cost_calculator",
        keywords: "kostenrechner calculator streitwert",
      },
      {
        href: "/dashboard/compliance",
        icon: ShieldCheck,
        labelKey: "nav.compliance",
        keywords: "compliance dsgvo gdpr compliance",
      },
      {
        href: "/dashboard/verfahrensdoku",
        icon: FileCheck2,
        labelKey: "nav.verfahrensdoku",
        keywords: "verfahrensdokumentation gobd protokoll",
        audienceTier: "dach-integration",
        tooltipKey: "nav.tooltip.verfahrensdoku",
      },
    ],
  },
  {
    titleKey: "nav.section.communication",
    descKey: "nav.section.desc.clients_comm",
    colorVar: "--nav-cat-comm",
    items: [
      {
        href: "/dashboard/whatsapp",
        icon: MessageCircle,
        labelKey: "nav.whatsapp",
        keywords: "chat messages nachrichten messenger",
      },
      {
        href: "/dashboard/email-import",
        icon: MailOpen,
        labelKey: "nav.email_import",
        keywords: "e-mail import outlook imap",
      },
    ],
  },
  {
    titleKey: "nav.section.research_knowledge",
    descKey: "nav.section.desc.knowledge",
    colorVar: "--nav-cat-research",
    items: [
      {
        href: "/dashboard/brain",
        icon: Brain,
        labelKey: "nav.brain",
        keywords: "wissen knowledge base explorer seiten",
      },
      {
        href: "/dashboard/graph",
        icon: Network,
        labelKey: "nav.graph",
        keywords: "graph netzwerk entitaten beziehungen entities",
      },
      {
        href: "/dashboard/sources",
        icon: Database,
        labelKey: "nav.sources",
        keywords: "quellen datenquellen connectors sources",
      },
    ],
  },
  {
    titleKey: "nav.section.operations",
    descKey: "nav.section.desc.firm_ops",
    colorVar: "--nav-cat-ops",
    items: [
      {
        href: "/dashboard/operations",
        icon: Activity,
        labelKey: "nav.operations_cockpit",
        keywords: "operations cockpit kanzlei vorgänge work items",
      },
      {
        href: "/dashboard/review-queue",
        icon: ListTodo,
        labelKey: "nav.review_queue",
        keywords: "review queue warteschlange freigabe",
      },
      {
        href: "/dashboard/approvals",
        icon: BadgeCheck,
        labelKey: "nav.approvals",
        keywords: "approvals freigaben genehmigung approval",
      },
      {
        href: "/dashboard/workflows",
        icon: ClipboardList,
        labelKey: "nav.workflows",
        keywords: "workflows automation prozesse workflow",
      },
      {
        href: "/dashboard/reports",
        icon: FileBarChart,
        labelKey: "nav.reports",
        keywords: "berichte reports reporte statistik",
        audienceTier: "erweitert",
      },
      {
        href: "/dashboard/shared-spaces",
        icon: Share2,
        labelKey: "nav.shared_spaces",
        keywords: "shared spaces kollaboration teams",
        audienceTier: "erweitert",
      },
    ],
  },
  {
    titleKey: "nav.section.tax_litigation",
    descKey: "nav.section.desc.tax_litigation",
    colorVar: "--nav-cat-cases",
    items: [
      {
        href: "/dashboard/litigation",
        icon: Hammer,
        labelKey: "nav.litigation",
        keywords: "finanzgericht finanzgerichtsbarkeit fg prozess litigation",
      },
      {
        href: "/dashboard/process-strategy",
        icon: Gavel,
        labelKey: "nav.process_strategy",
        keywords: "steuer prozessstrategie finanzgericht strategie",
      },
      {
        href: "/dashboard/court-analytics",
        icon: Scale,
        labelKey: "nav.court_analytics",
        keywords: "gericht analytics finanzgericht fg entscheidungen",
      },
    ],
  },
];

const TAX_ADMIN_SECTION: NavSection = {
  titleKey: "nav.section.admin",
  descKey: "nav.section.desc.admin",
  colorVar: "--nav-cat-admin",
  items: [
    ...BOTTOM_ITEMS,
    {
      href: "/dashboard/admin",
      icon: LayoutDashboard,
      labelKey: "nav.admin_overview",
      keywords: "admin overview dashboard kunden uebersicht stats mrr",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/users",
      icon: Users,
      labelKey: "nav.admin_users",
      keywords: "kunden users benutzer customers verwaltung plan role",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/mailbox",
      icon: Mailbox,
      labelKey: "nav.admin_mailbox",
      keywords: "mailbox mail email inbox posteingang",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/billing",
      icon: CreditCard,
      labelKey: "nav.billing",
      keywords: "billing abo plan subscription zahlung",
      tier: "free",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/agents",
      icon: Bot,
      labelKey: "nav.agents",
      keywords: "agenten bots automation ki agents",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/crypto-forensics",
      icon: Radar,
      labelKey: "nav.crypto_forensics",
      keywords: "krypto forensik rciid wallet bitcoin ethereum blockchain fraud",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/connectors",
      icon: Plug,
      labelKey: "nav.connectors",
      keywords: "connectors integrationen schnittstellen apis",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/api-keys",
      icon: FileLock,
      labelKey: "nav.api_keys",
      keywords: "api keys schlussel tokens zugang",
      tier: "admin",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/settings/kanzlei",
      icon: ServerCog,
      labelKey: "nav.kanzlei",
      keywords: "kanzlei firma einstellungen orga",
      tier: "admin",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.kanzlei_settings",
    },
    {
      href: "/dashboard/settings/security",
      icon: ShieldAlert,
      labelKey: "nav.security",
      keywords: "sicherheit security 2fa passwort schutz",
      tier: "free",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/settings/scim",
      icon: Network,
      labelKey: "nav.scim",
      keywords: "scim provisioning sso saml benutzer",
      tier: "enterprise",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/settings/ai-model",
      icon: Cpu,
      labelKey: "nav.ai_model",
      keywords: "ki modell ai model llm konfiguration",
      tier: "admin",
      audienceTier: "system",
      tooltipKey: "nav.tooltip.ai_model",
    },
    {
      href: "/dashboard/settings/memory",
      icon: BrainCog,
      labelKey: "nav.memory",
      keywords: "gedaechtnis memory erinnerungen praferenzen",
      tier: "free",
      audienceTier: "quick-start",
      tooltipKey: "nav.tooltip.memory",
    },
    {
      href: "/dashboard/import-kanzlei",
      icon: FileSliders,
      labelKey: "nav.import_kanzlei",
      keywords: "import kanzlei migration daten",
      tier: "admin",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.import_kanzlei",
    },
    {
      href: "/dashboard/admin/backup",
      icon: Database,
      labelKey: "nav.backup_restore",
      keywords: "backup restore sicherung daten export import",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/dr",
      icon: Server,
      labelKey: "nav.dr",
      keywords: "disaster recovery dr backup rpo rto restore drill",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/feature-flags",
      icon: Flag,
      labelKey: "nav.feature_flags",
      keywords: "feature flags feature toggle rollout freigaben",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/slo",
      icon: Activity,
      labelKey: "nav.slo",
      keywords: "slo service level objective monitoring metrics alerts",
      tier: "admin",
      audienceTier: "system",
    },
    {
      href: "/dashboard/admin/corpus",
      icon: Database,
      labelKey: "nav.corpus_dashboard",
      keywords: "corpus embedding chunking chunks vector hnsw index retrieval quality",
      tier: "admin",
      audienceTier: "system",
      tooltipKey: "nav.tooltip.corpus_dashboard",
    },
    {
      href: "/dashboard/mobile",
      icon: Smartphone,
      labelKey: "nav.mobile",
      keywords: "mobile app handy smartphone install",
      tier: "free",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/onboarding",
      icon: Award,
      labelKey: "nav.onboarding",
      keywords: "onboarding einfuhrung setup start",
      tier: "free",
      audienceTier: "quick-start",
    },
    {
      href: "/dashboard/experience",
      icon: GraduationCap,
      labelKey: "nav.experience",
      keywords: "erfahrung profil lebenslauf attorney",
      tier: "free",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/rag-eval",
      icon: FlaskConical,
      labelKey: "nav.rag_eval",
      keywords: "rag eval evaluation qualitat test",
      tier: "admin",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/ai-quality",
      icon: ShieldCheck,
      labelKey: "nav.ai_quality",
      keywords: "ai quality hallucination guardrail ece calibration reasoning trace",
      tier: "admin",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/chat/analytics",
      icon: ChartNoAxesColumn,
      labelKey: "nav.chat_analytics",
      keywords: "chat analytics statistik nutzung",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/chat/compare",
      icon: GitCompare,
      labelKey: "nav.chat_compare",
      keywords: "modell vergleich compare benchmark",
      tier: "pro",
      audienceTier: "erweitert",
    },
    {
      href: "/dashboard/whatsapp/templates",
      icon: MessagesSquare,
      labelKey: "nav.whatsapp_templates",
      keywords: "whatsapp vorlagen templates",
      tier: "pro",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.whatsapp_templates",
    },
    {
      href: "/dashboard/calendar-export",
      icon: CalendarSync,
      labelKey: "nav.calendar_export",
      keywords: "kalender export ics sync outlook",
      tier: "free",
      audienceTier: "dach-integration",
      tooltipKey: "nav.tooltip.calendar_export",
    },
    {
      href: "/dashboard/monitoring",
      icon: Bell,
      labelKey: "nav.monitoring",
      keywords: "monitoring uberwachung alerts health",
      tier: "admin",
      audienceTier: "erweitert",
    },
  ],
};

const TAX_ALL_NAV_ITEMS: NavItem[] = (() => {
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const item of [
    ...TAX_PRIMARY_ITEMS,
    ...TAX_NAV_SECTIONS.flatMap((s) => s.items),
    ...TAX_ADMIN_SECTION.items,
  ]) {
    if (!seen.has(item.href)) {
      seen.add(item.href);
      items.push(item);
    }
  }
  return items;
})();

const TAX_PREFERRED_SECTION_BY_HREF: Array<{ href: string; section: DashboardKey }> = (() => {
  const seen = new Set<string>();
  const entries: Array<{ href: string; section: DashboardKey }> = [];
  for (const section of [...TAX_NAV_SECTIONS, TAX_ADMIN_SECTION]) {
    for (const item of section.items) {
      if (!seen.has(item.href)) {
        seen.add(item.href);
        entries.push({ href: item.href, section: section.titleKey });
      }
    }
  }
  return entries;
})();

const TAX_NAV: IndustryNavConfig = {
  primaryItems: TAX_PRIMARY_ITEMS,
  primaryColorVars: TAX_PRIMARY_COLOR_VARS,
  sections: TAX_NAV_SECTIONS,
  adminSection: TAX_ADMIN_SECTION,
  bottomItems: BOTTOM_ITEMS,
  allNavItems: TAX_ALL_NAV_ITEMS,
  preferredSectionByHref: TAX_PREFERRED_SECTION_BY_HREF,
};

const NAV_BY_INDUSTRY: Record<string, IndustryNavConfig> = {
  legal: LEGAL_NAV,
  tax: TAX_NAV,
};

export function navForIndustry(industry: string | null | undefined): IndustryNavConfig {
  return NAV_BY_INDUSTRY[industry ?? "legal"] ?? LEGAL_NAV;
}

function sectionDomId(titleKey: DashboardKey) {
  return `sidebar-section-${titleKey.replaceAll(".", "-")}`;
}

function isActiveHref(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function findActiveSection(
  pathname: string,
  sections: NavSection[],
  preferredSectionByHref: Array<{ href: string; section: DashboardKey }>
) {
  const preferred = preferredSectionByHref.find((entry) => isActiveHref(pathname, entry.href));
  if (preferred && sections.some((section) => section.titleKey === preferred.section)) {
    return preferred.section;
  }
  return sections.find((section) =>
    section.items.some((item) => !item.comingSoon && isActiveHref(pathname, item.href))
  )?.titleKey;
}

const ADMIN_GROUPS: Array<{ titleKey: DashboardKey; hrefs: string[] }> = [
  {
    titleKey: "nav.section.admin_system",
    hrefs: [
      "/dashboard/settings/ai-model",
      "/dashboard/admin/feature-flags",
      "/dashboard/admin/backup",
      "/dashboard/admin/corpus",
      "/dashboard/admin/slo",
      "/dashboard/admin/dr",
      "/dashboard/admin/compliance-export",
      "/dashboard/admin/feedback-triage",
      "/dashboard/admin/guardrails",
      "/dashboard/admin/rag-optimizer",
      "/dashboard/admin/eval-review",
      "/dashboard/monitoring",
      "/dashboard/ai-quality",
      "/dashboard/connectors",
      "/dashboard/api-keys",
    ],
  },
  {
    titleKey: "nav.section.admin_users",
    hrefs: [
      "/dashboard/admin",
      "/dashboard/admin/users",
      "/dashboard/admin/mailbox",
      "/dashboard/team",
      "/dashboard/settings/scim",
      "/dashboard/settings/security",
      "/dashboard/audit",
      "/dashboard/settings",
      "/dashboard/settings/kanzlei",
    ],
  },
  {
    titleKey: "nav.section.admin_integrations",
    hrefs: [
      "/dashboard/import-kanzlei",
      "/dashboard/datev-export",
      "/dashboard/bea",
      "/dashboard/whatsapp/templates",
      "/dashboard/calendar-export",
      "/dashboard/judgements-sync",
    ],
  },
];

function splitAdminSection(section: NavSection): NavSection[] {
  const assigned = new Set(ADMIN_GROUPS.flatMap((group) => group.hrefs));
  const groups = ADMIN_GROUPS.map((group) => ({
    ...section,
    titleKey: group.titleKey,
    descKey: undefined,
    items: section.items.filter((item) => group.hrefs.includes(item.href)),
  }));
  groups.push({
    ...section,
    titleKey: "nav.section.admin_plan",
    descKey: undefined,
    items: section.items.filter((item) => !assigned.has(item.href)),
  });
  return groups.filter((group) => group.items.length > 0);
}

function SyncStatus({ collapsed }: { collapsed: boolean }) {
  const { pendingCount, syncing, syncPending } = useMutationQueue();
  const { t } = useLang();
  if (collapsed || pendingCount === 0) return null;
  return (
    <div className="mx-3 mt-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[color:var(--ds-warning-text)]">
          {pendingCount} {t("sidebar.changes_pending")}
        </span>
        <button
          onClick={() => void syncPending()}
          disabled={syncing}
          className="brand-text text-xs transition-[opacity,color] duration-200 disabled:opacity-50"
        >
          {syncing ? t("sidebar.syncing") : t("sidebar.sync_now")}
        </button>
      </div>
    </div>
  );
}

export function NetworkStatusBadge() {
  const online = useNetworkStatus();
  const { t } = useLang();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2 py-1 text-xs font-medium text-[color:var(--ds-danger-text)]"
      title={t("sidebar.offline_tooltip")}
    >
      <CloudOff size={12} aria-hidden />
      {t("sidebar.offline")}
    </div>
  );
}

const badgeVariantClasses: Record<string, string> = {
  danger: "bg-[color:var(--ds-danger-text)] text-white",
  warning: "bg-[color:var(--ds-warning-text)] text-white",
  info: "bg-[color:var(--ds-info-text)] text-white",
};

function NavBadge({
  count,
  variant,
  collapsed,
  label,
}: {
  count: number;
  variant: "danger" | "warning" | "info";
  collapsed: boolean;
  label?: string;
}) {
  if (count <= 0) return null;
  if (collapsed) {
    return (
      <span
        className={cn(
          "absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] leading-none font-bold",
          badgeVariantClasses[variant]
        )}
        aria-label={String(count)}
        title={label ? `${label}: ${count}` : String(count)}
      >
        {count > 9 ? "9+" : count}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] leading-none font-bold",
        badgeVariantClasses[variant]
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
  pages: number;
  entities: number;
  userName: string | null;
  userEmail: string | null;
  /** Real engine-reachability signal — undefined while the first stats load is in flight. */
  brainReachable?: boolean;
  /** User industry — drives which nav items are shown (legal, tax, …). */
  industry?: string | null;
  /** User role — non-admins see a trimmed admin section. */
  role?: string | null;
  /** User plan — drives tier-based visibility (free, pro, team, enterprise). */
  plan?: string | null;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  {
    collapsed,
    mobileOpen,
    setCollapsed,
    setMobileOpen,
    pages,
    entities,
    userName,
    userEmail,
    brainReachable,
    industry,
    role,
    plan,
  },
  ref
) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [openSections, setOpenSections] = useState<DashboardKey[]>([]);
  const [isDesktop, setIsDesktop] = useState(false);
  const [coreMode, setCoreMode] = useState(true);
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const isDesktopMQ = useIsDesktop();
  const { t } = useLang();
  const { panelTransition: sidebarPanelTransition } = useDashboardMotion();
  const sidebarShellTransition = sidebarPanelTransition;
  const { width: expandedWidth, handleMouseDown } = useResizable({
    minWidth: 200,
    maxWidth: 320,
    initialWidth: 240,
    storageKey: "subsumio-sidebar-width",
    side: "left",
  });
  const sidebarWidth = collapsed && isDesktop ? 64 : isDesktop ? expandedWidth : 240;
  const badgesQuery = useSidebarBadges();
  const badges: SidebarBadges = badgesQuery.data ?? {};
  useReviewInboxRealtime();
  const logoutMutation = useLogout();

  const isTax = industry === "tax";
  const navConfig = navForIndustry(industry);
  const {
    primaryItems,
    primaryColorVars,
    sections: navSections,
    adminSection: fullAdminSection,
    bottomItems,
    allNavItems: fullAllNavItems,
    preferredSectionByHref: fullPreferredSectionByHref,
  } = navConfig;

  const isAdmin = role === "admin";
  const userPlan = (plan ?? "free") as NavTier;
  const userPlanRank = PLAN_RANK[userPlan] ?? 0;
  const itemTierRank = useCallback((tier?: NavTier) => (tier ? (PLAN_RANK[tier] ?? 0) : 0), []);
  const isTierVisible = useCallback(
    (item: NavItem) => !item.tier || itemTierRank(item.tier) <= userPlanRank || isAdmin,
    [userPlanRank, isAdmin, itemTierRank]
  );
  // Role-based audience filtering: assistants don't see "erweitert" items,
  // non-admins never see "system" items. Admins see everything.
  const isAudienceVisible = useCallback(
    (item: NavItem) => {
      if (isAdmin) return true;
      if (!item.audienceTier) return true;
      if (item.audienceTier === "system") return false;
      if (role === "assistant" && item.audienceTier === "erweitert") return false;
      return true;
    },
    [isAdmin, role]
  );
  const isItemVisible = useCallback(
    (item: NavItem) => isTierVisible(item) && isAudienceVisible(item),
    [isTierVisible, isAudienceVisible]
  );
  const adminSection = useMemo(
    () =>
      isAdmin
        ? fullAdminSection
        : {
            ...fullAdminSection,
            items: fullAdminSection.items.filter(
              (item) => bottomItems.some((b) => b.href === item.href) && isItemVisible(item)
            ),
          },
    [isAdmin, fullAdminSection, bottomItems, isItemVisible]
  );
  const allNavItems = useMemo(
    () =>
      isAdmin
        ? fullAllNavItems.filter(isItemVisible)
        : fullAllNavItems.filter(
            (item) =>
              isItemVisible(item) &&
              (adminSection.items.some((a) => a.href === item.href) ||
                navSections.some((s) => s.items.some((sItem) => sItem.href === item.href)) ||
                primaryItems.some((p) => p.href === item.href))
          ),
    [isAdmin, fullAllNavItems, adminSection, navSections, primaryItems, isItemVisible]
  );
  const preferredSectionByHref = useMemo(
    () =>
      isAdmin
        ? fullPreferredSectionByHref
        : fullPreferredSectionByHref.filter((entry) =>
            allNavItems.some((item) => item.href === entry.href)
          ),
    [isAdmin, fullPreferredSectionByHref, allNavItems]
  );

  const brainStatusLabel =
    brainReachable === true
      ? t("sidebar.active")
      : brainReachable === false
        ? t("sidebar.offline")
        : t("sidebar.checking");

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      const base = navSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              !item.comingSoon &&
              isItemVisible(item) &&
              (!coreMode || !item.audienceTier || item.audienceTier === "quick-start")
          ),
        }))
        .filter((section) => section.items.length > 0);
      return coreMode ? base.filter((s) => CORE_SECTION_KEYS.includes(s.titleKey)) : base;
    }
    const q = searchQuery.toLowerCase().trim();
    const sections = [...navSections, adminSection];
    return sections
      .map((section) => ({
        ...section,
        items: allNavItems.filter((item) => {
          const preferred = preferredSectionByHref.find((entry) => entry.href === item.href);
          const sectionKey = preferred?.section ?? "nav.section.admin";
          return (
            sectionKey === section.titleKey &&
            !item.comingSoon &&
            isItemVisible(item) &&
            !primaryItems.some((primary) => primary.href === item.href) &&
            (t(item.labelKey).toLowerCase().includes(q) ||
              (item.keywords ?? "").toLowerCase().includes(q))
          );
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [
    searchQuery,
    t,
    navSections,
    adminSection,
    allNavItems,
    preferredSectionByHref,
    primaryItems,
    isItemVisible,
    coreMode,
  ]);

  const filteredPrimaryItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return primaryItems.filter(
      (item) =>
        isItemVisible(item) &&
        (!q ||
          t(item.labelKey).toLowerCase().includes(q) ||
          (item.keywords ?? "").toLowerCase().includes(q))
    );
  }, [primaryItems, isItemVisible, searchQuery, t]);

  const filteredBottomItems = useMemo(() => {
    if (!searchQuery.trim()) return bottomItems.filter(isItemVisible);
    return [];
  }, [searchQuery, bottomItems, isItemVisible]);

  const hasResults =
    filteredPrimaryItems.length > 0 ||
    filteredSections.length > 0 ||
    filteredBottomItems.length > 0;
  const accordionSections = useMemo<NavSection[]>(() => {
    const sections = filteredSections.flatMap((section) =>
      section.titleKey === "nav.section.admin" ? splitAdminSection(section) : [section]
    );
    if (filteredBottomItems.length > 0) {
      if (!searchQuery.trim()) {
        sections.push(...splitAdminSection(adminSection));
      } else {
        sections.push(...splitAdminSection({ ...adminSection, items: filteredBottomItems }));
      }
    }
    return sections;
  }, [filteredSections, filteredBottomItems, searchQuery, adminSection]);

  const activeSection = useMemo(
    () => findActiveSection(pathname, [...navSections, adminSection], preferredSectionByHref),
    [pathname, navSections, adminSection, preferredSectionByHref]
  );

  useEffect(() => {
    setIsDesktop(isDesktopMQ);
  }, [isDesktopMQ]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebar-core-mode");
      if (stored !== null) setCoreMode(stored === "false" ? false : true);
      const recent = JSON.parse(localStorage.getItem("subsumio-recent-nav") ?? "[]") as unknown;
      if (Array.isArray(recent)) {
        setRecentHrefs(
          recent.filter((href): href is string => typeof href === "string").slice(0, 5)
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = Number(event.key) - 1;
      const item = primaryItems[index];
      if (!item || index < 0 || index > 4) return;
      event.preventDefault();
      router.push(item.href);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [primaryItems, router, setMobileOpen]);

  const toggleCoreMode = useCallback(() => {
    setCoreMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-core-mode", String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) return;
    setOpenSections(activeSection ? [activeSection] : []);
  }, [activeSection, searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    setOpenSections(accordionSections.map((section) => section.titleKey));
  }, [accordionSections, searchQuery]);

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const q = query.toLowerCase().trim();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded bg-[var(--brand-primary)]/20 px-0.5 text-[color:var(--ds-text)]">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const trackRecent = useCallback(
    (item: NavItem) => {
      if (primaryItems.some((primary) => primary.href === item.href)) return;
      setRecentHrefs((current) => {
        const next = [item.href, ...current.filter((href) => href !== item.href)].slice(0, 5);
        try {
          localStorage.setItem("subsumio-recent-nav", JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [primaryItems]
  );

  const recentItems = useMemo(
    () =>
      recentHrefs
        .map((href) => allNavItems.find((item) => item.href === href))
        .filter((item): item is NavItem => item != null && isItemVisible(item)),
    [recentHrefs, allNavItems, isItemVisible]
  );

  const toggleSection = (titleKey: DashboardKey, event: React.MouseEvent<HTMLButtonElement>) => {
    setOpenSections((current) => {
      if (current.includes(titleKey)) {
        return current.filter((section) => section !== titleKey);
      }
      if (event.shiftKey || searchQuery.trim()) {
        return [...current, titleKey];
      }
      return [titleKey];
    });
  };

  return (
    <motion.aside
      ref={ref}
      data-tour="sidebar"
      initial={false}
      animate={{
        width: sidebarWidth,
      }}
      transition={sidebarShellTransition}
      className={cn(
        "sidebar-shadow z-50 shrink-0 overflow-hidden border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] transition-transform duration-[var(--ds-duration-panel)] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width,transform] motion-reduce:transition-none",
        "fixed inset-y-0 left-0 md:static",
        mobileOpen
          ? "translate-x-0 shadow-2xl"
          : "-translate-x-full md:translate-x-0 md:shadow-none"
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const active = document.activeElement;
        if (!(active instanceof HTMLAnchorElement)) return;
        e.preventDefault();
        const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]"));
        const idx = links.indexOf(active);
        if (idx === -1) return;
        if (e.key === "ArrowDown") {
          links[(idx + 1) % links.length]?.focus();
        } else {
          links[(idx - 1 + links.length) % links.length]?.focus();
        }
      }}
    >
      {/* Inner wrapper — width matches collapsed state so justify-center works. */}
      <div
        className={cn(
          "flex h-full flex-col transition-[width] duration-[var(--ds-duration-panel)] ease-[var(--ds-ease-panel)] motion-reduce:transition-none",
          collapsed && "w-16"
        )}
        style={!collapsed ? { width: sidebarWidth } : undefined}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-14 items-center gap-2.5 border-b border-[color:var(--ds-border)] px-4",
            collapsed && "md:w-16 md:justify-center md:px-0"
          )}
        >
          <button
            onClick={() => {
              setMobileOpen(false);
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
            }}
            className="group flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-all duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-90 md:hidden"
            aria-label={t("sidebar.close_menu")}
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute top-1/2 h-0.5 w-4 -translate-y-1/2 rotate-45 rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" />
              <span className="absolute top-1/2 h-0.5 w-4 -translate-y-1/2 -rotate-45 rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" />
            </span>
          </button>
          <Link
            href="/dashboard"
            aria-label={isTax ? t("sidebar.brand_tax") : t("sidebar.brand")}
            onClick={() => setMobileOpen(false)}
          >
            <SubsumioMark size={28} />
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              "font-display text-[13px] font-bold tracking-tight text-[color:var(--ds-text)] transition-[opacity] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)]",
              collapsed ? "pointer-events-none opacity-0" : "opacity-100"
            )}
            onClick={() => setMobileOpen(false)}
          >
            {isTax ? (
              t("sidebar.brand_tax")
            ) : (
              <>
                Subsum<span className="brand-text">•io</span>
              </>
            )}
          </Link>
        </div>

        <div className="dashboard-scroll-shadow flex-1 overflow-x-clip overflow-y-auto pt-[env(safe-area-inset-top)] pb-3">
          {brainReachable !== true && (
            <>
              {/* Healthy status stays quiet; only checking/offline states occupy navigation space. */}
              <div
                className={cn(
                  "mx-3 mt-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 transition-[opacity,height,padding] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)]",
                  collapsed
                    ? "pointer-events-none h-0 overflow-hidden border-0 py-0 opacity-0"
                    : "opacity-100"
                )}
                role="status"
                aria-label={`${t("sidebar.brain_status")}: ${brainStatusLabel}, ${pages} pages, ${entities} entities`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[color:var(--ds-text-subtle)]">
                    {t("sidebar.brain_status")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        brainReachable === false && "bg-[color:var(--ds-danger-text)]",
                        brainReachable === undefined && "bg-[color:var(--ds-text-subtle)]"
                      )}
                      aria-hidden
                    />
                    <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                      {brainStatusLabel}
                    </span>
                  </div>
                </div>
                <div className="mt-1 font-mono text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                  {pages} pages · {entities} entities
                </div>
              </div>
              <div
                className={cn(
                  "mt-4 hidden items-center justify-center transition-[opacity] duration-300 ease-[var(--ds-ease-smooth)] md:flex",
                  collapsed ? "opacity-100" : "pointer-events-none h-0 overflow-hidden opacity-0"
                )}
                title={`${t("sidebar.brain_status")}: ${brainStatusLabel}`}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    brainReachable === false && "bg-[color:var(--ds-danger-text)]",
                    brainReachable === undefined && "animate-pulse bg-[color:var(--ds-text-subtle)]"
                  )}
                  role="status"
                  aria-label={`${t("sidebar.brain_status")}: ${brainStatusLabel}`}
                />
              </div>
            </>
          )}

          {/* Sync status */}
          <SyncStatus collapsed={collapsed} />

          {/* Search / Filter */}
          <div
            className={cn(
              "px-3 pt-3 transition-[opacity] duration-300 ease-[var(--ds-ease-smooth)]",
              collapsed ? "pointer-events-none h-0 overflow-hidden pt-0 opacity-0" : "opacity-100"
            )}
          >
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("sidebar.filter_placeholder")}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-[13px] text-[color:var(--ds-text)] transition-[border-color,box-shadow] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--ds-border-strong)] focus:ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                aria-label={t("sidebar.filter_placeholder")}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
                  aria-label={t("sidebar.clear_filter")}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Core / Extended toggle */}
          {!collapsed && !searchQuery.trim() && (
            <div className="flex gap-1 px-3 pt-2">
              <button
                onClick={toggleCoreMode}
                className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-pressed={!coreMode}
                title={
                  coreMode ? t("sidebar.show_all_functions") : t("sidebar.show_core_functions")
                }
              >
                <span className="flex items-center gap-1.5">
                  {coreMode ? <Layers size={13} /> : <LayoutGrid size={13} />}
                  {coreMode ? t("sidebar.core_mode") : t("sidebar.extended_mode")}
                </span>
                <ChevronRight
                  size={12}
                  className={cn(
                    "text-[color:var(--ds-text-subtle)] transition-transform duration-200",
                    !coreMode && "rotate-180"
                  )}
                />
              </button>
              {openSections.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpenSections([])}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  aria-label={t("sidebar.collapse_all")}
                  title={t("sidebar.collapse_all")}
                >
                  <ChevronsDownUp size={14} aria-hidden />
                </button>
              )}
            </div>
          )}

          {/* Nav */}
          <nav
            className={cn("py-4", collapsed ? "px-2" : "px-3")}
            aria-label={t("sidebar.main_nav")}
          >
            {!hasResults && !collapsed && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("sidebar.no_results")} „{searchQuery}&quot;
                </p>
              </div>
            )}
            <div className={cn("space-y-0.5", collapsed && "hidden md:block")}>
              {filteredPrimaryItems.map((item) => {
                const index = primaryItems.findIndex((primary) => primary.href === item.href);
                const Icon = item.icon;
                const active = isActiveHref(pathname, item.href);
                const colorVar = primaryColorVars[index] ?? "--nav-cat-cases";
                const shortcut = `Alt+${index + 1}`;
                const tooltip = `${item.tooltipKey ? t(item.tooltipKey) : t(item.labelKey)} (${shortcut})`;
                return (
                  <Link
                    key={`primary-${item.href}`}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? t(item.labelKey) : undefined}
                    onClick={() => setMobileOpen(false)}
                    title={tooltip}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg text-[13px] font-semibold transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--ds-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface-2)] focus-visible:outline-none",
                      collapsed ? "h-11 justify-center px-0" : "h-11 px-3",
                      active
                        ? "brand-soft brand-text border-l-[3px] border-[color:var(--brand-primary)]"
                        : "text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                    )}
                  >
                    {collapsed && active && (
                      <span
                        className="absolute top-1/2 left-0 h-5 w-[2px] -translate-y-1/2 rounded-r-full"
                        style={{ backgroundColor: `var(${colorVar})` }}
                        aria-hidden
                      />
                    )}
                    <Icon
                      size={collapsed ? 18 : 15}
                      className="shrink-0 transition-[color,opacity] duration-150"
                      strokeWidth={active && collapsed ? 2.25 : 1.75}
                      style={{
                        color: active
                          ? `var(${colorVar})`
                          : `color-mix(in srgb, var(${colorVar}) 55%, var(--ds-text-muted))`,
                      }}
                    />
                    <span
                      className={cn(
                        "transition-[opacity,transform] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-panel)]",
                        collapsed
                          ? "pointer-events-none w-0 -translate-x-1 overflow-hidden opacity-0"
                          : "translate-x-0 opacity-100"
                      )}
                    >
                      {highlightMatch(t(item.labelKey), searchQuery)}
                    </span>
                    {!collapsed && badges[item.href] && (
                      <NavBadge
                        count={badges[item.href].count}
                        variant={badges[item.href].variant}
                        collapsed={false}
                      />
                    )}
                    {collapsed && badges[item.href] && (
                      <NavBadge
                        count={badges[item.href].count}
                        variant={badges[item.href].variant}
                        collapsed={true}
                        label={t(item.labelKey)}
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Matter-scoped navigation — shows when inside a matter page */}
            {!searchQuery.trim() && (
              <MatterSidebarSection collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
            )}

            {/* Quick access — pinned & recently visited matters */}
            {!searchQuery.trim() && (
              <SidebarQuickAccess collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
            )}

            {!collapsed && !searchQuery.trim() && recentItems.length > 0 && (
              <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
                <div className="mb-1 flex items-center gap-2 px-3 text-xs font-semibold text-[color:var(--ds-text-subtle)]">
                  <Clock size={13} aria-hidden />
                  <span>{t("sidebar.recent_functions")}</span>
                </div>
                <div className="space-y-0.5">
                  {recentItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={`recent-${item.href}`}
                        href={item.href}
                        onClick={() => {
                          trackRecent(item);
                          setMobileOpen(false);
                        }}
                        className="flex min-h-11 items-center gap-3 rounded-md px-3 text-[13px] font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
                      >
                        <Icon size={15} aria-hidden />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Collapsed: section-grouped icon list */}
            {collapsed && (
              <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
                {accordionSections.map((section, sectionIndex) => {
                  const sectionItems = section.items.filter(
                    (item) => !item.comingSoon && !primaryItems.some((p) => p.href === item.href)
                  );
                  if (sectionItems.length === 0) return null;
                  return (
                    <div
                      key={`collapsed-section-${section.titleKey}`}
                      className={cn(
                        "space-y-0.5 px-2",
                        sectionIndex > 0 && "mt-3 border-t border-[color:var(--ds-border)]/60 pt-3"
                      )}
                    >
                      {sectionItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActiveHref(pathname, item.href);
                        const catVar = section.colorVar ?? "--nav-cat-ops";
                        return (
                          <Link
                            key={`collapsed-${item.href}`}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            aria-label={t(item.labelKey)}
                            onClick={() => {
                              trackRecent(item);
                              setMobileOpen(false);
                            }}
                            title={item.tooltipKey ? t(item.tooltipKey) : t(item.labelKey)}
                            className={cn(
                              "group relative flex h-8 items-center justify-center rounded-lg text-[13px] transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--ds-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface-2)] focus-visible:outline-none",
                              active
                                ? "brand-soft brand-text border-l-[3px] border-[color:var(--brand-primary)]"
                                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                            )}
                          >
                            {active && (
                              <span
                                className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
                                style={{ backgroundColor: `var(${catVar})` }}
                                aria-hidden
                              />
                            )}
                            <Icon
                              size={18}
                              className="shrink-0 transition-[color] duration-150"
                              strokeWidth={active ? 2.25 : 1.75}
                              style={{
                                color: active
                                  ? `var(${catVar})`
                                  : `color-mix(in srgb, var(${catVar}) 55%, var(--ds-text-muted))`,
                              }}
                            />
                            {badges[item.href] && (
                              <NavBadge
                                count={badges[item.href].count}
                                variant={badges[item.href].variant}
                                collapsed={true}
                                label={t(item.labelKey)}
                              />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Expanded: accordion sections */}
            {!collapsed && (
              <div className="mt-4 space-y-2">
                {accordionSections.map((section) => {
                  const isOpen = openSections.includes(section.titleKey);
                  const sectionActive = section.items.some((item) =>
                    isActiveHref(pathname, item.href)
                  );
                  const SectionIcon = section.items[0]?.icon ?? FolderOpen;
                  const panelId = sectionDomId(section.titleKey);
                  const catVar = section.colorVar ?? "--nav-cat-ops";
                  return (
                    <div
                      key={section.titleKey}
                      className={cn(
                        "rounded-lg border transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-[var(--ds-ease-smooth)]",
                        section.titleKey.startsWith("nav.section.admin")
                          ? "border-[color:var(--ds-border)] bg-transparent"
                          : "border-transparent",
                        isOpen
                          ? "border-[color:var(--ds-border-hover)] bg-[color:var(--ds-surface-2)] shadow-sm"
                          : sectionActive
                            ? "brand-border brand-soft bg-[color:var(--ds-surface)]"
                            : "hover:bg-[color:var(--ds-hover)]"
                      )}
                    >
                      <button
                        type="button"
                        onClick={(event) => toggleSection(section.titleKey, event)}
                        className="group flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] font-semibold text-[color:var(--ds-text)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                      >
                        <SectionIcon
                          size={15}
                          className="shrink-0 transition-[color] duration-150 group-hover:[color:var(--ds-text)]"
                          style={{
                            color:
                              sectionActive || isOpen
                                ? `var(${catVar})`
                                : `color-mix(in srgb, var(${catVar}) 55%, var(--ds-text-muted))`,
                          }}
                        />
                        {/* Normal case (not uppercase/tracking-wider): at the old
                            220px sidebar width the long German section names truncated
                            into unreadable "MANDANTEN & K…" fragments. */}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight",
                            sectionActive || isOpen
                              ? "text-[color:var(--ds-text)]"
                              : "text-[color:var(--ds-text-muted)]"
                          )}
                          title={t(section.titleKey)}
                        >
                          {t(section.titleKey)}
                        </span>
                        {sectionActive && !isOpen && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: `var(${catVar})` }}
                            aria-hidden
                          />
                        )}
                        <ChevronDown
                          size={14}
                          className={cn(
                            "shrink-0 text-[color:var(--ds-text-subtle)] transition-transform duration-[220ms] ease-[var(--ds-ease-smooth)]",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                      {isOpen && section.descKey && (
                        <p className="px-3 pb-1 text-[11px] leading-tight text-[color:var(--ds-text-subtle)]">
                          {t(section.descKey)}
                        </p>
                      )}
                      <motion.div
                        id={panelId}
                        initial={false}
                        animate={{
                          height: isOpen ? "auto" : 0,
                          opacity: isOpen ? 1 : 0,
                        }}
                        transition={sidebarPanelTransition}
                        className="overflow-hidden"
                        aria-hidden={!isOpen}
                        {...(!isOpen ? { inert: true } : {})}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div
                            className="space-y-0.5 px-2 pb-2"
                            role="group"
                            aria-label={t(section.titleKey)}
                          >
                            {section.items.map((item, index) => {
                              const Icon = item.icon;
                              const itemCatVar = section.colorVar ?? "--nav-cat-ops";
                              if (item.comingSoon) {
                                return (
                                  <button
                                    key={item.href}
                                    disabled
                                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[color:var(--ds-text-subtle)] select-none"
                                    aria-disabled="true"
                                  >
                                    <Icon
                                      size={15}
                                      className="shrink-0 opacity-50"
                                      style={{
                                        color: `color-mix(in srgb, var(${itemCatVar}) 45%, var(--ds-text-subtle))`,
                                      }}
                                    />
                                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                      <span className="truncate">{t(item.labelKey)}</span>
                                      <span className="rounded border border-[color:var(--ds-border-strong)] px-1 py-0.5 text-xs font-semibold tracking-wide uppercase">
                                        {t("sidebar.coming_soon")}
                                      </span>
                                    </span>
                                  </button>
                                );
                              }
                              const active = isActiveHref(pathname, item.href);
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  aria-current={active ? "page" : undefined}
                                  onClick={() => {
                                    trackRecent(item);
                                    setMobileOpen(false);
                                  }}
                                  title={item.tooltipKey ? t(item.tooltipKey) : undefined}
                                  style={{ "--sidebar-item-index": index } as CSSProperties}
                                  className={cn(
                                    "sidebar-item-in relative flex h-8 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-[background-color,color,transform] duration-[120ms] ease-[var(--ds-ease-panel)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none active:scale-[0.99]",
                                    active
                                      ? "brand-soft brand-text font-semibold shadow-[0_0_10px_-2px_var(--brand-glow)]"
                                      : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                                  )}
                                >
                                  <Icon
                                    size={15}
                                    className="shrink-0 transition-[color] duration-150"
                                    style={{
                                      color: active
                                        ? `var(${itemCatVar})`
                                        : `color-mix(in srgb, var(${itemCatVar}) 55%, var(--ds-text-muted))`,
                                    }}
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {highlightMatch(t(item.labelKey), searchQuery)}
                                  </span>
                                  {badges[item.href] && (
                                    <NavBadge
                                      count={badges[item.href].count}
                                      variant={badges[item.href].variant}
                                      collapsed={false}
                                    />
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            )}
          </nav>

          {/* User profile section */}
          <div
            className={cn(
              "border-t border-[color:var(--ds-border)] pt-3 pb-3",
              collapsed ? "px-2" : "px-3"
            )}
          >
            <Link
              href="/dashboard/settings?tab=account"
              onClick={() => setMobileOpen(false)}
              title={collapsed ? (userName ?? t("sidebar.user")) : undefined}
              aria-label={`${t("sidebar.account_settings")}: ${userName ?? t("sidebar.user")}${userEmail ? `, ${userEmail}` : ""}`}
              className={cn(
                "group flex min-h-11 items-center rounded-lg transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                collapsed ? "justify-center px-0" : "gap-3 px-3 py-1.5"
              )}
            >
              <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
                {userName ? (
                  <span className="brand-text text-xs font-bold uppercase">
                    {userName.slice(0, 2)}
                  </span>
                ) : (
                  <User size={13} className="brand-text" />
                )}
              </div>
              <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
                <p className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                  {userName ?? t("sidebar.user")}
                </p>
                <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-subtle)]">
                  {userEmail ?? ""}
                </p>
              </div>
              {!collapsed && (
                <Settings
                  size={15}
                  className="shrink-0 text-[color:var(--ds-text-subtle)] transition-colors group-hover:text-[color:var(--ds-text)]"
                  aria-hidden
                />
              )}
            </Link>
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title={t("topbar.logout")}
              aria-label={t("topbar.logout")}
              className={cn(
                "mt-1 flex min-h-11 w-full items-center rounded-lg text-[13px] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none disabled:opacity-50",
                collapsed ? "justify-center" : "gap-3 px-3 py-2"
              )}
            >
              <LogOut size={15} aria-hidden />
              {!collapsed && <span>{t("topbar.logout")}</span>}
            </button>
          </div>
        </div>

        <div
          className={cn(
            "border-t border-[color:var(--ds-border)] py-3",
            collapsed ? "px-2" : "px-3"
          )}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse_aria")}
            aria-expanded={!collapsed}
            className={cn(
              "hidden w-full items-center gap-3 rounded-lg text-[13px] text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:flex",
              collapsed ? "h-9 justify-center px-0" : "px-3 py-2"
            )}
          >
            {collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={16} />
                <span>{t("sidebar.collapse")}</span>
              </>
            )}
          </button>
        </div>
        {!collapsed && isDesktop && (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- WAI-ARIA separator/slider pattern (drag-to-resize), keyboard-focusable via tabIndex/aria-orientation below.
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("sidebar.resize")}
            tabIndex={0}
            aria-valuenow={expandedWidth}
            aria-valuemin={200}
            aria-valuemax={320}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            className="absolute inset-y-0 right-0 z-50 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-[color:var(--brand-primary)] focus:bg-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
        )}
      </div>
    </motion.aside>
  );
});
