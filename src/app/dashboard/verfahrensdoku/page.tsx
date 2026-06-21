"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Save, Printer, Download, Info, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { buildVerfahrensdoku, type VerfahrensdokuInput } from "@/lib/gobd-verfahrensdoku";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { verfahrensdokuSchema, type VerfahrensdokuFormData } from "@/lib/schemas/verfahrensdoku";
import { PageHeader } from "@/components/dashboard/page-header";

const DOC_SLUG = "legal/gobd/verfahrensdokumentation";

/** Escape vor Injektion in HTML-Strings (Druck/Word-Export) — verhindert XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Minimaler Markdown→HTML-Konverter für den Export (Überschriften, Listen,
 *  Tabellen, Blockquote, fett/kursiv, Trennlinie). Inhalt wird vorab escaped. */
function markdownToHtml(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>");

  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let tableRows: string[][] = [];

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [header, , ...body] = tableRows; // zweite Zeile = Trenner
    out.push("<table><thead><tr>");
    for (const c of header) out.push(`<th>${inline(c.trim())}</th>`);
    out.push("</tr></thead><tbody>");
    for (const row of body) {
      out.push("<tr>");
      for (const c of row) out.push(`<td>${inline(c.trim())}</td>`);
      out.push("</tr>");
    }
    out.push("</tbody></table>");
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("|")) {
      const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split("|");
      tableRows.push(cells);
      continue;
    }
    flushTable();

    if (line.startsWith("### ")) {
      flushList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      flushList();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      flushList();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === "---") {
      flushList();
      out.push("<hr/>");
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();
  flushTable();
  return out.join("\n");
}

