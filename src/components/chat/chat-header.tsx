"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  Trash2,
  Download,
  Plus,
  MessageSquareText,
  Briefcase,
  Scale,
  Activity,
  Search,
  X,
  Pin,
  Tag,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSelector } from "@/components/dashboard/model-selector";
import { useBrainStats } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import { QUERY_MODE_LABELS, type QueryMode } from "@/lib/matter-context-types";
import type { Jurisdiction, ThinkMode, ChatSession } from "@/components/chat/chat-types";

interface ChatHeaderProps {
  features: {
    modelSelector: boolean;
    modeSelector: boolean;
    caseSelector: boolean;
    jurisdictionSelector: boolean;
    brainStatus: boolean;
    tokenWidget: boolean;
    exportChat: boolean;
  };
  compact?: boolean;
  modelOverride?: string;
  onModelChange: (model: string | undefined) => void;
  queryMode: QueryMode;
  onQueryModeChange: (mode: QueryMode) => void;
  jurisdiction: Jurisdiction;
  onJurisdictionChange: (j: Jurisdiction) => void;
  cases: Array<{ slug: string; title: string }>;
  selectedCaseSlug: string;
  onCaseChange: (slug: string) => void;
  onClear: () => void;
  onExport: () => void;
  onShare?: () => void;
  onNewSession: () => void;
  sessionTokens: number;
  messageCount: number;
  sessions?: ChatSession[];
  activeSessionId?: string;
  onSelectSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onTagSession?: (id: string, tags: string[]) => void;
  sessionSearch?: string;
  onSessionSearchChange?: (q: string) => void;
}

const JURISDICTIONS: Array<{ value: Jurisdiction; label: string }> = [
  { value: "de", label: "DE" },
  { value: "at", label: "AT" },
  { value: "ch", label: "CH" },
  { value: "eu", label: "EU" },
];

