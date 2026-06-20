"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  FileText,
  GitCompare,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Download,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Check as CheckIcon,
  X as XIcon,
  ArrowUp,
  ArrowDown,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { diffWords, buildAcceptedText, diffStats, type DiffToken } from "@/lib/word-diff";

interface RedlineClause {
  original: string;
  revised: string;
  risk: "high" | "medium" | "low";
  reason: string;
  clauseTitle?: string;
  accepted?: boolean;
  collapsed?: boolean;
}

interface ContractRedlineViewerProps {
  originalText: string;
  counterpartyText?: string;
  contractType?: string;
  jurisdiction?: "at" | "de" | "ch" | "all";
  playbookSlug?: string;
  onClose?: () => void;
}

function parseRedlineResponse(text: string): RedlineClause[] {
  const clauses: RedlineClause[] = [];
  const lines = text.split("\n");
  let current: Partial<RedlineClause> = {};
  let section = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect clause headers (e.g. "### Clause:", "## §1", numbered sections)
    if (/^(#{1,4}\s|§\d+|\d+\.\s|Clause:|Klausel:)/i.test(trimmed)) {
      if (current.original || current.revised) {
        clauses.push(current as RedlineClause);
      }
      current = { clauseTitle: trimmed.replace(/^#{1,4}\s/, "") };
      section = "";
      continue;
    }

    if (/^(Original|Ausgangstext):/i.test(trimmed)) {
      section = "original";
      continue;
    }
    if (/^(Revised|Überarbeitet|Neu):/i.test(trimmed)) {
      section = "revised";
      continue;
    }
    if (/^(Risk|Risiko):/i.test(trimmed)) {
      const level = trimmed.toLowerCase();
      current.risk = level.includes("high") || level.includes("hoch") ? "high"
        : level.includes("low") || level.includes("niedrig") ? "low" : "medium";
      section = "";
      continue;
    }
    if (/^(Reason|Begründung|Empfehlung):/i.test(trimmed)) {
      section = "reason";
      continue;
    }

    if (section === "original") {
      current.original = (current.original || "") + (current.original ? "\n" : "") + trimmed;
    } else if (section === "revised") {
      current.revised = (current.revised || "") + (current.revised ? "\n" : "") + trimmed;
    } else if (section === "reason") {
      current.reason = (current.reason || "") + (current.reason ? "\n" : "") + trimmed;
    }
  }

  if (current.original || current.revised) {
    clauses.push(current as RedlineClause);
  }

  // Fallback: if no structured clauses were found, treat the whole text as one clause
  if (clauses.length === 0 && text.trim()) {
    clauses.push({
      original: "",
      revised: text,
      risk: "medium",
      reason: "AI-generierte Überarbeitung",
    });
  }

  return clauses;
}

const RISK_CONFIG = {
  high: { label: "Hohes Risiko", color: "text-red-600", bg: "bg-red-500/10", border: "border-red-500/20", icon: XCircle },
  medium: { label: "Mittleres Risiko", color: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: AlertTriangle },
  low: { label: "Niedriges Risiko", color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2 },
};

export function ContractRedlineViewer({
  originalText,
  counterpartyText,
  contractType,
  jurisdiction = "all",
  playbookSlug,
  onClose,
}: ContractRedlineViewerProps) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redlineText, setRedlineText] = useState("");
  const [clauses, setClauses] = useState<RedlineClause[]>([]);
  const [perspective, setPerspective] = useState<"client" | "counterparty" | "neutral">("client");
  const [copied, setCopied] = useState(false);
  const [activeClause, setActiveClause] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const clauseRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keyboard navigation between clauses
  useEffect(() => {
    if (clauses.length === 0) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setActiveClause((prev) => Math.min(prev + 1, clauses.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setActiveClause((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        setClauses((prev) => prev.map((c, i) => i === activeClause ? { ...c, accepted: !c.accepted } : c));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [clauses.length, activeClause]);

  // Scroll active clause into view
  useEffect(() => {
    const el = clauseRefs.current[activeClause];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeClause]);

  const acceptedCount = useMemo(() => clauses.filter((c) => c.accepted).length, [clauses]);
  const reviewedCount = useMemo(() => clauses.filter((c) => c.accepted !== undefined).length, [clauses]);

  const runRedline = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRedlineText("");
    setClauses([]);

    try {
      const { redline } = await api.legal.contractRedline({
        original_text: originalText,
        counterparty_text: counterpartyText,
        playbook_slug: playbookSlug,
        contract_type: contractType,
        jurisdiction,
        perspective,
        language: "de",
        onChunk: (chunk) => {
          setRedlineText((prev) => prev + chunk);
        },
      });

      const parsed = parseRedlineResponse(redline);
      setClauses(parsed);
      setActiveClause(0);
      addToast({ type: "success", title: `${parsed.length} Klauseln analysiert` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Redline-Analyse fehlgeschlagen";
      setError(msg);
      addToast({ type: "error", title: msg });
    } finally {
      setLoading(false);
    }
  }, [originalText, counterpartyText, contractType, jurisdiction, playbookSlug, perspective, addToast]);

  function copyRedline() {
    navigator.clipboard.writeText(redlineText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadRedline() {
    const blob = new Blob([redlineText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `redline-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAccepted() {
    const text = buildAcceptedText(clauses);
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accepted-redline-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: "success", title: `Akzeptierte Version exportiert (${acceptedCount}/${clauses.length} Klauseln)` });
  }

  function acceptAll() {
    setClauses((prev) => prev.map((c) => ({ ...c, accepted: true })));
    addToast({ type: "success", title: `Alle ${clauses.length} Klauseln akzeptiert` });
  }

  function rejectAll() {
    setClauses((prev) => prev.map((c) => ({ ...c, accepted: false })));
    addToast({ type: "info", title: `Alle ${clauses.length} Klauseln abgelehnt` });
  }

  function toggleClause(idx: number) {
    setClauses((prev) => prev.map((c, i) => i === idx ? { ...c, collapsed: !c.collapsed } : c));
  }

  function acceptClause(idx: number) {
    setClauses((prev) => prev.map((c, i) => i === idx ? { ...c, accepted: true } : c));
  }

  function rejectClause(idx: number) {
    setClauses((prev) => prev.map((c, i) => i === idx ? { ...c, accepted: false } : c));
  }

  const highRiskCount = clauses.filter((c) => c.risk === "high").length;
  const mediumRiskCount = clauses.filter((c) => c.risk === "medium").length;
  const lowRiskCount = clauses.filter((c) => c.risk === "low").length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl brand-soft brand-border border flex items-center justify-center">
            <GitCompare size={20} className="brand-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[color:var(--ds-text)]">Contract Redline</h2>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              KI-gestützte Klauselanalyse und Überarbeitung
              {contractType && ` · ${contractType}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {clauses.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={copyRedline} className="gap-1.5 text-xs">
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                Kopieren
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadRedline} className="gap-1.5 text-xs">
                <Download size={14} />
                Redline
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadAccepted} className="gap-1.5 text-xs">
                <FileCheck2 size={14} />
                Akzeptiert ({acceptedCount}/{clauses.length})
              </Button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-colors"
              aria-label="Schließen"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <div className="flex gap-1.5">
          {(["client", "counterparty", "neutral"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPerspective(p)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                perspective === p
                  ? "brand-soft brand-border brand-text"
                  : "text-[color:var(--ds-text-muted)] border-[color:var(--ds-border)] hover:text-[color:var(--ds-text)]",
              )}
            >
              {p === "client" ? "Mandantenperspektive" : p === "counterparty" ? "Gegenseite" : "Neutral"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          onClick={runRedline}
          disabled={loading || !originalText.trim()}
          className="gap-2 text-xs"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? "Analysiere…" : "Redline starten"}
        </Button>
      </div>

      {/* Risk Summary + Bulk Actions */}
      {clauses.length > 0 && (
        <div className="flex items-center gap-4 px-6 py-2.5 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <span className="text-xs text-[color:var(--ds-text-muted)]">{clauses.length} Klauseln</span>
          {highRiskCount > 0 && (
            <Badge variant="default" className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-600">
              {highRiskCount} hoch
            </Badge>
          )}
          {mediumRiskCount > 0 && (
            <Badge variant="default" className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-600">
              {mediumRiskCount} mittel
            </Badge>
          )}
          {lowRiskCount > 0 && (
            <Badge variant="default" className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
              {lowRiskCount} niedrig
            </Badge>
          )}
          <div className="flex-1" />
          {reviewedCount > 0 && (
            <span className="text-[10px] text-[color:var(--ds-text-muted)]">
              {reviewedCount}/{clauses.length} reviewed
            </span>
          )}
          <button
            onClick={acceptAll}
            className="text-[10px] font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 px-2 py-1 rounded-lg transition-colors"
          >
            Alle akzeptieren
          </button>
          <button
            onClick={rejectAll}
            className="text-[10px] font-medium text-red-600 hover:text-red-700 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors"
          >
            Alle ablehnen
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="max-w-2xl mx-auto rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3 text-sm text-red-600">
            <AlertTriangle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {!loading && !redlineText && !error && (
          <div className="max-w-2xl mx-auto text-center py-20 space-y-4">
            <div className="w-16 h-16 rounded-2xl brand-soft brand-border border mx-auto flex items-center justify-center">
              <GitCompare size={28} className="brand-text" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Vertragsredaktion starten</h3>
              <p className="text-xs text-[color:var(--ds-text-muted)] mt-1 max-w-md mx-auto">
                Die KI analysiert den Vertrag clause-by-clause, identifiziert Risiken und schlägt überarbeitete Formulierungen vor.
                {playbookSlug && ` Playbook: ${playbookSlug}`}
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={runRedline} className="gap-2">
              <Sparkles size={14} />
              Analyse starten
            </Button>
          </div>
        )}

        {loading && redlineText && (
          <div className="max-w-4xl mx-auto">
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Loader2 size={14} className="animate-spin brand-text" />
                <span className="text-xs text-[color:var(--ds-text-muted)]">Streaming Analyse…</span>
              </div>
              <pre className="text-xs text-[color:var(--ds-text-muted)] font-mono whitespace-pre-wrap max-h-96 overflow-auto">
                {redlineText}
              </pre>
            </div>
          </div>
        )}

        {!loading && clauses.length > 0 && (
          <div className="max-w-5xl mx-auto space-y-4">
            {clauses.map((clause, idx) => {
              const riskCfg = RISK_CONFIG[clause.risk] || RISK_CONFIG.medium;
              const RiskIcon = riskCfg.icon;
              const isActive = idx === activeClause;
              const diff = diffWords(clause.original || "", clause.revised || "");
              const stats = diffStats(clause.original || "", clause.revised || "");
              return (
                <div
                  key={idx}
                  ref={(el) => { clauseRefs.current[idx] = el; }}
                  className={cn(
                    "rounded-xl border bg-[color:var(--ds-surface)] overflow-hidden transition-all",
                    riskCfg.border,
                    isActive && "ring-2 ring-offset-0 ring-[color:var(--brand-primary)]/40",
                    clause.accepted === true && "ring-1 ring-emerald-500/30",
                    clause.accepted === false && "opacity-60",
                  )}
                >
                  {/* Clause header — clickable to collapse */}
                  <div
                    className={cn("flex items-center gap-2 px-4 py-2.5 border-b cursor-pointer select-none", riskCfg.border, riskCfg.bg)}
                    onClick={() => toggleClause(idx)}
                  >
                    {clause.collapsed ? <ChevronRight size={14} className="text-[color:var(--ds-text-muted)]" /> : <ChevronDown size={14} className="text-[color:var(--ds-text-muted)]" />}
                    <RiskIcon size={14} className={riskCfg.color} />
                    <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                      {clause.clauseTitle || `Klausel ${idx + 1}`}
                    </span>
                    {stats.additions > 0 && (
                      <span className="text-[10px] text-emerald-600 font-mono">+{stats.additions}</span>
                    )}
                    {stats.removals > 0 && (
                      <span className="text-[10px] text-red-600 font-mono">-{stats.removals}</span>
                    )}
                    <Badge variant="default" className={cn("text-[10px] ml-auto", riskCfg.bg, riskCfg.border, riskCfg.color)}>
                      {riskCfg.label}
                    </Badge>
                    {clause.accepted === true && (
                      <Badge variant="default" className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
                        <CheckIcon size={10} className="mr-0.5" /> Akzeptiert
                      </Badge>
                    )}
                    {clause.accepted === false && (
                      <Badge variant="default" className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-600">
                        <XIcon size={10} className="mr-0.5" /> Abgelehnt
                      </Badge>
                    )}
                  </div>

                  {!clause.collapsed && (
                    <>
                      {/* Side-by-side comparison with inline diff */}
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-[color:var(--ds-border)]">
                        {/* Original with diff highlighting */}
                        <div className="p-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <FileText size={12} className="text-[color:var(--ds-text-muted)]" />
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-muted)]">Original</span>
                          </div>
                          <DiffRenderer tokens={diff.left} side="original" />
                        </div>

                        {/* Revised with diff highlighting */}
                        <div className="p-4 bg-[color:var(--ds-hover)]/30">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Sparkles size={12} className="brand-text" />
                            <span className="text-[10px] font-semibold uppercase tracking-wide brand-text">Überarbeitet</span>
                          </div>
                          <DiffRenderer tokens={diff.right} side="revised" />
                        </div>
                      </div>

                      {/* Reason */}
                      {clause.reason && (
                        <div className="px-4 py-2.5 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                          <p className="text-[11px] text-[color:var(--ds-text-muted)] leading-relaxed">
                            <strong className="text-[color:var(--ds-text)]">Begründung: </strong>
                            {clause.reason}
                          </p>
                        </div>
                      )}

                      {/* Accept/Reject actions */}
                      <div className="flex items-center gap-2 px-4 py-2 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                        <button
                          onClick={() => acceptClause(idx)}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
                            clause.accepted === true
                              ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                              : "text-emerald-600 hover:bg-emerald-500/10 border border-transparent",
                          )}
                        >
                          <CheckIcon size={12} /> Akzeptieren
                        </button>
                        <button
                          onClick={() => rejectClause(idx)}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
                            clause.accepted === false
                              ? "bg-red-500/15 text-red-700 border border-red-500/30"
                              : "text-red-600 hover:bg-red-500/10 border border-transparent",
                          )}
                        >
                          <XIcon size={12} /> Ablehnen
                        </button>
                        <div className="flex-1" />
                        {idx > 0 && (
                          <button onClick={() => setActiveClause(idx - 1)} className="p-1 rounded text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]" title="Vorherige (↑)">
                            <ArrowUp size={12} />
                          </button>
                        )}
                        {idx < clauses.length - 1 && (
                          <button onClick={() => setActiveClause(idx + 1)} className="p-1 rounded text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]" title="Nächste (↓)">
                            <ArrowDown size={12} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffRenderer({ tokens, side }: { tokens: DiffToken[]; side: "original" | "revised" }) {
  if (tokens.length === 0 || (tokens.length === 1 && !tokens[0].text)) {
    return <p className="text-xs text-[color:var(--ds-text-muted)] italic">—</p>;
  }
  return (
    <p className="text-xs text-[color:var(--ds-text)] leading-relaxed whitespace-pre-wrap">
      {tokens.map((token, i) => {
        if (token.type === "equal") {
          return <span key={i}>{token.text}</span>;
        }
        if (token.type === "removed" && side === "original") {
          return (
            <span key={i} className="bg-red-500/15 text-red-700 line-through rounded px-0.5">
              {token.text}
            </span>
          );
        }
        if (token.type === "added" && side === "revised") {
          return (
            <span key={i} className="bg-emerald-500/15 text-emerald-700 rounded px-0.5">
              {token.text}
            </span>
          );
        }
        return null;
      })}
    </p>
  );
}
