"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Layers, Loader2, Stamp, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

interface RedactRect {
  page: number;
  /** Canvas-Pixel (bei Render-Scale), werden auf PDF-Koordinaten umgerechnet. */
  x: number;
  y: number;
  w: number;
  h: number;
}

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PdfToolsPage() {
  const { addToast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [aktenzeichen, setAktenzeichen] = useState("");
  const [busy, setBusy] = useState<"merge" | "stamp" | "redact" | "letterhead" | null>(null);

  // ── Briefpapier-Overlay: Briefpapier-PDF unter jede Seite legen ──
  const [letterheadFile, setLetterheadFile] = useState<File | null>(null);
  const [letterheadContent, setLetterheadContent] = useState<File | null>(null);

  // ── Schwärzen (clientseitig, rasterisiert → echte Redaktion) ──
  const [redactFile, setRedactFile] = useState<File | null>(null);
  const [redactRects, setRedactRects] = useState<RedactRect[]>([]);
  const [redactPageCount, setRedactPageCount] = useState(0);
  const [redactLoading, setRedactLoading] = useState(false);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderScale = 1.5;
  const dragRef = useRef<{ page: number; x: number; y: number } | null>(null);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length < list.length) {
      addToast({ type: "error", title: "Nur PDF-Dateien sind erlaubt" });
    }
    setFiles((prev) => [...prev, ...pdfs]);
  };

  const move = (i: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  async function runServerOp(op: "merge" | "stamp-merge") {
    if (files.length === 0) return;
    setBusy(op === "merge" ? "merge" : "stamp");
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const sp = new URLSearchParams({ op });
      if (aktenzeichen.trim()) sp.set("aktenzeichen", aktenzeichen.trim());
      const res = await csrfFetch(`/api/legal/pdf-tools?${sp}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({ type: "error", title: data.message ?? "PDF-Verarbeitung fehlgeschlagen" });
        return;
      }
      const blob = await res.blob();
      downloadBlob(blob, op === "merge" ? "zusammengefuehrt.pdf" : "anlagen.pdf");
      addToast({ type: "success", title: "PDF erstellt" });
    } catch {
      addToast({ type: "error", title: "PDF-Verarbeitung fehlgeschlagen" });
    } finally {
      setBusy(null);
    }
  }

  // ── Redaction ────────────────────────────────────────────────────

  const renderRedactFile = useCallback(
    async (file: File) => {
      setRedactLoading(true);
      setRedactRects([]);
      canvasRefs.current.clear();
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        setRedactPageCount(doc.numPages);
        // Render all pages to their canvases (they mount below).
        await new Promise((r) => setTimeout(r, 50));
        for (let p = 1; p <= doc.numPages; p++) {
          const canvas = canvasRefs.current.get(p);
          if (!canvas) continue;
          const page = await doc.getPage(p);
          const viewport = page.getViewport({ scale: renderScale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        }
      } catch {
        addToast({ type: "error", title: "PDF konnte nicht gerendert werden" });
        setRedactFile(null);
      } finally {
        setRedactLoading(false);
      }
    },
    [addToast]
  );

  function canvasPos(e: React.MouseEvent, canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  }

  function onRedactDown(e: React.MouseEvent, page: number) {
    const canvas = canvasRefs.current.get(page);
    if (!canvas) return;
    const p = canvasPos(e, canvas);
    dragRef.current = { page, x: p.x, y: p.y };
  }

  function onRedactUp(e: React.MouseEvent, page: number) {
    const canvas = canvasRefs.current.get(page);
    const start = dragRef.current;
    dragRef.current = null;
    if (!canvas || !start || start.page !== page) return;
    const p = canvasPos(e, canvas);
    const w = Math.abs(p.x - start.x);
    const h = Math.abs(p.y - start.y);
    if (w < 8 || h < 8) return;
    setRedactRects((prev) => [
      ...prev,
      { page, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w, h },
    ]);
  }

  async function exportRedacted() {
    if (!redactFile) return;
    setBusy("redact");
    try {
      const pdfjs = await loadPdfjs();
      const src = await pdfjs.getDocument({ data: await redactFile.arrayBuffer() }).promise;
      const { PDFDocument } = await import("pdf-lib");
      const out = await PDFDocument.create();
      for (let p = 1; p <= src.numPages; p++) {
        const page = await src.getPage(p);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx2d = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx2d, viewport }).promise;
        // Rects wurden bei renderScale gezeichnet → auf Export-Scale umrechnen.
        const k = 2 / renderScale;
        ctx2d.fillStyle = "#000";
        for (const r of redactRects.filter((r) => r.page === p)) {
          ctx2d.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
        }
        // Rasterisierung = irreversible Schwärzung (keine Textschicht mehr).
        const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
        if (!png) throw new Error("rasterize_failed");
        const img = await out.embedPng(await png.arrayBuffer());
        const pdfPage = out.addPage([viewport.width / 2, viewport.height / 2]);
        pdfPage.drawImage(img, {
          x: 0,
          y: 0,
          width: viewport.width / 2,
          height: viewport.height / 2,
        });
      }
      const bytes = await out.save();
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), "geschwaerzt.pdf");
      addToast({ type: "success", title: "Geschwärzte PDF exportiert" });
      setRedactFile(null);
      setRedactRects([]);
    } catch {
      addToast({ type: "error", title: "Schwärzung fehlgeschlagen" });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (redactFile) void renderRedactFile(redactFile);
  }, [redactFile, renderRedactFile]);

  const redactCount = redactRects.length;

  async function applyLetterhead() {
    if (!letterheadFile || !letterheadContent) return;
    setBusy("letterhead");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const lhDoc = await PDFDocument.load(await letterheadFile.arrayBuffer());
      const contentDoc = await PDFDocument.load(await letterheadContent.arrayBuffer());
      const out = await PDFDocument.create();
      const [lhPage] = await out.embedPdf(lhDoc, [0]);
      const contentPages = contentDoc.getPages();
      const embedded = await out.embedPdf(
        contentDoc,
        contentPages.map((_, i) => i)
      );
      contentPages.forEach((srcPage, i) => {
        const { width, height } = srcPage.getSize();
        const page = out.addPage([width, height]);
        // Briefpapier als Hintergrund (auf Seitenformat skaliert), Inhalt darüber.
        page.drawPage(lhPage, { x: 0, y: 0, width, height });
        page.drawPage(embedded[i]!, { x: 0, y: 0, width, height });
      });
      const bytes = await out.save();
      const name = letterheadContent.name.replace(/\.pdf$/i, "") + "-briefpapier.pdf";
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      addToast({ type: "success", title: "Briefpapier angewendet" });
    } catch {
      addToast({ type: "error", title: "Briefpapier-Overlay fehlgeschlagen" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="PDF-Werkzeuge"
        description="Zusammenführen, Anlagen stempeln und irreversibel schwärzen."
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "PDF-Werkzeuge" }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Zusammenführen + Anlagenstempel */}
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
            <Layers size={15} aria-hidden /> Zusammenführen & Anlagenstempel
          </h2>
          <label
            htmlFor="pdf-merge-input"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] px-4 py-8 text-center text-sm text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-text)]"
          >
            <FileText size={20} aria-hidden />
            PDFs auswählen (Reihenfolge = Zusammenführung)
            <input
              id="pdf-merge-input"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm"
                >
                  <span className="w-5 shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                    {i + 1}.
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text)]">
                    {f.name}
                  </span>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Nach oben"
                    className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] disabled:opacity-30"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === files.length - 1}
                    aria-label="Nach unten"
                    className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] disabled:opacity-30"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`${f.name} entfernen`}
                    className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pdf-az" className="text-xs">
              Aktenzeichen für den Stempel (optional)
            </Label>
            <Input
              id="pdf-az"
              value={aktenzeichen}
              onChange={(e) => setAktenzeichen(e.target.value)}
              placeholder="z. B. MUSTER-26-0042"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={files.length < 2 || busy !== null}
              onClick={() => void runServerOp("merge")}
            >
              {busy === "merge" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Layers size={13} />
              )}
              Zusammenführen
            </Button>
            <Button
              size="sm"
              disabled={files.length === 0 || busy !== null}
              onClick={() => void runServerOp("stamp-merge")}
            >
              {busy === "stamp" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Stamp size={13} />
              )}
              Als Anlagen stempeln & bündeln
            </Button>
          </div>
        </section>

        {/* Schwärzen */}
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
            <X size={15} aria-hidden /> Schwärzen
          </h2>
          <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            Die Schwärzung läuft vollständig in Ihrem Browser: Jede Seite wird rasterisiert und die
            markierten Bereiche schwarz überdeckt — die Textschicht existiert in der Ausgabe nicht
            mehr. Das Dokument verlässt die Kanzlei nicht.
          </p>
          <label
            htmlFor="pdf-redact-input"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] px-4 py-8 text-center text-sm text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-text)]"
          >
            <FileText size={20} aria-hidden />
            {redactFile ? redactFile.name : "PDF zum Schwärzen auswählen"}
            <input
              id="pdf-redact-input"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                setRedactFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>

          {redactLoading && (
            <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <Loader2 size={13} className="animate-spin" /> Seiten werden gerendert…
            </p>
          )}

          {redactFile && !redactLoading && redactPageCount > 0 && (
            <>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Rahmen mit der Maus aufziehen. {redactCount}{" "}
                {redactCount === 1 ? "Bereich markiert" : "Bereiche markiert"}.
                {redactCount > 0 && (
                  <button
                    className="ml-2 underline hover:text-[color:var(--ds-text)]"
                    onClick={() => setRedactRects([])}
                  >
                    Alle zurücksetzen
                  </button>
                )}
              </p>
              <div className="max-h-[480px] space-y-4 overflow-y-auto">
                {Array.from({ length: redactPageCount }, (_, i) => i + 1).map((p) => (
                  <div key={p} className="relative">
                    <canvas
                      ref={(el) => {
                        if (el) canvasRefs.current.set(p, el);
                        else canvasRefs.current.delete(p);
                      }}
                      onMouseDown={(e) => onRedactDown(e, p)}
                      onMouseUp={(e) => onRedactUp(e, p)}
                      className={cn(
                        "w-full cursor-crosshair rounded-lg border border-[color:var(--ds-border)]",
                        "select-none"
                      )}
                    />
                    {redactRects
                      .filter((r) => r.page === p)
                      .map((r, idx) => (
                        <div
                          key={idx}
                          aria-hidden
                          className="pointer-events-none absolute bg-black"
                          style={{
                            left: `${(r.x / (canvasRefs.current.get(p)?.width ?? 1)) * 100}%`,
                            top: `${(r.y / (canvasRefs.current.get(p)?.height ?? 1)) * 100}%`,
                            width: `${(r.w / (canvasRefs.current.get(p)?.width ?? 1)) * 100}%`,
                            height: `${(r.h / (canvasRefs.current.get(p)?.height ?? 1)) * 100}%`,
                          }}
                        />
                      ))}
                    <span className="absolute top-1 left-1 rounded bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text-muted)]">
                      S. {p}
                    </span>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                disabled={busy !== null || redactCount === 0}
                onClick={() => void exportRedacted()}
              >
                {busy === "redact" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <X size={13} />
                )}
                Geschwärzte PDF exportieren
              </Button>
            </>
          )}
        </section>

        {/* Briefpapier-Overlay */}
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
            <Stamp size={15} aria-hidden /> Briefpapier anwenden
          </h2>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Legt die erste Seite eines Briefpapier-PDFs als Hintergrund unter jede Seite des
            Dokuments — z.&nbsp;B. für Ausfertigungen ohne gedrucktes Papier.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lh-file" className="text-xs">
                Briefpapier (PDF, 1. Seite)
              </Label>
              <Input
                id="lh-file"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setLetterheadFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lh-content" className="text-xs">
                Dokument (PDF)
              </Label>
              <Input
                id="lh-content"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setLetterheadContent(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={busy !== null || !letterheadFile || !letterheadContent}
            onClick={() => void applyLetterhead()}
          >
            {busy === "letterhead" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Stamp size={13} />
            )}
            Briefpapier anwenden
          </Button>
        </section>
      </div>
    </div>
  );
}
