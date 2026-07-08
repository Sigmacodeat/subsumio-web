"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Trash2,
  Download,
  Plus,
  MessageSquareText,
  Briefcase,
  X,
  Pin,
  Tag,
  Share2,
  MoreVertical,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useBrainStats } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import { type QueryMode } from "@/lib/matter-context-types";
import type { Jurisdiction, ChatSession } from "@/components/chat/chat-types";

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
  trailingActions?: ReactNode;
}

export function ChatHeader(props: ChatHeaderProps) {
  const { t, lang } = useLang();
  const statsQuery = useBrainStats();
  const [showSessions, setShowSessions] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [activeCaseSlug, setActiveCaseSlug] = useState(props.selectedCaseSlug);
  useEffect(() => setActiveCaseSlug(props.selectedCaseSlug), [props.selectedCaseSlug]);
  // Agent-level 3-state toggle: Auto/Fast/Deep
  const agentMode =
    props.modelOverride === "auto"
      ? "auto"
      : props.queryMode === "conservative"
        ? "fast"
        : props.queryMode === "deep_matter"
          ? "deep"
          : "auto";
  const { popoverTransition, popoverInitial, popoverAnimate, popoverExit } = useDashboardMotion();

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
      if (sessionsRef.current && !sessionsRef.current.contains(e.target as Node)) {
        setShowSessions(false);
      }
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
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
      {/* Single row: title + status + controls + actions — no wrapping */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Title + status badge */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
            title={
              props.features.brainStatus
                ? brainDegraded
                  ? t("chat.brain_degraded")
                  : brainOnline
                    ? t("chat.brain_online")
                    : t("chat.brain_offline")
                : undefined
            }
          >
            <MessageSquareText size={14} className="text-[color:var(--ds-text-muted)]" />
            {props.features.brainStatus && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-[color:var(--ds-surface)]",
                  brainDegraded ? "bg-amber-500" : brainOnline ? "bg-emerald-500" : "bg-red-500"
                )}
              />
            )}
          </div>
        </div>

        {/* Controls toolbar — wraps gracefully, never overflows */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-xl bg-[color:var(--ds-surface-2)] p-1">
          {/* ── Combined Sessions + Case dropdown ── */}
          {props.sessions && props.onSelectSession ? (
            <div ref={sessionsRef} className="relative">
              <button
                onClick={() => setShowSessions((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-surface)] hover:text-[color:var(--ds-text)] active:scale-95"
              >
                <MessageSquareText size={12} />
                {props.activeSessionId ? t("chat.session_label") : t("chat.new_session")}
                {props.features.caseSelector && props.selectedCaseSlug && (
                  <span className="text-[color:var(--ds-text-subtle)]">·</span>
                )}
                {props.features.caseSelector && props.selectedCaseSlug && (
                  <span className="max-w-[80px] truncate text-[color:var(--ds-text-subtle)]">
                    {props.cases.find((c) => c.slug === props.selectedCaseSlug)?.title ??
                      t("chat.no_case")}
                  </span>
                )}
                <ChevronDown
                  size={11}
                  className={cn("transition-transform", showSessions && "rotate-180")}
                />
              </button>
              <AnimatePresence initial={false}>
                {showSessions && (
                  <motion.div
                    className="absolute top-full left-0 z-50 mt-1 w-80 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-lg"
                    initial={popoverInitial}
                    animate={popoverAnimate}
                    exit={popoverExit}
                    transition={popoverTransition}
                  >
                    {/* New session */}
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

                    {/* Case selector section */}
                    {props.features.caseSelector && (
                      <div className="border-b border-[color:var(--ds-border)] p-2">
                        <p className="mb-1.5 px-1 text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                          {t("chat.header_case_section")}
                        </p>
                        <div className="relative">
                          <Briefcase
                            size={11}
                            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                          />
                          <select
                            value={activeCaseSlug}
                            onChange={(e) => {
                              props.onCaseChange(e.target.value);
                              setActiveCaseSlug(e.target.value);
                            }}
                            className="w-full appearance-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-1.5 pr-7 pl-8 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                            aria-label={t("chat.case_select")}
                          >
                            <option value="">{t("chat.no_case")}</option>
                            {props.cases.map((c) => (
                              <option key={c.slug} value={c.slug}>
                                {c.title}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={11}
                            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Session search */}
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
                              aria-label="Suche zurücksetzen"
                              className="absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Session list */}
                    <div className="max-h-56 overflow-y-auto p-1">
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
                                {new Date(s.updatedAt).toLocaleDateString(
                                  lang === "en" ? "en-GB" : "de-DE"
                                )}
                                {s.lastPreview && ` · ${s.lastPreview.slice(0, 40)}`}
                              </p>
                              {s.tags && s.tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {s.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="inline-flex items-center gap-0.5 rounded bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-subtle)]"
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : props.features.caseSelector ? (
            /* Case-only fallback when sessions are not available */
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
          ) : null}

          {/* ── Agent-level 3-state toggle: Auto/Fast/Deep ── */}
          {props.features.modeSelector && (
            <div className="flex items-center gap-1 rounded-lg bg-[color:var(--ds-surface-2)] p-1">
              {[
                { value: "auto", label: "Auto" },
                { value: "fast", label: "Fast" },
                { value: "deep", label: "Deep" },
              ].map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => {
                    if (mode.value === "auto") {
                      props.onModelChange("auto");
                      props.onQueryModeChange("balanced");
                    } else if (mode.value === "fast") {
                      props.onModelChange("auto");
                      props.onQueryModeChange("conservative");
                    } else if (mode.value === "deep") {
                      props.onModelChange("auto");
                      props.onQueryModeChange("deep_matter");
                    }
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    agentMode === mode.value
                      ? "bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] shadow-sm"
                      : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions — more menu */}
        <div className="relative flex shrink-0 items-center" ref={actionsRef}>
          {props.messageCount > 0 && (
            <>
              <button
                onClick={() => setShowActions((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
                aria-label={t("copilot.more_actions")}
                title={t("copilot.more_actions")}
                aria-haspopup="true"
                aria-expanded={showActions}
              >
                <MoreVertical size={14} />
              </button>
              <AnimatePresence initial={false}>
                {showActions && (
                  <motion.div
                    className="absolute top-full right-0 z-50 mt-1 w-48 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1 shadow-lg"
                    initial={popoverInitial}
                    animate={popoverAnimate}
                    exit={popoverExit}
                    transition={popoverTransition}
                  >
                    {props.onShare && (
                      <button
                        onClick={() => {
                          props.onShare?.();
                          setShowActions(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-hover)]"
                      >
                        <Share2 size={13} />
                        {t("chat.share")}
                      </button>
                    )}
                    {props.features.exportChat && (
                      <button
                        onClick={() => {
                          props.onExport();
                          setShowActions(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-hover)]"
                      >
                        <Download size={13} />
                        {t("chat.export")}
                      </button>
                    )}
                    <div className="my-1 h-px bg-[color:var(--ds-border)]" />
                    <button
                      onClick={() => {
                        props.onClear();
                        setShowActions(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                    >
                      <Trash2 size={13} />
                      {t("chat.clear")}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          {props.trailingActions}
        </div>
      </div>
    </div>
  );
}
