"use client";

import { useState } from "react";
import {
  Languages,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { DocumentTranslation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

const LANGUAGES = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "Englisch" },
  { code: "fr", label: "Französisch" },
  { code: "it", label: "Italienisch" },
  { code: "es", label: "Spanisch" },
  { code: "nl", label: "Niederländisch" },
  { code: "pl", label: "Polnisch" },
  { code: "tr", label: "Türkisch" },
  { code: "ru", label: "Russisch" },
  { code: "zh", label: "Chinesisch" },
];

export default function TranslatePage() {
  const [mode, setMode] = useState<"text" | "slug">("text");
  const [slug, setSlug] = useState("");
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [legalTerminology, setLegalTerminology] = useState(true);
  const [preserveFormatting, setPreserveFormatting] = useState(true);
  const [result, setResult] = useState<DocumentTranslation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.translate({
        ...(mode === "slug" ? { document_slug: slug.trim() } : { text: text.trim() }),
        ...(sourceLang !== "auto" ? { source_language: sourceLang } : {}),
        target_language: targetLang,
        legal_terminology: legalTerminology,
        preserve_formatting: preserveFormatting,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Übersetzung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  const canRun = mode === "slug" ? slug.trim().length > 0 : text.trim().length > 0;

  function copyResult() {
    if (!result) return;
    void navigator.clipboard.writeText(result.translated_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Juristische Übersetzung"
        description="KI-Übersetzung mit Erhaltung juristischer Fachterminologie, Normzitate und Formatierung"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Übersetzung" }]}
      />

      {/* Language selectors */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold block mb-1.5">Quellsprache</label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] min-w-[140px]"
            >
              <option value="auto">Auto-Erkennung</option>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          <div className="text-[color:var(--ds-text-muted)] pb-2">→</div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold block mb-1.5">Zielsprache</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] min-w-[140px]"
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          <div className="flex gap-3 ml-auto">
            <label className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)] cursor-pointer">
              <input type="checkbox" checked={legalTerminology} onChange={(e) => setLegalTerminology(e.target.checked)} className="accent-emerald-600" />
              Juristische Terminologie
            </label>
            <label className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)] cursor-pointer">
              <input type="checkbox" checked={preserveFormatting} onChange={(e) => setPreserveFormatting(e.target.checked)} className="accent-emerald-600" />
              Formatierung erhalten
            </label>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("text")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", mode === "text" ? "brand-soft brand-text border brand-border" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] border border-transparent")}
          >
            Direkter Text
          </button>
          <button
            onClick={() => setMode("slug")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", mode === "slug" ? "brand-soft brand-text border brand-border" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] border border-transparent")}
          >
            Aus Vault (Slug)
          </button>
        </div>

        {mode === "slug" ? (
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Dokument-Slug aus dem Brain"
            className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)]"
          />
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Zu übersetzender Text…"
            className="w-full h-40 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-4 py-3 text-sm text-[color:var(--ds-text)] font-mono leading-relaxed focus:outline-none focus:border-emerald-500/50 resize-none"
          />
        )}

        <Button onClick={run} disabled={loading || !canRun} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}
          Übersetzen
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Translated text */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold flex items-center gap-2">
                <Languages size={14} /> Übersetzung ({result.source_language} → {result.target_language})
              </h3>
              <Button variant="ghost" size="sm" onClick={copyResult} className="gap-1.5 text-xs">
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                {copied ? "Kopiert" : "Kopieren"}
              </Button>
            </div>
            <div className="prose prose-sm max-w-none text-[color:var(--ds-text)] whitespace-pre-wrap leading-relaxed">
              {result.translated_text}
            </div>
          </div>

          {/* Glossary */}
          {result.glossary.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold mb-3 flex items-center gap-2">
                <BookOpen size={14} /> Glossar ({result.glossary.length})
              </h3>
              <div className="space-y-2">
                {result.glossary.map((g, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="font-mono text-[color:var(--ds-text)] min-w-[120px]">{g.source_term}</span>
                    <span className="text-[color:var(--ds-text-muted)]">→</span>
                    <span className="font-mono text-emerald-600 min-w-[120px]">{g.target_term}</span>
                    {g.note && <span className="text-xs text-[color:var(--ds-text-muted)] italic">{g.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">{w}</p>
              ))}
            </div>
          )}

          {result.attorney_review_required && (
            <Badge variant="default" className="text-xs bg-amber-500/10 border-amber-500/20 text-amber-600">
              Anwaltliche Prüfung der Übersetzung empfohlen
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
