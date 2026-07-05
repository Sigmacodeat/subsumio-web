"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { SearchResult } from "@/lib/types";
import {
  Archive,
  Search,
  BookOpen,
  RefreshCw,
  Zap,
  CornerDownLeft,
  Sun,
  PanelLeft,
  Keyboard,
  LifeBuoy,
  Briefcase,
  CalendarClock,
  FileText,
  Upload,
  MessageSquareText,
  Brain,
  Network,
  Database,
  GitCompare,
  FileSignature,
  Library,
  Share2,
  Users,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import type { DashboardKey } from "@/content/dashboard";
import { navForIndustry } from "@/components/dashboard/sidebar";
import { tracking } from "@/lib/tracking";

interface CommandItem {
  id: string;
  label: string;
  labelKey?: DashboardKey;
  hint?: string;
  icon: typeof Search;
  href?: string;
  action?: () => void;
  section: string;
  sectionKey?: DashboardKey;
  keywords?: string;
}

const CMD_LABEL_KEYS: Record<string, DashboardKey> = {
  // Akten & Fristen
  cases: "nav.cases",
  contacts: "nav.contacts",
  contracts: "nav.contracts",
  playbooks: "nav.playbooks",
  "process-strategy": "nav.process_strategy",
  vault: "nav.vault",
  deadlines: "nav.deadlines",
  opponents: "nav.opponents",
  "client-portal": "nav.client_portal",
  // Recherche
  research: "nav.legal_research",
  analyze: "nav.analyze",
  "deep-analysis": "nav.deep_analysis",
  translate: "nav.translate",
  "judgements-sync": "nav.judgements_sync",
  kollisionspruefung: "nav.kollisionspruefung",
  "tabular-review": "nav.tabular_review",
  "obligation-tracking": "nav.obligation_tracking",
  "case-scanner": "nav.case_scanner",
  "clause-library": "nav.clause_library",
  "review-queue": "nav.review_queue",
  "version-history": "nav.version_history",
  monitoring: "nav.monitoring",
  sources: "nav.sources",
  // Schriftsätze & Abrechnung
  drafting: "nav.drafting",
  "cost-calculator": "nav.cost_calculator",
  invoicing: "nav.invoicing",
  "datev-export": "nav.datev_export",
  signature: "nav.signature",
  // Daten & Integration
  connectors: "nav.connectors",
  whatsapp: "nav.whatsapp",
  intake: "nav.intake",
  "document-requests": "nav.document_requests",
  "import-kanzlei": "nav.import_kanzlei",
  bea: "nav.bea",
  "email-import": "nav.email_import",
  "calendar-export": "nav.calendar_export",
  compliance: "nav.compliance",
  retention: "nav.retention",
  anonymize: "nav.anonymize",
  "word-addin": "nav.word_addin",
  verfahrensdoku: "nav.verfahrensdoku",
  "data-export": "nav.data_export",
  // Verwaltung
  team: "nav.team",
  audit: "nav.audit_log",
  controlling: "nav.controlling",
  "api-keys": "nav.api_keys",
  billing: "nav.billing",
  mobile: "nav.mobile",
  settings: "nav.settings",
  "settings-kanzlei": "nav.kanzlei",
  "settings-security": "nav.security",
  "settings-ai-model": "nav.ai_model",
  "portfolio-insights": "nav.portfolio_insights",
  "shared-spaces": "nav.shared_spaces",
  "outbound-register": "nav.outbound_register",
  "power-of-attorney": "nav.power_of_attorney",
  "fao-tracking": "nav.fao_tracking",
  dictation: "nav.dictation",
  kyc: "nav.kyc",
  absences: "nav.absences",
  "kanzlei-tools": "nav.kanzlei_tools",
  "ethical-wall": "nav.ethical_wall",
  webhooks: "nav.webhooks",
  "time-suggestions": "nav.time_suggestions",
  commentaries: "nav.commentaries",
  autonomous: "nav.autonomous",
  "red-team": "nav.red_team",
  "document-interviews": "nav.document_interviews",
  "court-analytics": "nav.court_analytics",
  "online-booking": "nav.online_booking",
  "bulk-cases": "nav.bulk_cases",
  "fee-agreements": "nav.fee_agreements",
  "claim-account": "nav.claim_account",
  time: "nav.time",
};

const CMD_SECTION_KEYS: Record<string, DashboardKey> = {
  "nav.section.cockpit": "nav.section.cockpit",
  "nav.section.clients_comm": "nav.section.clients_comm",
  "nav.section.docs_drafting": "nav.section.docs_drafting",
  "nav.section.contracts": "nav.section.contracts",
  "nav.section.knowledge": "nav.section.knowledge",
  "nav.section.litigation": "nav.section.litigation",
  "nav.section.billing": "nav.section.billing",
  "nav.section.firm_ops": "nav.section.firm_ops",
  "nav.section.compliance": "nav.section.compliance",
  "nav.section.billing_ops": "nav.section.billing_ops",
  "nav.section.inbox_deadlines": "nav.section.inbox_deadlines",
  Verwaltung: "cmd.section.admin",
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onToggleTheme?: () => void;
  onToggleSidebar?: () => void;
  industry?: string | null;
  /** User role — non-admins don't see admin-only routes (mirrors sidebar trim). */
  role?: string | null;
}

const RECENT_KEY = "subsumio:cmd_recent";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(id: string) {
  try {
    const recent = loadRecent().filter((r) => r !== id);
    recent.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {}
}

export function CommandPalette({
  open,
  onClose,
  onToggleTheme,
  onToggleSidebar,
  industry,
  role,
}: CommandPaletteProps) {
  const router = useRouter();
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [fedResults, setFedResults] = useState<{
    cases: SearchResult[];
    contacts: SearchResult[];
    deadlines: SearchResult[];
    documents: SearchResult[];
  }>({ cases: [], contacts: [], deadlines: [], documents: [] });
  // Value intentionally unused for now — state drives future loading UI.
  const [_searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { reduceMotion, panelTransition, modalInitial, modalAnimate, modalExit } =
    useDashboardMotion();

  const navCommands = useMemo(() => {
    const cfg = navForIndustry(industry);
    const isAdmin = role === "admin";
    // Mirror the sidebar's role trim: non-admins only see admin-section items
    // that are also bottom items (settings, team, audit, directory).
    const adminOnlyHrefs = new Set(
      cfg.adminSection.items
        .filter((item) => !cfg.bottomItems.some((b) => b.href === item.href))
        .map((item) => item.href)
    );
    const seen = new Set<string>();
    const commands: CommandItem[] = [];
    for (const item of cfg.allNavItems) {
      if (item.comingSoon || seen.has(item.href)) continue;
      if (!isAdmin && adminOnlyHrefs.has(item.href)) continue;
      seen.add(item.href);
      const sectionEntry = cfg.preferredSectionByHref.find((p) => p.href === item.href);
      const section = sectionEntry?.section ?? "nav.section.admin";
      commands.push({
        id: item.href.replace(/^\/dashboard\/?/, "") || "dashboard",
        label: item.labelKey,
        labelKey: item.labelKey,
        icon: item.icon,
        href: item.href,
        section,
        sectionKey: section,
        keywords: item.keywords,
      });
    }
    // Legal-only routes that live outside the sidebar but must stay findable.
    if (industry !== "tax") {
      commands.push({
        id: "altlasten",
        label: "nav.altlasten",
        labelKey: "nav.altlasten",
        icon: Archive,
        href: "/dashboard/altlasten",
        section: "nav.section.clients_comm",
        sectionKey: "nav.section.clients_comm",
        keywords: "bestandsakten altlasten backlog alte akten archiv legacy",
      });
    }
    return commands;
  }, [industry, role]);
  const resolveLabel = useCallback(
    (cmd: CommandItem) => {
      if (cmd.labelKey) return t(cmd.labelKey);
      const key = CMD_LABEL_KEYS[cmd.id];
      if (key) return t(key);
      return cmd.label;
    },
    [t]
  );

  const resolveSection = useCallback(
    (section: string) => {
      const key = CMD_SECTION_KEYS[section];
      if (key) return t(key);
      return section;
    },
    [t]
  );

  const allCommands = useMemo(() => {
    const cmds: CommandItem[] = [...navCommands];
    if (onToggleTheme) {
      cmds.push({
        id: "action-toggle-theme",
        label: t("cmd.action.theme"),
        icon: Sun,
        action: onToggleTheme,
        section: t("cmd.section.admin"),
        keywords: "dark light theme mode farbe hell dunkel",
      });
    }
    if (onToggleSidebar) {
      cmds.push({
        id: "action-toggle-sidebar",
        label: t("cmd.action.sidebar"),
        icon: PanelLeft,
        action: onToggleSidebar,
        section: t("cmd.section.admin"),
        keywords: "collapse expand sidebar menu seitenleiste",
      });
    }
    cmds.push({
      id: "action-refresh",
      label: t("cmd.action.refresh"),
      icon: RefreshCw,
      action: () => window.location.reload(),
      section: t("cmd.section.admin"),
      keywords: "reload refresh neu laden aktualisieren",
    });
    cmds.push({
      id: "assistant",
      label: t("cmd.action.assistant"),
      icon: MessageSquareText,
      href: "/dashboard/chat",
      section: t("cmd.section.actions"),
      keywords: "chat assistant fragen fragebot",
    });
    cmds.push({
      id: "create-case",
      label: t("cmd.action.new_case"),
      icon: Briefcase,
      action: () => {
        window.dispatchEvent(new CustomEvent("subsumio:create-case"));
      },
      section: t("cmd.section.create"),
      keywords: "neue akte mandant fall matter create",
    });
    cmds.push({
      id: "create-deadline",
      label: t("cmd.action.new_deadline"),
      icon: CalendarClock,
      action: () => {
        window.dispatchEvent(new CustomEvent("subsumio:create-deadline"));
      },
      section: t("cmd.section.create"),
      keywords: "neue frist termin deadline create",
    });
    cmds.push({
      id: "create-invoice",
      label: t("cmd.action.new_invoice"),
      icon: FileText,
      action: () => {
        window.dispatchEvent(new CustomEvent("subsumio:create-invoice"));
      },
      section: t("cmd.section.create"),
      keywords: "neue rechnung invoice create",
    });
    cmds.push({
      id: "create-contract",
      label: t("cmd.action.new_contract"),
      icon: FileText,
      action: () => {
        window.dispatchEvent(new CustomEvent("subsumio:create-contract"));
      },
      section: t("cmd.section.create"),
      keywords: "neuer vertrag contract create",
    });
    cmds.push({
      id: "create-space",
      label: t("cmd.action.new_space" as DashboardKey),
      icon: Share2,
      action: () => {
        window.dispatchEvent(new CustomEvent("subsumio:create-space"));
      },
      section: t("cmd.section.create"),
      keywords: "shared space kollaboration create",
    });
    cmds.push({
      id: "create-signature",
      label: t("cmd.action.new_signature" as DashboardKey),
      icon: FileSignature,
      action: () => {
        window.dispatchEvent(new CustomEvent("subsumio:create-signature"));
      },
      section: t("cmd.section.create"),
      keywords: "unterschrift signature sign create",
    });
    cmds.push({
      id: "create-clause",
      label: t("cmd.action.new_clause" as DashboardKey),
      icon: Library,
      action: () => {
        window.dispatchEvent(new CustomEvent("subsumio:create-clause"));
      },
      section: t("cmd.section.create"),
      keywords: "klausel clause bibliothek create",
    });
    cmds.push({
      id: "upload-document",
      label: t("cmd.action.upload"),
      icon: Upload,
      href: "/dashboard/upload",
      section: t("cmd.section.create"),
      keywords: "upload dokument hochladen datei",
    });
    cmds.push({
      id: "help-docs",
      label: t("cmd.action.help.docs"),
      icon: BookOpen,
      href: "/docs",
      section: t("cmd.section.admin"),
      keywords: "help docs manual anleitung doku",
    });
    cmds.push({
      id: "help-shortcuts",
      label: t("cmd.action.help.shortcuts"),
      icon: Keyboard,
      action: () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
      },
      section: t("cmd.section.admin"),
      keywords: "keyboard shortcuts hotkeys tastatur",
    });
    cmds.push({
      id: "help-support",
      label: t("cmd.action.help.support"),
      icon: LifeBuoy,
      action: () => {
        window.location.href = "mailto:support@subsumio.com";
      },
      section: t("cmd.section.admin"),
      keywords: "help contact support hilfe kontakt",
    });
    cmds.push({
      id: "power-brain",
      label: "Brain — Wissensbasis-Explorer",
      icon: Brain,
      href: "/dashboard/brain",
      section: t("cmd.section.admin"),
      keywords: "brain knowledge base explorer wissensbasis seiten",
    });
    cmds.push({
      id: "power-graph",
      label: "Graph — Entitäts-Netzwerk",
      icon: Network,
      href: "/dashboard/graph",
      section: t("cmd.section.admin"),
      keywords: "graph entity network entitäten netzwerk beziehungen",
    });
    cmds.push({
      id: "power-sources",
      label: "Sources — Quellen-Verwaltung",
      icon: Database,
      href: "/dashboard/sources",
      section: t("cmd.section.admin"),
      keywords: "sources connectors datenquellen source management",
    });
    cmds.push({
      id: "power-model-compare",
      label: "Model Compare — KI-Modelle vergleichen",
      icon: GitCompare,
      href: "/dashboard/chat/compare",
      section: t("cmd.section.admin"),
      keywords: "model compare ai models vergleiche benchmark evaluation",
    });
    return cmds;
  }, [navCommands, onToggleTheme, onToggleSidebar, t]);

  useEffect(() => {
    if (open) {
      tracking.features.commandPaletteOpened();
      setQuery("");
      setActiveIndex(0);
      setSearchResults([]);
      setFedResults({ cases: [], contacts: [], deadlines: [], documents: [] });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Federated search: fetch brain pages + cases + contacts + deadlines + documents in parallel
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setFedResults({ cases: [], contacts: [], deadlines: [], documents: [] });
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const q = query.trim();
      try {
        const [brainRes, casesRes, contactsRes, deadlinesRes, docsRes] = await Promise.allSettled([
          api.brain.search(q, 8),
          api.search(q, 5, "case"),
          api.search(q, 5, "contact"),
          api.search(q, 5, "deadline"),
          api.search(q, 5, "document"),
        ]);
        setSearchResults(brainRes.status === "fulfilled" ? brainRes.value : []);
        setFedResults({
          cases: casesRes.status === "fulfilled" ? casesRes.value : [],
          contacts: contactsRes.status === "fulfilled" ? contactsRes.value : [],
          deadlines: deadlinesRes.status === "fulfilled" ? deadlinesRes.value : [],
          documents: docsRes.status === "fulfilled" ? docsRes.value : [],
        });
      } catch {
        setSearchResults([]);
        setFedResults({ cases: [], contacts: [], deadlines: [], documents: [] });
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase().trim();
    return allCommands.filter((cmd) => {
      const haystack =
        `${resolveLabel(cmd)} ${resolveSection(cmd.section)} ${cmd.label} ${cmd.section} ${cmd.keywords ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query, allCommands, resolveLabel, resolveSection]);

  const recentItems = useMemo(() => {
    if (query.trim()) return [];
    const recentIds = open ? loadRecent() : [];
    return recentIds
      .map((id) => allCommands.find((cmd) => cmd.id === id))
      .filter((cmd): cmd is CommandItem => !!cmd);
  }, [open, query, allCommands]);

  const searchCommands = useMemo<CommandItem[]>(() => {
    if (!query.trim() || searchResults.length === 0) return [];
    return searchResults.map((r) => ({
      id: `search-${r.slug}`,
      label: r.title,
      icon: Search,
      href: `/dashboard/brain/${encodeURIComponent(r.slug)}`,
      section: t("cmd.recent"),
      keywords: r.snippet,
    }));
  }, [query, searchResults, t]);

  const fedCommands = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return [];
    const cmds: CommandItem[] = [];
    for (const r of fedResults.cases) {
      cmds.push({
        id: `fed-case-${r.slug}`,
        label: r.title,
        icon: Briefcase,
        href: `/dashboard/cases/${encodeURIComponent(r.slug)}`,
        section: t("nav.cases"),
        keywords: r.snippet,
      });
    }
    for (const r of fedResults.contacts) {
      cmds.push({
        id: `fed-contact-${r.slug}`,
        label: r.title,
        icon: Users,
        href: `/dashboard/contacts`,
        section: t("nav.contacts"),
        keywords: r.snippet,
      });
    }
    for (const r of fedResults.deadlines) {
      cmds.push({
        id: `fed-deadline-${r.slug}`,
        label: r.title,
        icon: CalendarClock,
        href: `/dashboard/deadlines`,
        section: t("nav.deadlines"),
        keywords: r.snippet,
      });
    }
    for (const r of fedResults.documents) {
      cmds.push({
        id: `fed-doc-${r.slug}`,
        label: r.title,
        icon: FolderOpen,
        href: `/dashboard/vault`,
        section: t("nav.vault"),
        keywords: r.snippet,
      });
    }
    return cmds;
  }, [query, fedResults, t]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    // Federated search results first (cases, contacts, deadlines)
    const fedBySection = new Map<string, CommandItem[]>();
    for (const cmd of fedCommands) {
      const arr = fedBySection.get(cmd.section) ?? [];
      arr.push(cmd);
      fedBySection.set(cmd.section, arr);
    }
    for (const [section, items] of fedBySection) {
      map.set(section, items);
    }
    // Brain search results
    if (searchCommands.length > 0) {
      map.set(t("cmd.recent"), searchCommands);
    }
    for (const cmd of filtered) {
      const arr = map.get(cmd.section) ?? [];
      arr.push(cmd);
      map.set(cmd.section, arr);
    }
    // "Ask Copilot" fallback — always last when there's a non-trivial query
    if (query.trim().length >= 2) {
      map.set(t("cmd.ask_copilot") || "Copilot fragen", [
        {
          id: "ask-copilot-fallback",
          label: `${t("cmd.ask_copilot") || "Copilot fragen"}: „${query.trim()}“`,
          icon: MessageSquareText,
          href: `/dashboard/chat?q=${encodeURIComponent(query.trim())}`,
          section: t("cmd.ask_copilot") || "Copilot fragen",
          keywords: query.trim(),
        },
      ]);
    }
    return Array.from(map.entries());
  }, [filtered, searchCommands, fedCommands, t, query]);

  const flatList = useMemo(
    () => [...recentItems, ...grouped.flatMap(([, items]) => items)],
    [grouped, recentItems]
  );

  const navigate = useCallback(
    (cmd: CommandItem) => {
      saveRecent(cmd.id);
      if (cmd.action) {
        cmd.action();
        onClose();
      } else if (cmd.href) {
        router.push(cmd.href);
        onClose();
      }
    },
    [router, onClose]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = flatList[activeIndex];
        if (cmd) navigate(cmd);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        // Focus-trap: keep Tab within the palette
        e.preventDefault();
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const els = Array.from(focusable);
        const currentIdx = els.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey) {
          els[(currentIdx - 1 + els.length) % els.length].focus();
        } else {
          els[(currentIdx + 1) % els.length].focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeIndex, flatList, navigate, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let runningIdx = -1;

  return (
    <AnimatePresence initial={false}>
      {open && [
        <motion.div
          key="command-palette-overlay"
          className="fixed inset-0 z-[100] bg-black/50"
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{
            opacity: 1,
            backdropFilter: reduceMotion ? "blur(0px)" : "blur(8px)",
          }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={panelTransition}
          onClick={onClose}
          aria-hidden="true"
        />,
        <motion.div
          key="command-palette-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("cmd.search_aria")}
          className="fixed top-[20%] left-1/2 z-[101] w-full max-w-xl -translate-x-1/2 px-4 md:px-0"
          initial={modalInitial}
          animate={modalAnimate}
          exit={modalExit}
          transition={panelTransition}
        >
          <div className="card-shadow-elevated overflow-hidden rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            {/* Search input */}
            <div className="flex h-14 items-center gap-3 border-b border-[color:var(--ds-border)] px-4">
              <Search size={18} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder={t("cmd.placeholder")}
                className="flex-1 bg-transparent text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
                aria-label={t("cmd.search_aria")}
                role="combobox"
                aria-expanded="true"
                aria-controls="command-list"
              />
              <kbd className="shrink-0 rounded border border-[color:var(--ds-border)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--ds-text-muted)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[60vh] overflow-y-auto py-2"
              id="command-list"
              role="listbox"
            >
              {flatList.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Search size={22} className="mx-auto mb-3 text-[color:var(--ds-border-strong)]" />
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    {t("cmd.no_results")} „{query}
                    {"\u201C"}
                  </p>
                </div>
              ) : (
                <>
                  {recentItems.length > 0 && !query.trim() && (
                    <div className="mb-1.5">
                      <div className="px-4 py-1.5">
                        <span className="text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                          {t("cmd.recent")}
                        </span>
                      </div>
                      {recentItems.map((cmd) => {
                        runningIdx++;
                        const idx = runningIdx;
                        const Icon = cmd.icon;
                        const isActive = idx === activeIndex;
                        return (
                          <button
                            key={`recent-${cmd.id}`}
                            data-idx={idx}
                            onClick={() => navigate(cmd)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={cn(
                              "mx-0 flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors",
                              isActive
                                ? "brand-soft brand-text"
                                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                            )}
                            role="option"
                            aria-selected={isActive}
                          >
                            <Icon size={16} className="shrink-0" />
                            <span className="flex-1 text-sm font-medium">{resolveLabel(cmd)}</span>
                            {isActive && (
                              <CornerDownLeft
                                size={14}
                                className="shrink-0 text-[color:var(--ds-text-subtle)]"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {grouped.map(([section, items]) => (
                    <div key={section} className="mb-1.5">
                      <div className="px-4 py-1.5">
                        <span className="text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                          {resolveSection(section)}
                        </span>
                      </div>
                      {items.map((cmd) => {
                        runningIdx++;
                        const idx = runningIdx;
                        const Icon = cmd.icon;
                        const isActive = idx === activeIndex;
                        return (
                          <button
                            key={cmd.id}
                            data-idx={idx}
                            onClick={() => navigate(cmd)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={cn(
                              "mx-0 flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors",
                              isActive
                                ? "brand-soft brand-text"
                                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                            )}
                            role="option"
                            aria-selected={isActive}
                          >
                            <Icon size={16} className="shrink-0" />
                            <span className="flex-1 text-sm font-medium">{resolveLabel(cmd)}</span>
                            {cmd.hint && (
                              <span className="text-xs text-[color:var(--ds-text-subtle)]">
                                {cmd.hint}
                              </span>
                            )}
                            {isActive && (
                              <CornerDownLeft
                                size={14}
                                className="shrink-0 text-[color:var(--ds-text-subtle)]"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex h-11 items-center justify-between border-t border-[color:var(--ds-border)] px-4 text-xs text-[color:var(--ds-text-subtle)]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-[color:var(--ds-border)] px-1 py-0.5 font-mono">
                    ↑↓
                  </kbd>
                  {t("cmd.navigate")}
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-[color:var(--ds-border)] px-1 py-0.5 font-mono">
                    ↵
                  </kbd>
                  {t("cmd.open")}
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-[color:var(--ds-border)] px-1 py-0.5 font-mono">
                    ESC
                  </kbd>
                  {t("cmd.close")}
                </span>
              </div>
              <span className="flex items-center gap-1">
                <Zap size={10} />
                {flatList.length}{" "}
                {flatList.length === 1 ? t("cmd.command_single") : t("cmd.command_plural")}
              </span>
            </div>
          </div>
        </motion.div>,
      ]}
    </AnimatePresence>
  );
}
