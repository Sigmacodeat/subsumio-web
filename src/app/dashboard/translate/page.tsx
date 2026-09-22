"use client";

import { useState } from "react";
import { Languages, Loader2, AlertTriangle, Copy, Check, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiRequestError } from "@/lib/api";
import type { DocumentTranslation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { GroundedOutputPanel } from "@/components/legal/GroundedOutputPanel";

const LANGUAGES = [
  { code: "de", labelKey: "translate.lang_de" },
  { code: "en", labelKey: "translate.lang_en" },
  { code: "fr", labelKey: "translate.lang_fr" },
  { code: "it", labelKey: "translate.lang_it" },
  { code: "es", labelKey: "translate.lang_es" },
  { code: "nl", labelKey: "translate.lang_nl" },
  { code: "pl", labelKey: "translate.lang_pl" },
  { code: "tr", labelKey: "translate.lang_tr" },
  { code: "ru", labelKey: "translate.lang_ru" },
  { code: "zh", labelKey: "translate.lang_zh" },
] as const;

export default function TranslatePage() {
  const { t } = useLang();
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
      setError(
        e instanceof ApiRequestError && e.status === 404
          ? "Das Dokument wurde nicht gefunden. Bitte prüfen Sie die Dokumentkennung."
          : "Die Übersetzung ist gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut."
      );
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
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("translate.title")}
        description={t("translate.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("translate.breadcrumb") },
        ]}
      />

      {/* Language selectors */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              {t("translate.source_lang")}
            </label>
            <select
              aria-label={t("translate.source_lang")}
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="min-w-[140px] rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
            >
              <option value="auto">{t("translate.auto_detect")}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {t(l.labelKey as never)}
                </option>
              ))}
            </select>
          </div>

          <div className="pb-2 text-[color:var(--ds-text-muted)]">→</div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              {t("translate.target_lang")}
            </label>
            <select
              aria-label={t("translate.target_lang")}
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="min-w-[140px] rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {t(l.labelKey as never)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 sm:ml-auto">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <input
                type="checkbox"
                checked={legalTerminology}
                onChange={(e) => setLegalTerminology(e.target.checked)}
                className="accent-[var(--brand-primary)]"
              />
              Juristische Terminologie
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <input
                type="checkbox"
                checked={preserveFormatting}
                onChange={(e) => setPreserveFormatting(e.target.checked)}
                className="accent-[var(--brand-primary)]"
              />
              Formatierung erhalten
            </label>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex flex-wrap gap-2" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "text"}
            onClick={() => setMode("text")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none",
              mode === "text"
                ? "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)] shadow-sm"
                : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
            )}
          >
            Direkter Text
          </button>
          <button
            role="tab"
            aria-selected={mode === "slug"}
            onClick={() => setMode("slug")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none",
              mode === "slug"
                ? "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)] shadow-sm"
                : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
            )}
          >
            Aus der Dokumentablage
          </button>
        </div>

        {mode === "slug" ? (
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t("translate.placeholder_doc_slug")}
            aria-label={t("translate.placeholder_doc_slug")}
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]"
          />
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("translate.placeholder_text")}
            aria-label={t("translate.placeholder_text")}
            className="h-40 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
        )}

        <Button onClick={run} disabled={loading || !canRun} className="gap-2 whitespace-nowrap">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}
          {t("translate.btn_translate")}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Translated text */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <Languages size={14} /> {t("translate.result_label")} (
                {result.source_language.toUpperCase()} → {result.target_language.toUpperCase()})
              </h3>
              <Button variant="ghost" size="sm" onClick={copyResult} className="gap-1.5 text-xs">
                {copied ? (
                  <Check size={12} className="text-[color:var(--ds-success-text)]" />
                ) : (
                  <Copy size={12} />
                )}
                {t("translate.btn_copy")}
              </Button>
            </div>
            <div className="prose prose-sm max-w-none leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
              {result.translated_text}
            </div>
            <GroundedOutputPanel text={result.translated_text} className="mt-3" />
          </div>

          {/* Glossary */}
          {result.glossary.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <BookOpen size={14} /> Glossar ({result.glossary.length})
              </h3>
              <div className="space-y-2">
                {result.glossary.map((g, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                    <span className="min-w-[120px] text-[color:var(--ds-text-muted)]">
                      {g.source_term}
                    </span>
                    <span className="text-[color:var(--ds-text-muted)]">→</span>
                    <span className="min-w-[120px] font-medium text-[color:var(--ds-text)]">
                      {g.target_term}
                    </span>
                    {g.note && (
                      <span className="text-xs text-[color:var(--ds-text-muted)] italic">
                        {g.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-[color:var(--ds-warning-text)]">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
