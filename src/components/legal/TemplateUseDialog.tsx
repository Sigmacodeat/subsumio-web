"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { loadKanzleiSettings, type KanzleiSettings } from "@/lib/kanzlei-settings";
import { caseFrontmatter, type CaseFrontmatter } from "@/lib/legal-types";
import {
  extractVariableKeys,
  fillTemplate,
  fillTemplateMarkdown,
  resolveKnownVariables,
} from "@/lib/templates";
import { buildLetterheadFromKanzleiSettings } from "@/lib/letterhead-rubrum";

interface TemplateForDialog {
  slug: string;
  title: string;
  body: string;
  variables: Array<{ key: string; label: string; required: boolean }>;
}

interface CaseOption {
  slug: string;
  title: string;
  caseNumber: string;
  fm: CaseFrontmatter;
}

/**
 * Befüllt eine Vorlage mit Akten- und Kanzleidaten (src/lib/templates.ts)
 * und bietet danach Kopieren oder DOCX-Download an. Vorher wurde jede
 * Vorlage per copyTemplate() unverändert in die Zwischenablage kopiert —
 * die {{variablen}}, die der Editor selbst als Syntax ankündigt, wurden
 * nie ersetzt.
 */
export function TemplateUseDialog({
  template,
  onClose,
}: {
  template: TemplateForDialog;
  onClose: () => void;
}) {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [caseSlug, setCaseSlug] = useState("");
  const [kanzlei, setKanzlei] = useState<KanzleiSettings | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loadingCases, setLoadingCases] = useState(true);
  const [casesError, setCasesError] = useState(false);

  // All {{...}} tokens actually present in the body — a superset of the
  // template's declared `variables` if the author added one without
  // registering it, so nothing silently stays unfillable in the form.
  const allKeys = useMemo(() => {
    const declared = template.variables.map((v) => v.key);
    const found = extractVariableKeys(template.body);
    return Array.from(new Set([...declared, ...found]));
  }, [template]);

  const labelFor = (key: string) => template.variables.find((v) => v.key === key)?.label || key;

  useEffect(() => {
    void loadKanzleiSettings().then(setKanzlei);
    void api.brain
      .batchListPagesDetailed(["legal_case"], 500)
      .then(({ results, errors }) => {
        if (errors.length) throw new Error(`batch list failed: ${errors.join(",")}`);
        setCases(
          (results.legal_case ?? []).map((p) => {
            const fm = caseFrontmatter(p);
            return { slug: p.slug, title: p.title, caseNumber: fm.case_number || p.slug, fm };
          })
        );
      })
      .catch(() => setCasesError(true))
      .finally(() => setLoadingCases(false));
  }, []);

  // Re-resolve known variables whenever the case or Kanzlei data changes,
  // but keep whatever the user has already typed by hand.
  useEffect(() => {
    const selectedCase = cases.find((c) => c.slug === caseSlug);
    const known = resolveKnownVariables(
      selectedCase ? { ...selectedCase.fm, title: selectedCase.title } : null,
      kanzlei
    );
    setValues((prev) => {
      const next = { ...prev };
      for (const key of allKeys) {
        if (known[key] !== undefined && !prev[key]) next[key] = known[key];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseSlug, kanzlei, cases]);

  const filled = fillTemplate(template.body, values);
  const filledMarkdown = fillTemplateMarkdown(template.body, values);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  function copy() {
    void navigator.clipboard.writeText(filled);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadDocx() {
    setDownloading(true);
    try {
      const res = await csrfFetch("/api/word-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.title,
          markdown: filledMarkdown,
          // Aus der Vorlage befüllt, kein KI-Text — keine KI-Kennzeichnung.
          ai_generated: false,
          letterhead: kanzlei ? buildLetterheadFromKanzleiSettings(kanzlei) : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.title.replace(/[^a-zA-Z0-9äöüßÄÖÜ]+/g, "_").slice(0, 60)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadError(null);
    } catch {
      // Unhandled before: the button just stopped spinning.
      setDownloadError("Das Word-Dokument konnte nicht erstellt werden. Bitte erneut versuchen.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vorlage verwenden: {template.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-use-case" className="text-xs">
              Akte (befüllt bekannte Felder automatisch)
            </Label>
            <Select value={caseSlug} onValueChange={setCaseSlug}>
              <SelectTrigger id="tpl-use-case">
                <SelectValue placeholder={loadingCases ? "Lädt…" : "Ohne Akte"} />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.caseNumber} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {casesError && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Aktenliste konnte nicht geladen werden — Felder bitte manuell befüllen.
              </p>
            )}
          </div>

          {allKeys.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {allKeys.map((key) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`tpl-var-${key}`} className="text-xs">
                    {labelFor(key)}
                  </Label>
                  <Input
                    id={`tpl-var-${key}`}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`{{${key}}}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Vorschau</Label>
            <pre className="max-h-64 overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-xs whitespace-pre-wrap">
              {filled}
            </pre>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              In Zwischenablage kopieren
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void downloadDocx()}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Als DOCX herunterladen
            </Button>
          </div>
          {downloadError && (
            <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
              {downloadError}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
