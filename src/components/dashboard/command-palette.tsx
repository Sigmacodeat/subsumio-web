"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import type { DashboardKey } from "@/content/dashboard";
import { ALL_NAV_ITEMS, PREFERRED_SECTION_BY_HREF } from "@/components/dashboard/sidebar";

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
  "precedent-search": "nav.precedent_search",
  translate: "nav.translate",
  rechtsprechung: "nav.rechtsprechung",
  norms: "nav.norms",
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
  "adoption-analytics": "nav.adoption_analytics",
  analytics: "nav.analytics",
  "shared-spaces": "nav.shared_spaces",
};

const CMD_SECTION_KEYS: Record<string, DashboardKey> = {
  "nav.section.cockpit": "nav.section.cockpit",
  "nav.section.cases_clients": "nav.section.cases_clients",
  "nav.section.inbox_deadlines": "nav.section.inbox_deadlines",
  "nav.section.documents_drafting": "nav.section.documents_drafting",
  "nav.section.research_knowledge": "nav.section.research_knowledge",
  "nav.section.billing_compliance": "nav.section.billing_compliance",
  "nav.section.communication": "nav.section.communication",
  "nav.section.operations": "nav.section.operations",
  Verwaltung: "cmd.section.admin",
};

const NAV_COMMANDS: CommandItem[] = (() => {
  const seen = new Set<string>();
  const commands: CommandItem[] = [];
  for (const item of ALL_NAV_ITEMS) {
    if (item.comingSoon || seen.has(item.href)) continue;
    seen.add(item.href);
    const sectionEntry = PREFERRED_SECTION_BY_HREF.find((p) => p.href === item.href);
    const section = sectionEntry?.section ?? "nav.section.admin";
    commands.push({
      id: item.href.replace(/^\/dashboard\/?/, "") || "dashboard",
      label: item.labelKey,
      labelKey: item.labelKey,
      icon: item.icon,
      href: item.href,
      section,
      sectionKey: section,
    });
  }
  return commands;
})();

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onToggleTheme?: () => void;
  onToggleSidebar?: () => void;
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
}: CommandPaletteProps) {
  const router = useRouter();
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { reduceMotion, panelTransition, modalInitial, modalAnimate, modalExit } =
    useDashboardMotion();
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
    const cmds: CommandItem[] = [...NAV_COMMANDS];
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
  }, [onToggleTheme, onToggleSidebar, t]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

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

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const cmd of filtered) {
      const arr = map.get(cmd.section) ?? [];
      arr.push(cmd);
      map.set(cmd.section, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

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
