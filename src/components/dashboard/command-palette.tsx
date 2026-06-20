"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Network,
  Upload,
  Settings,
  Bot,
  Sparkles,
  Gavel,
  Briefcase,
  Users,
  ShieldCheck,
  FolderOpen,
  CalendarClock,
  Swords,
  UserCircle,
  Globe,
  Landmark,
  RefreshCw,
  ShieldAlert,
  Table2,
  Bell,
  PenTool,
  Scale,
  FileText,
  FileSpreadsheet,
  FileSignature,
  Plug,
  Mail,
  Archive,
  EyeOff,
  ScrollText,
  CreditCard,
  Smartphone,
  Building2,
  Shield,
  Key,
  BarChart3,
  Zap,
  CornerDownLeft,
  ClipboardList,
  Sun,
  PanelLeft,
  Keyboard,
  LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  href?: string;
  action?: () => void;
  section: string;
  keywords?: string;
}

const COMMANDS: CommandItem[] = [
  // Gehirn
  { id: "dashboard", label: "Übersicht", icon: LayoutDashboard, href: "/dashboard", section: "Gehirn" },
  { id: "assistant", label: "Assistant", icon: Bot, href: "/dashboard/assistant", section: "Gehirn" },
  { id: "query", label: "Brain fragen", icon: MessageSquare, href: "/dashboard/query", section: "Gehirn", keywords: "search ask question" },
  { id: "agents", label: "Agenten", icon: Sparkles, href: "/dashboard/agents", section: "Gehirn" },
  { id: "approvals", label: "Freigaben", icon: Gavel, href: "/dashboard/approvals", section: "Gehirn" },
  { id: "brain", label: "Brain erkunden", icon: BookOpen, href: "/dashboard/brain", section: "Gehirn", keywords: "pages entities" },
  { id: "graph", label: "Graph ansehen", icon: Network, href: "/dashboard/graph", section: "Gehirn", keywords: "knowledge network edges" },
  { id: "upload", label: "Dokument hochladen", icon: Upload, href: "/dashboard/upload", section: "Gehirn", keywords: "file import pdf" },
  { id: "rag-eval", label: "RAG-Eval", icon: BarChart3, href: "/dashboard/rag-eval", section: "Gehirn", keywords: "evaluation metrics" },

  // Akten & Fristen
  { id: "cases", label: "Akten", icon: Briefcase, href: "/dashboard/cases", section: "Akten & Fristen", keywords: "matters" },
  { id: "contacts", label: "Kontakte", icon: Users, href: "/dashboard/contacts", section: "Akten & Fristen", keywords: "people clients" },
  { id: "contracts", label: "Verträge", icon: ShieldCheck, href: "/dashboard/contracts", section: "Akten & Fristen" },
  { id: "playbooks", label: "Playbooks", icon: ClipboardList, href: "/dashboard/playbooks", section: "Akten & Fristen", keywords: "contract review rules playbook" },
  { id: "vault", label: "Dokumenten-Vault", icon: FolderOpen, href: "/dashboard/vault", section: "Akten & Fristen", keywords: "documents files" },
  { id: "deadlines", label: "Fristen", icon: CalendarClock, href: "/dashboard/deadlines", section: "Akten & Fristen", keywords: "dates due" },
  { id: "opponents", label: "Gegner", icon: Swords, href: "/dashboard/opponents", section: "Akten & Fristen" },
  { id: "client-portal", label: "Mandanten-Portal", icon: UserCircle, href: "/dashboard/client-portal", section: "Akten & Fristen" },

  // Recherche
  { id: "research", label: "Legal Research", icon: Globe, href: "/dashboard/research", section: "Recherche" },
  { id: "rechtsprechung", label: "Rechtsprechung", icon: Landmark, href: "/dashboard/rechtsprechung", section: "Recherche", keywords: "judgments cases" },
  { id: "norms", label: "Normen", icon: BookOpen, href: "/dashboard/norms", section: "Recherche", keywords: "statutes laws" },
  { id: "judgements-sync", label: "Urteile-Sync", icon: RefreshCw, href: "/dashboard/judgements-sync", section: "Recherche" },
  { id: "kollisionspruefung", label: "Kollisionsprüfung", icon: ShieldAlert, href: "/dashboard/kollisionspruefung", section: "Recherche", keywords: "conflict check" },
  { id: "tabular-review", label: "Massen-Review", icon: Table2, href: "/dashboard/tabular-review", section: "Recherche" },
  { id: "monitoring", label: "Monitoring", icon: Bell, href: "/dashboard/monitoring", section: "Recherche" },

  // Schriftsätze & Abrechnung
  { id: "drafting", label: "Schriftsatz", icon: PenTool, href: "/dashboard/drafting", section: "Schriftsätze & Abrechnung", keywords: "draft writing" },
  { id: "cost-calculator", label: "Kostenrechner", icon: Scale, href: "/dashboard/cost-calculator", section: "Schriftsätze & Abrechnung" },
  { id: "invoicing", label: "Rechnungen", icon: FileText, href: "/dashboard/invoicing", section: "Schriftsätze & Abrechnung", keywords: "invoices billing" },
  { id: "datev-export", label: "DATEV-Export", icon: FileSpreadsheet, href: "/dashboard/datev-export", section: "Schriftsätze & Abrechnung" },
  { id: "signature", label: "e-Signatur", icon: FileSignature, href: "/dashboard/signature", section: "Schriftsätze & Abrechnung" },

  // Daten & Integration
  { id: "connectors", label: "Konnektoren", icon: Plug, href: "/dashboard/connectors", section: "Daten & Integration" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, href: "/dashboard/whatsapp", section: "Daten & Integration" },
  { id: "import-kanzlei", label: "Kanzlei-Import", icon: FileSpreadsheet, href: "/dashboard/import-kanzlei", section: "Daten & Integration" },
  { id: "bea", label: "beA", icon: Mail, href: "/dashboard/bea", section: "Daten & Integration" },
  { id: "email-import", label: "E-Mail-Import", icon: Mail, href: "/dashboard/email-import", section: "Daten & Integration" },
  { id: "calendar-export", label: "Kalender", icon: CalendarClock, href: "/dashboard/calendar-export", section: "Daten & Integration" },
  { id: "compliance", label: "Compliance", icon: ShieldCheck, href: "/dashboard/compliance", section: "Daten & Integration" },
  { id: "anonymize", label: "Anonymisierung", icon: EyeOff, href: "/dashboard/anonymize", section: "Daten & Integration" },
  { id: "verfahrensdoku", label: "Verfahrensdoku", icon: ScrollText, href: "/dashboard/verfahrensdoku", section: "Daten & Integration" },
  { id: "data-export", label: "Datenexport", icon: Archive, href: "/dashboard/data-export", section: "Daten & Integration" },

  // Verwaltung
  { id: "team", label: "Team", icon: Users, href: "/dashboard/team", section: "Verwaltung" },
  { id: "controlling", label: "Controlling", icon: BarChart3, href: "/dashboard/controlling", section: "Verwaltung" },
  { id: "api-keys", label: "API-Keys", icon: Key, href: "/dashboard/api-keys", section: "Verwaltung" },
  { id: "billing", label: "Abrechnung", icon: CreditCard, href: "/dashboard/billing", section: "Verwaltung" },
  { id: "mobile", label: "Mobile", icon: Smartphone, href: "/dashboard/mobile", section: "Verwaltung" },
  { id: "settings", label: "Settings", icon: Settings, href: "/dashboard/settings", section: "Verwaltung" },
  { id: "settings-kanzlei", label: "Kanzlei-Einstellungen", icon: Building2, href: "/dashboard/settings/kanzlei", section: "Verwaltung" },
  { id: "settings-security", label: "Sicherheit", icon: Shield, href: "/dashboard/settings/security", section: "Verwaltung" },
];

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