export function ChatHeader(props: ChatHeaderProps) {
  const { t, lang } = useLang();
  const compact = props.compact ?? false;
  const statsQuery = useBrainStats();
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);

  const stats = statsQuery.data;

  // engine_reachable is the real signal (the proxy route timed out / errored
  // talking to the engine). Falling back to "any nonzero count" treats a
  // genuinely empty-but-healthy brain as offline, and can never detect an
  // engine outage that still returns a 200 with stale/fallback zeros.
  // "degraded" stays reserved for our own request failing outright
  // (statsQuery.isError) — `engine_reachable: false` is a clean "offline"
  // reading, not a degraded one.
  const brainOnline = stats?.engine_reachable === true;
  const brainDegraded = statsQuery.isError;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
      if (sessionsRef.current && !sessionsRef.current.contains(e.target as Node)) {
        setShowSessions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSessions = (props.sessions ?? []).filter((s) => {
    if (!props.sessionSearch) return true;
    return (
      s.title.toLowerCase().includes(props.sessionSearch.toLowerCase()) ||
      s.lastPreview?.toLowerCase().includes(props.sessionSearch.toLowerCase())
    );
  });

  return (
    <div className="border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      {/* Top row: title + actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
            <MessageSquareText size={16} className="text-[color:var(--ds-text-muted)]" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
              {t("chat.title")}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--ds-text-subtle)]">
              {props.features.brainStatus && !compact && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      brainDegraded ? "bg-amber-500" : brainOnline ? "bg-emerald-500" : "bg-red-500"
                    )}
                  />
                  {brainDegraded
                    ? t("chat.brain_degraded")
                    : brainOnline
                      ? t("chat.brain_online")
                      : t("chat.brain_offline")}
                </span>
              )}
              {props.messageCount > 0 && (
                <span>
                  {props.messageCount} {t("chat.session_count")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {props.onShare && props.messageCount > 0 && (
            <button
              onClick={props.onShare}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
              aria-label={t("chat.share")}
              title={t("chat.share_title")}
            >
              <Share2 size={14} />
            </button>
          )}
          {props.features.exportChat && props.messageCount > 0 && (
            <button
              onClick={props.onExport}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
              aria-label={t("chat.export")}
              title={t("chat.export")}
            >
              <Download size={14} />
            </button>
          )}
          {props.messageCount > 0 && (
            <button
              onClick={props.onClear}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600 active:scale-95"
              aria-label={t("chat.clear")}
              title={t("chat.clear")}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Controls row — unified toolbar track */}
      <div className="px-3 pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[color:var(--ds-surface-2)] p-1.5 max-md:gap-1">
          {/* Sessions dropdown */}
          {props.sessions && props.onSelectSession && (
            <div ref={sessionsRef} className="relative">
              <button
                onClick={() => setShowSessions((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-surface)] hover:text-[color:var(--ds-text)] active:scale-95"
              >
                <Plus size={12} />
                {props.activeSessionId ? t("chat.session_label") : t("chat.new_session")}
                <ChevronDown
                  size={11}
                  className={cn("transition-transform", showSessions && "rotate-180")}
                />
              </button>
              {showSessions && (
                <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-lg">
                  <div className="border-b border-[color:var(--ds-border)] p-2">
                    <button
                      onClick={() => {
                        props.onNewSession();
                        setShowSessions(false);
                      }}
                      className="brand-soft brand-text flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 active:scale-95"
                    >
                      <Plus size={13} />
                      {t("chat.new_session")}
                    </button>
                  </div>
                  {props.onSessionSearchChange && (
                    <div className="border-b border-[color:var(--ds-border)] p-2">
                      <div className="relative">
                        <Search
                          size={12}
                          className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                        />
                        <input
                          value={props.sessionSearch ?? ""}
                          onChange={(e) => props.onSessionSearchChange?.(e.target.value)}
                          placeholder={t("chat.search_sessions")}
                          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-1.5 pr-7 pl-8 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                        />
                        {props.sessionSearch && (
                          <button
                            onClick={() => props.onSessionSearchChange?.("")}
                            className="absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="max-h-64 overflow-y-auto p-1">
                    {filteredSessions.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-[color:var(--ds-text-subtle)]">
                        {t("chat.no_sessions")}
                      </p>
                    ) : (
                      filteredSessions.map((s) => (
                        <div
                          key={s.id}
                          className={cn(
                            "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[color:var(--ds-hover)]",
                            s.id === props.activeSessionId && "brand-soft"
                          )}
                        >
                          {s.pinned && (
                            <Pin size={10} className="brand-text shrink-0" fill="currentColor" />
                          )}
                          <button
                            onClick={() => {
                              props.onSelectSession?.(s.id);
                              setShowSessions(false);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                              {s.title}
                            </p>
                            <p className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                              {s.messageCount} {t("chat.session_count")} ·{" "}
                              {new Date(s.updatedAt).toLocaleDateString(
                                lang === "en" ? "en-GB" : "de-DE"
                              )}
                            </p>
                            {s.tags && s.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {s.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center gap-0.5 rounded bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text-subtle)]"
                                  >
                                    <Tag size={7} />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {props.onTogglePin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onTogglePin?.(s.id);
                                }}
                                className={cn(
                                  "text-[color:var(--ds-text-subtle)] opacity-0 transition-[opacity,color] duration-200 group-hover:opacity-100 hover:text-[color:var(--ds-text)]",
                                  s.pinned && "brand-text opacity-100"
                                )}
                                aria-label={s.pinned ? t("chat.unpin") : t("chat.pin")}
                                title={s.pinned ? t("chat.unpin") : t("chat.pin")}
                              >
                                <Pin size={11} fill={s.pinned ? "currentColor" : "none"} />
                              </button>
                            )}
                            {props.onDeleteSession && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onDeleteSession?.(s.id);
                                }}
                                className="text-[color:var(--ds-text-subtle)] opacity-0 transition-[opacity,color] duration-200 group-hover:opacity-100 hover:text-red-500"
                                aria-label={t("chat.confirm_delete_session")}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Case selector */}
          {props.features.caseSelector && (
            <div className="relative">
              <select
                value={props.selectedCaseSlug}
                onChange={(e) => props.onCaseChange(e.target.value)}
                className="appearance-none rounded-lg bg-transparent py-1.5 pr-7 pl-7 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-surface)] hover:text-[color:var(--ds-text)] focus:bg-[color:var(--ds-surface)] focus:outline-none"
                aria-label={t("chat.case_select")}
              >
                <option value="">{t("chat.no_case")}</option>
                {props.cases.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
              <Briefcase
                size={11}
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <ChevronDown
                size={11}
                className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
            </div>
          )}

          {/* Divider */}
          {props.features.caseSelector && props.features.jurisdictionSelector && !compact && (
            <div className="h-4 w-px bg-[color:var(--ds-border)]" aria-hidden />
          )}

          {/* Jurisdiction indicator — read-only, derived from case or user profile */}
          {props.features.jurisdictionSelector && !compact && (
            <div
              className="flex items-center gap-1 rounded-lg bg-[color:var(--ds-surface)] px-2 py-1 text-[11px] font-medium text-[color:var(--ds-text-muted)]"
              title={t("chat.jurisdiction_locked")}
            >
              <Scale size={10} className="text-[color:var(--ds-text-subtle)]" />
              {JURISDICTIONS.find((j) => j.value === props.jurisdiction)?.label ?? "DE"}
            </div>
          )}

          {/* Query mode selector */}
          {props.features.modeSelector && (
            <div ref={modeRef} className="relative">
              <button
                onClick={() => setShowModeMenu((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-surface)] hover:text-[color:var(--ds-text)] active:scale-95"
              >
                <Activity size={11} />
                {QUERY_MODE_LABELS[props.queryMode].label}
                <ChevronDown
                  size={11}
                  className={cn("transition-transform", showModeMenu && "rotate-180")}
                />
              </button>
              {showModeMenu && (
                <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1.5 shadow-lg">
                  {(Object.keys(QUERY_MODE_LABELS) as QueryMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        props.onQueryModeChange(mode);
                        setShowModeMenu(false);
                      }}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[color:var(--ds-hover)]",
                        props.queryMode === mode && "brand-soft"
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium",
                          props.queryMode === mode ? "brand-text" : "text-[color:var(--ds-text)]"
                        )}
                      >
                        {QUERY_MODE_LABELS[mode].label}
                      </span>
                      <span className="text-xs text-[color:var(--ds-text-subtle)]">
                        {QUERY_MODE_LABELS[mode].description}
                      </span>
                      <span className="text-[10px] text-[color:var(--ds-text-subtle)] opacity-70">
                        {QUERY_MODE_LABELS[mode].hint}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Model selector — hidden in compact mode */}
          {props.features.modelSelector && !compact && (
            <ModelSelector selectedModelId={props.modelOverride} onSelect={props.onModelChange} />
          )}
        </div>
      </div>
    </div>
  );
}
