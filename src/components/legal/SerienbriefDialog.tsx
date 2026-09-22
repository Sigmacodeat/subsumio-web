"use client";

import { useMemo, useState } from "react";
import { FileUp, Loader2, Plus, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { extractDocxVariables, DocxTemplateError } from "@/lib/docx-template";
import { CaseSelect } from "@/components/legal/case-select";

interface RecipientRow {
  filename: string;
  values: Record<string, string>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Serienbrief: eine .docx-Vorlage wird einmal hochgeladen, die enthaltenen
 * {{variablen}} werden erkannt und pro Empfängerzeile befüllt. Das
 * Ergebnis ist ein ZIP mit einem fertigen .docx je Zeile
 * (POST /api/legal/docx-fill mit `rows`).
 */
export function SerienbriefDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [caseSlug, setCaseSlug] = useState("");
  const [rows, setRows] = useState<RecipientRow[]>([{ filename: "", values: {} }]);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () => !!file && variables.length >= 0 && rows.length > 0 && !busy,
    [file, variables.length, rows.length, busy]
  );

  async function onPickFile(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setParseError(null);
    setFile(f);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      setVariables(extractDocxVariables(buf));
    } catch (err) {
      setVariables([]);
      setParseError(
        err instanceof DocxTemplateError ? err.message : "Die Datei konnte nicht gelesen werden."
      );
    } finally {
      setParsing(false);
    }
  }

  function setRowValue(i: number, key: string, value: string) {
    setRows((rs) =>
      rs.map((r, idx) => (idx === i ? { ...r, values: { ...r.values, [key]: value } } : r))
    );
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const templateBase64 = await fileToBase64(file);
      const res = await csrfFetch("/api/legal/docx-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateBase64,
          caseSlug: caseSlug || undefined,
          rows: rows.map((r, i) => ({
            filename: r.filename.trim() || `serienbrief-${i + 1}.docx`,
            values: r.values,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.data?.base64) {
        throw new Error(data?.message ?? "Serienbrief fehlgeschlagen");
      }
      downloadBase64(data.data.base64, data.data.filename ?? "serienbrief.zip", "application/zip");
      addToast({
        type: "success",
        title: `Serienbrief erstellt — ${data.data.count} Dokumente.`,
      });
      onClose();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Serienbrief fehlgeschlagen.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={16} aria-hidden /> Serienbrief erstellen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sb-file">
              .docx-Vorlage mit &#123;&#123;platzhaltern&#125;&#125; *
            </Label>
            <Input
              id="sb-file"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => void onPickFile(e.target.files)}
            />
            {parsing && (
              <p className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                <Loader2 size={12} className="animate-spin" aria-hidden /> Platzhalter werden
                erkannt …
              </p>
            )}
            {parseError && (
              <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                {parseError}
              </p>
            )}
            {file && !parsing && !parseError && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {variables.length > 0
                  ? `Erkannte Platzhalter: ${variables.join(", ")}`
                  : "Keine Platzhalter gefunden — die Vorlage wird unverändert vervielfältigt."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sb-case">Akte (befüllt Akten- und Kanzlei-Platzhalter)</Label>
            <CaseSelect value={caseSlug} onChange={setCaseSlug} id="sb-case" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Empfängerzeilen ({rows.length})</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={rows.length >= 500}
                onClick={() => setRows((rs) => [...rs, { filename: "", values: {} }])}
              >
                <Plus size={13} className="mr-1" aria-hidden /> Zeile
              </Button>
            </div>
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <fieldset
                  key={i}
                  className="space-y-2 rounded-lg border border-[color:var(--ds-border)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <legend className="px-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
                      Empfänger {i + 1}
                    </legend>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Empfänger ${i + 1} entfernen`}
                        className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                        onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`sb-fn-${i}`} className="text-[11px]">
                      Dateiname (optional)
                    </Label>
                    <Input
                      id={`sb-fn-${i}`}
                      value={row.filename}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((r, idx) => (idx === i ? { ...r, filename: e.target.value } : r))
                        )
                      }
                      placeholder={`serienbrief-${i + 1}.docx`}
                    />
                  </div>
                  {variables.map((v) => (
                    <div key={v} className="space-y-1">
                      <Label htmlFor={`sb-${i}-${v}`} className="text-[11px]">
                        {v}
                      </Label>
                      <Input
                        id={`sb-${i}-${v}`}
                        value={row.values[v] ?? ""}
                        onChange={(e) => setRowValue(i, v, e.target.value)}
                      />
                    </div>
                  ))}
                </fieldset>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileUp className="mr-2 h-4 w-4" aria-hidden />
              )}
              ZIP erzeugen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
