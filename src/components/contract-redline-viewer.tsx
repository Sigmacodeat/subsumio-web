"use client";

import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

interface RedlineClause {
  original: string;
  revised: string;
  risk: "high" | "medium" | "low";
  reason: string;
  clauseTitle?: string;
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
  const abortRef = useRef<AbortController | null>(null);

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
                Export
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

      {/* Risk Summary */}
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
              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-xl border bg-[color:var(--ds-surface)] overflow-hidden",
                    riskCfg.border,
                  )}
                >
                  {/* Clause header */}
                  <div className={cn("flex items-center gap-2 px-4 py-2.5 border-b", riskCfg.border, riskCfg.bg)}>
                    <RiskIcon size={14} className={riskCfg.color} />
                    <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                      {clause.clauseTitle || `Klausel ${idx + 1}`}
                    </span>
                    <Badge variant="default" className={cn("text-[10px] ml-auto", riskCfg.bg, riskCfg.border, riskCfg.color)}>
                      {riskCfg.label}
                    </Badge>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-[color:var(--ds-border)]">
                    {/* Original */}
                    <div className="p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FileText size={12} className="text-[color:var(--ds-text-muted)]" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-muted)]">Original</span>
                      </div>
                      <p className="text-xs text-[color:var(--ds-text)] leading-relaxed whitespace-pre-wrap">
                        {clause.original || "—"}
                      </p>
                    </div>

                    {/* Revised */}
                    <div className="p-4 bg-[color:var(--ds-hover)]/30">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles size={12} className="brand-text" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide brand-text">Überarbeitet</span>
                      </div>
                      <p className="text-xs text-[color:var(--ds-text)] leading-relaxed whitespace-pre-wrap">
                        {clause.revised || "—"}
                      </p>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
