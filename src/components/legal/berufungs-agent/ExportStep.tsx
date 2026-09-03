"use client";

import { useState, useCallback } from "react";
import {
  Download,
  FileText,
  Save,
  RotateCcw,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { AIActConformityBanner } from "@/components/legal/AIActConformityBanner";
import { AI_FRONTMATTER } from "@/lib/ai-act";
import { useLang } from "@/lib/use-lang";
import type {
  ActAnalysis,
  BerufungsGrund,
  OpponentFinding,
} from "@/app/dashboard/berufungs-agent/page";

interface ExportStepProps {
  caseSlug: string;
  analysis: ActAnalysis | null;
  selectedGruende: BerufungsGrund[];
  draftContent: string;
  draftSlug: string;
  opponentFindings: OpponentFinding[];
  onBack: () => void;
  onReset: () => void;
}

export function ExportStep({
  caseSlug,
  analysis,
  selectedGruende,
  draftContent,
  draftSlug,
  opponentFindings,
  onBack,
  onReset,
}: ExportStepProps) {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [exportTitle, setExportTitle] = useState(`Berufungsschriftsatz — ${caseSlug}`);
  const { addToast } = useToast();
  const { t } = useLang();

  const exportDocx = useCallback(async () => {
    if (!draftContent.trim()) {
      addToast({
        type: "error",
        title: "Kein Entwurf",
        description: "Es gibt keinen Entwurf zu exportieren.",
      });
      return;
    }
    setExportingDocx(true);
    try {
      const res = await csrfFetch("/api/word-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: exportTitle,
          markdown: draftContent,
          formData: {
            case_slug: caseSlug,
            document_type: "berufung",
            generated_at: new Date().toISOString(),
            selected_gruende: selectedGruende.length,
            opponent_findings: opponentFindings.length,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportTitle.replace(/[^a-zA-Z0-9-_]/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast({
        type: "success",
        title: "DOCX exportiert",
        description: "Die Datei wurde heruntergeladen.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: "Export fehlgeschlagen", description: msg });
    } finally {
      setExportingDocx(false);
    }
  }, [draftContent, exportTitle, caseSlug, selectedGruende, opponentFindings, addToast]);

  const saveAsBrainPage = useCallback(async () => {
    if (!draftContent.trim()) return;
    setSavingPage(true);
    try {
      const slug = draftSlug || `legal/berufungs-entwurf/${caseSlug}-${Date.now()}`;
      await api.brain.createPage({
        slug,
        title: exportTitle,
        content: draftContent,
        type: "berufungs_entwurf",
        frontmatter: {
          ...AI_FRONTMATTER,
          case_slug: caseSlug,
          document_type: "berufung",
          selected_gruende: selectedGruende.map((g) => ({ id: g.id, titel: g.titel })),
          opponent_findings: opponentFindings,
          analysis_summary: analysis?.summary,
          generated_at: new Date().toISOString(),
        },
      });
      setSavedSlug(slug);
      addToast({
        type: "success",
        title: "Als Brain-Page gespeichert",
        description: `Unter ${slug} gespeichert.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: "Speichern fehlgeschlagen", description: msg });
    } finally {
      setSavingPage(false);
    }
  }, [
    draftContent,
    draftSlug,
    caseSlug,
    exportTitle,
    selectedGruende,
    opponentFindings,
    analysis,
    addToast,
  ]);

  const summary = [
    { label: "Akten-Slug", value: caseSlug || "—" },
    { label: "Analyse", value: analysis ? "Erstellt" : "—" },
    { label: "Berufungsgründe", value: `${selectedGruende.length} ausgewählt` },
    { label: "Entwurf", value: `${draftContent.length.toLocaleString("de-AT")} Zeichen` },
    { label: "Gegner-Simulation", value: `${opponentFindings.length} Schwachstellen` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Download className="h-5 w-5 text-[color:var(--brand-primary)]" />
          {t("export.step_title")}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{t("export.step_desc")}</p>
      </div>

      {/* Summary */}
      <AIActConformityBanner purpose="Berufungsschriftsatz-Export" />
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">{t("export.summary")}</h3>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {summary.map((item) => (
            <div key={item.label} className="flex justify-between gap-2 text-sm">
              <dt className="text-[color:var(--ds-text-muted)]">{item.label}</dt>
              <dd className="font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Export title */}
      <div className="space-y-1.5">
        <Label htmlFor="export-title">Dokumenttitel</Label>
        <Input
          id="export-title"
          value={exportTitle}
          onChange={(e) => setExportTitle(e.target.value)}
          placeholder="Berufungsschriftsatz — …"
        />
      </div>

      {/* Export actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* DOCX Export */}
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[color:var(--brand-primary)]" />
            <h3 className="text-sm font-semibold">{t("export.docx_title")}</h3>
          </div>
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Download als formatiertes Word-Dokument — bereit für die Kanzlei-Verarbeitung.
          </p>
          <Button
            onClick={exportDocx}
            disabled={exportingDocx || !draftContent.trim()}
            className="gap-2"
          >
            {exportingDocx ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exportiere …
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                DOCX herunterladen
              </>
            )}
          </Button>
        </div>

        {/* Brain-Page Save */}
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-[color:var(--brand-primary)]" />
            <h3 className="text-sm font-semibold">{t("export.brain_page")}</h3>
          </div>
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Speichert den Entwurf inkl. Metadaten als durchsuchbare Brain-Page.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="page-slug" className="text-xs">
              Slug
            </Label>
            <Input id="page-slug" value={draftSlug} readOnly className="font-mono text-xs" />
          </div>
          {savedSlug ? (
            <div className="flex items-center gap-2 text-sm text-[color:var(--ds-success-text)] dark:text-[color:var(--ds-success-text)]">
              <CheckCircle2 className="h-4 w-4" />
              Gespeichert unter {savedSlug}
            </div>
          ) : (
            <Button
              onClick={saveAsBrainPage}
              disabled={savingPage || !draftContent.trim()}
              variant="secondary"
              className="gap-2"
            >
              {savingPage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Speichert …
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Als Brain-Page speichern
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Reset + back */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <Button variant="ghost" onClick={onReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Neu starten
        </Button>
      </div>
    </div>
  );
}