function exportHtmlDocument(title: string, markdown: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; margin: 40px; color: #222; font-size: 12pt; line-height: 1.5; }
  h1 { font-size: 20pt; color: #4338ca; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
  h2 { font-size: 15pt; color: #4338ca; margin-top: 24px; }
  h3 { font-size: 12.5pt; color: #333; margin-top: 16px; }
  blockquote { background: #f3f0ff; border-left: 4px solid #6366f1; margin: 16px 0; padding: 10px 16px; color: #444; font-size: 10.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 11pt; }
  th { background: #f1f3f4; }
  hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
  em { color: #666; }
</style></head><body>
${markdownToHtml(markdown)}
</body></html>`;
}

export default function VerfahrensdokuPage() {
  const today = new Date().toISOString().split("T")[0];
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dokuForm = useForm<VerfahrensdokuFormData>({
    resolver: zodResolver(verfahrensdokuSchema) as never,
    defaultValues: {
      kanzleiName: "",
      anwaltName: "",
      ustId: "",
      verantwortlich: "",
      systeme: "Subsumio, DATEV-Export, beA",
      belegEingang: "",
      erfassung: "",
      ablageOrt: "Subsumio-Brain (steuerlich relevante Belege mit GoBD-Stempel)",
      backup: "",
      zugriffsschutz: "",
      iks: "",
      stand: today,
    },
  });

  const formValues = dokuForm.watch();
  const formData: VerfahrensdokuInput = {
    kanzleiName: formValues.kanzleiName ?? "",
    anwaltName: formValues.anwaltName ?? "",
    ustId: formValues.ustId ?? "",
    verantwortlich: formValues.verantwortlich ?? "",
    systeme: formValues.systeme ?? "",
    belegEingang: formValues.belegEingang ?? "",
    erfassung: formValues.erfassung ?? "",
    ablageOrt: formValues.ablageOrt ?? "",
    backup: formValues.backup ?? "",
    zugriffsschutz: formValues.zugriffsschutz ?? "",
    iks: formValues.iks ?? "",
    stand: formValues.stand ?? today,
  };

  useEffect(() => {
    loadKanzleiSettings()
      .then((s) => {
        dokuForm.reset({
          ...dokuForm.getValues(),
          kanzleiName: s.kanzleiName ?? "",
          anwaltName: s.anwaltName ?? "",
          ustId: s.ustId ?? "",
          verantwortlich: dokuForm.getValues("verantwortlich") || (s.anwaltName ?? ""),
        });
      })
      .catch(() => {});
    // Bereits gespeicherten Entwurf laden, falls vorhanden.
    api.brain
      .getPage(DOC_SLUG)
      .then((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        const stored = fm.verfahrensdoku_input;
        if (stored && typeof stored === "object") {
          dokuForm.reset({
            ...dokuForm.getValues(),
            ...(stored as Partial<VerfahrensdokuFormData>),
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markdown = buildVerfahrensdoku(formData);

  async function save() {
    const isValid = await dokuForm.trigger();
    if (!isValid) return;
    const data = dokuForm.getValues();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await api.brain.updatePage({
        slug: DOC_SLUG,
        title: "GoBD-Verfahrensdokumentation",
        type: "document",
        content: markdown,
        frontmatter: {
          type: "document",
          gobd_verfahrensdoku: true,
          verfahrensdoku_input: data,
          updated_via: "dashboard",
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  function printPdf() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(exportHtmlDocument("GoBD-Verfahrensdokumentation", markdown));
    w.document.close();
    w.onload = () => setTimeout(() => w.print(), 300);
  }

  function downloadWord() {
    const blob = new Blob([exportHtmlDocument("GoBD-Verfahrensdokumentation", markdown)], {
      type: "application/msword",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gobd-verfahrensdokumentation-${formData.stand}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const field = (
    label: string,
    name: keyof VerfahrensdokuFormData,
    placeholder: string,
    textarea = false
  ) => (
    <div>
      <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">{label}</label>
      {textarea ? (
        <textarea
          {...dokuForm.register(name)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
      ) : (
        <input
          type="text"
          {...dokuForm.register(name)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
      )}
      {dokuForm.formState.errors[name] && (
        <p className="mt-1 text-xs text-red-600">{dokuForm.formState.errors[name]?.message}</p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="GoBD-Verfahrensdokumentation"
        description="Vorlage aus Kanzlei-Stammdaten + Ablaufbeschreibung (GoBD Rz. 151 ff.)"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Verfahrensdoku" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={printPdf} className="gap-1.5 text-xs">
              <Printer size={14} /> PDF / Drucken
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadWord}
              className="gap-1.5 text-xs"
            >
              <Download size={14} /> Word (.doc)
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              disabled={saving}
              className="brand-bg brand-bg gap-1.5 text-xs text-white"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved ? (
                <CheckCircle2 size={14} />
              ) : (
                <Save size={14} />
              )}
              {saved ? "Gespeichert" : "Im Brain speichern"}
            </Button>
          </div>
        }
      />

      {/* Honest framing */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-600">
          Dies erzeugt eine <strong>Vorlage</strong>, kein prüfungssicheres Dokument. Die
          Verfahrensdokumentation muss an den tatsächlichen Kanzleiablauf angepasst,
          anwaltlich/steuerlich geprüft und vom Berater bzw. Betriebsprüfer abgenommen werden.
          Subsumio liefert technische GoBD-Bausteine — keine Konformitätszusage.
        </p>
      </div>

      {saveError && <div className="text-xs text-red-600">{saveError}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Stammdaten</h2>
            {field("Kanzlei / Unternehmen", "kanzleiName", "z.B. Kanzlei Muster")}
            {field("Vertretungsberechtigte/r", "anwaltName", "z.B. RA Dr. Muster")}
            {field("USt-IdNr.", "ustId", "DE123456789")}
            {field(
              "Verantwortlich für die Ordnungsmäßigkeit",
              "verantwortlich",
              "Name der zuständigen Person"
            )}
            {field("Stand (Datum)", "stand", today)}
          </div>

          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Ablaufbeschreibung
            </h2>
            {field("Eingesetzte DV-Systeme", "systeme", "Subsumio, DATEV, beA …")}
            {field(
              "Belegeingang",
              "belegEingang",
              "Wie kommen Belege herein? (Post, E-Mail, Upload, Scan)",
              true
            )}
            {field(
              "Erfassung & Verbuchung",
              "erfassung",
              "Wie/wann werden Belege erfasst und verbucht?",
              true
            )}
            {field(
              "Ablage & Aufbewahrungsort",
              "ablageOrt",
              "Wo werden Belege unveränderbar abgelegt?",
              true
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Betrieb & Kontrolle
            </h2>
            {field(
              "Datensicherung / Backup",
              "backup",
              "Sicherungskonzept, Frequenz, Aufbewahrung der Backups",
              true
            )}
            {field(
              "Zugriffsschutz",
              "zugriffsschutz",
              "Berechtigungskonzept, Authentifizierung",
              true
            )}
            {field(
              "Internes Kontrollsystem (IKS)",
              "iks",
              "Funktionstrennung, Plausibilitätskontrollen",
              true
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
            <FileText size={14} className="brand-text" />
            <span className="text-sm font-semibold text-[color:var(--ds-text)]">
              Vorschau (Markdown)
            </span>
          </div>
          <pre className="max-h-[70vh] overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
            {markdown}
          </pre>
        </div>
      </div>
    </div>
  );
}
