"use client";

/**
 * The original PDF of a document, rendered with pdf.js: each page is a canvas
 * with a selectable text layer on top, so "Markieren & fragen" and citation
 * jumps (?hl=, lib/highlight-quote.ts) work on the original, not only on the
 * extracted text. Canvases render as pages scroll into view; the text layers
 * of all pages render up front (they are cheap) so a cited passage on any page
 * can be found. When every text layer is in place the viewer fires
 * `subsumio:document-text-ready`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";

export const DOCUMENT_TEXT_READY_EVENT = "subsumio:document-text-ready";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;

function PdfPage({
  pdfjs,
  page,
  scale,
  onTextReady,
}: {
  pdfjs: PdfJs;
  page: PDFPageProxy;
  scale: number;
  onTextReady: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const viewport = page.getViewport({ scale });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Text layer: always, so every page's text can be searched and selected.
  useEffect(() => {
    const container = textRef.current;
    if (!container) return;
    container.replaceChildren();
    const layer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport,
    });
    let cancelled = false;
    layer
      .render()
      .then(() => {
        if (!cancelled) onTextReady();
      })
      .catch(() => {
        if (!cancelled) onTextReady();
      });
    return () => {
      cancelled = true;
      layer.cancel();
    };
    // viewport is derived from page + scale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfjs, page, scale]);

  // Canvas: once the page is near the viewport.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    const task = page.render({
      canvasContext: context,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
    });
    task.promise.catch(() => {
      // cancelled or failed — the text layer stays usable
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, page, scale]);

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto bg-white shadow-sm ring-1 ring-[color:var(--ds-border)]"
      style={
        {
          width: viewport.width,
          height: viewport.height,
          "--scale-factor": String(scale),
        } as React.CSSProperties
      }
      aria-label={`Seite ${page.pageNumber}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: viewport.width, height: viewport.height }}
        aria-hidden="true"
      />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}

export function PdfDocumentViewer({ url, title }: { url: string; title?: string }) {
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1.2);
  const textPending = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setPages([]);
    setError(false);
    loadPdfJs()
      .then(async (lib) => {
        const task = lib.getDocument({ url, isEvalSupported: false, withCredentials: true });
        doc = await task.promise;
        const loaded = await Promise.all(
          Array.from({ length: doc.numPages }, (_, i) => doc!.getPage(i + 1))
        );
        if (cancelled) return;
        textPending.current = loaded.length;
        setPdfjs(lib);
        setPages(loaded);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [url]);

  const onTextReady = useCallback(() => {
    textPending.current -= 1;
    if (textPending.current === 0) window.dispatchEvent(new Event(DOCUMENT_TEXT_READY_EVENT));
  }, []);

  const zoom = (factor: number) => {
    textPending.current = pages.length;
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * factor * 10) / 10)));
  };

  if (error) {
    return (
      <p className="rounded-lg border border-[color:var(--ds-border)] p-4 text-sm text-[color:var(--ds-text-muted)]">
        Die PDF-Ansicht konnte nicht geladen werden.{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
          Original öffnen
        </a>
      </p>
    );
  }

  return (
    <section
      aria-label={title ? `Original: ${title}` : "Original-PDF"}
      className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)]">
        <span>
          {pages.length > 0 ? `${pages.length} Seite${pages.length === 1 ? "" : "n"}` : ""}
        </span>
        <span className="ml-auto tabular-nums">{Math.round(scale * 100)} %</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => zoom(1 / 1.2)}
          disabled={scale <= MIN_SCALE}
          aria-label="Verkleinern"
        >
          <ZoomOut size={14} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => zoom(1.2)}
          disabled={scale >= MAX_SCALE}
          aria-label="Vergrößern"
        >
          <ZoomIn size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="max-h-[80vh] space-y-4 overflow-auto p-4">
        {!pdfjs || pages.length === 0 ? (
          <div className="flex justify-center py-16" role="status" aria-live="polite">
            <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
            <span className="sr-only">PDF wird geladen</span>
          </div>
        ) : (
          pages.map((page) => (
            <PdfPage
              key={`${page.pageNumber}-${scale}`}
              pdfjs={pdfjs}
              page={page}
              scale={scale}
              onTextReady={onTextReady}
            />
          ))
        )}
      </div>
    </section>
  );
}