export function CommandPalette({ open, onClose, onToggleTheme, onToggleSidebar }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const recentIds = useMemo(() => loadRecent(), [open]);

  const allCommands = useMemo(() => {
    const cmds: CommandItem[] = [...COMMANDS];
    if (onToggleTheme) {
      cmds.push({ id: "action-toggle-theme", label: "Theme wechseln", icon: Sun, action: onToggleTheme, section: "Aktionen", keywords: "dark light theme mode farbe hell dunkel" });
    }
    if (onToggleSidebar) {
      cmds.push({ id: "action-toggle-sidebar", label: "Sidebar ein-/ausklappen", icon: PanelLeft, action: onToggleSidebar, section: "Aktionen", keywords: "collapse expand sidebar menu seitenleiste" });
    }
    cmds.push({ id: "action-refresh", label: "Daten aktualisieren", icon: RefreshCw, action: () => window.location.reload(), section: "Aktionen", keywords: "reload refresh neu laden aktualisieren" });
    cmds.push({ id: "help-docs", label: "Dokumentation", icon: BookOpen, href: "/docs", section: "Hilfe", keywords: "help docs manual anleitung doku" });
    cmds.push({ id: "help-shortcuts", label: "Tastaturkürzel anzeigen", icon: Keyboard, href: "/docs#shortcuts", section: "Hilfe", keywords: "keyboard shortcuts hotkeys tastatur" });
    cmds.push({ id: "help-support", label: "Support kontaktieren", icon: LifeBuoy, action: () => { window.location.href = "mailto:support@subsumio.com"; }, section: "Hilfe", keywords: "help contact support hilfe kontakt" });
    return cmds;
  }, [onToggleTheme, onToggleSidebar]);

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
      const haystack = `${cmd.label} ${cmd.section} ${cmd.keywords ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query, allCommands]);

  const recentItems = useMemo(() => {
    if (query.trim()) return [];
    return recentIds
      .map((id) => allCommands.find((cmd) => cmd.id === id))
      .filter((cmd): cmd is CommandItem => !!cmd);
  }, [recentIds, query, allCommands]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const cmd of filtered) {
      const arr = map.get(cmd.section) ?? [];
      arr.push(cmd);
      map.set(cmd.section, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const flatList = useMemo(() => [
    ...recentItems,
    ...grouped.flatMap(([, items]) => items),
  ], [grouped, recentItems]);

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
    [router, onClose],
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

  if (!open) return null;

  let runningIdx = -1;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl z-[101] px-4 md:px-0"
      >
        <div className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow-elevated overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-[color:var(--ds-border)]">
            <Search size={18} className="text-[color:var(--ds-text-subtle)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Seite suchen oder Aktion ausführen…"
              className="flex-1 bg-transparent text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
              aria-label="Command Palette Suche"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
            />
            <kbd className="text-[10px] font-mono text-[color:var(--ds-text-muted)] border border-[color:var(--ds-border)] rounded px-1.5 py-0.5 shrink-0">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2" id="command-list" role="listbox">
            {flatList.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Search size={22} className="text-[color:var(--ds-border-strong)] mx-auto mb-3" />
                <p className="text-sm text-[color:var(--ds-text-muted)]">Keine Treffer für „{query}{"\u201C"}</p>
              </div>
            ) : (
              <>
              {recentItems.length > 0 && !query.trim() && (
                <div className="mb-1.5">
                  <div className="px-4 py-1.5">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--ds-text-subtle)] font-semibold">
                      Zuletzt verwendet
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
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-lg mx-0",
                          isActive
                            ? "brand-soft brand-text"
                            : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]",
                        )}
                        role="option"
                        aria-selected={isActive}
                      >
                        <Icon size={16} className="shrink-0" />
                        <span className="text-sm font-medium flex-1">{cmd.label}</span>
                        {isActive && (
                          <CornerDownLeft size={14} className="text-[color:var(--ds-text-subtle)] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {grouped.map(([section, items]) => (
                <div key={section} className="mb-1.5">
                  <div className="px-4 py-1.5">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--ds-text-subtle)] font-semibold">
                      {section}
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
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-lg mx-0",
                          isActive
                            ? "brand-soft brand-text"
                            : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]",
                        )}
                        role="option"
                        aria-selected={isActive}
                      >
                        <Icon size={16} className="shrink-0" />
                        <span className="text-sm font-medium flex-1">{cmd.label}</span>
                        {cmd.hint && (
                          <span className="text-xs text-[color:var(--ds-text-subtle)]">{cmd.hint}</span>
                        )}
                        {isActive && (
                          <CornerDownLeft size={14} className="text-[color:var(--ds-text-subtle)] shrink-0" />
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
          <div className="flex items-center justify-between px-4 h-11 border-t border-[color:var(--ds-border)] text-[10px] text-[color:var(--ds-text-subtle)]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <kbd className="font-mono border border-[color:var(--ds-border)] rounded px-1 py-0.5">↑↓</kbd>
                navigieren
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="font-mono border border-[color:var(--ds-border)] rounded px-1 py-0.5">↵</kbd>
                öffnen
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="font-mono border border-[color:var(--ds-border)] rounded px-1 py-0.5">ESC</kbd>
                schließen
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Zap size={10} />
              {flatList.length} {flatList.length === 1 ? "Befehl" : "Befehle"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
