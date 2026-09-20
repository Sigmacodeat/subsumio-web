"use client";

/**
 * Norm reader — the full text of a cited § / Art. next to the AI answer.
 *
 * Non-modal on purpose: the answer stays readable beside the norm, so a lawyer
 * can check an argument against the text without losing their place. Opens
 * from any verified citation (inline link in an answer, the citation panel)
 * via `openNormReader()`; mounted once in the dashboard layout.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, ExternalLink, Loader2, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import type { NormReading } from "@/lib/legal-grounding";
import {
  NORM_READER_EVENT,
  isPlainClick,
  readerJurisdiction,
  type NormReaderRequest,
} from "@/lib/norm-reader-events";
import { cn } from "@/lib/utils";
import { officialSourceIn } from "@/lib/citation-gate-client";

type State =
  | { status: "idle" }
  | { status: "loading"; req: NormReaderRequest }
  | { status: "ready"; req: NormReaderRequest; norm: NormReading }
  | { status: "error"; req: NormReaderRequest; message: string };

const JURISDICTION_LABEL: Record<string, string> = {
  at: "Österreich",
  de: "Deutschland",
  ch: "Schweiz",
  eu: "EU",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : null;
}

type Block = { marker: string | null; body: string };

/**
 * RIS norm text → reading layout. Austrian texts open with section headings
 * ("Klage.", "Von der Verbindlichkeit zum Schadenersatze") before the norm
 * marker ("§ 1295." / "Artikel 7."). Headings are set apart like in RIS; the
 * marker becomes the centred norm title; "(1)" Absätze and "1." Ziffern get a
 * hanging number.
 */
export function layoutNormText(text: string): {
  headings: string[];
  normTitle: string | null;
  blocks: Block[];
} {
  const clean = text.replace(/\r/g, "").trim();
  const markerRx = /(^|\n)\s*((?:§\.?\s*\d+[a-z]*|Artikel\s+\d+[a-z]*)\.)\s*/;
  const m = clean.match(markerRx);
  let headings: string[] = [];
  let normTitle: string | null = null;
  let body = clean;
  if (m && m.index !== undefined) {
    headings = clean
      .slice(0, m.index)
      .split(/\n\s*\n/)
      .map((h) => h.trim())
      .filter(Boolean);
    normTitle = m[2].replace(/^§\.\s*/, "§ ").replace(/\.$/, "");
    body = clean.slice(m.index + m[0].length);
  }
  const blocks = body
    .split(/\n\s*\n|\n(?=\(\d+[a-z]?\)\s)/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b): Block => {
      const bm = b.match(/^(\(\d+[a-z]?\)|\d+[a-z]?[.)]|[a-z]\))\s+([\s\S]*)$/);
      return bm ? { marker: bm[1], body: bm[2] } : { marker: null, body: b };
    });
  return { headings, normTitle, blocks };
}

export function NormReaderPanel() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const reqSeq = useRef(0);
  const [openCount, setOpenCount] = useState(0);

  const open = useCallback((req: NormReaderRequest) => {
    if (document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
    const seq = ++reqSeq.current;
    setCopied(false);
    setState({ status: "loading", req });
    setOpenCount((n) => n + 1);
    api.legal
      .norm(req.code, req.paragraph, req.jurisdiction)
      .then((norm) => {
        if (seq === reqSeq.current) setState({ status: "ready", req, norm });
      })
      .catch((err: unknown) => {
        if (seq !== reqSeq.current) return;
        setState({
          status: "error",
          req,
          message: err instanceof Error ? err.message : "Normtext konnte nicht geladen werden.",
        });
      });
  }, []);

  const close = useCallback(() => {
    reqSeq.current++;
    setState({ status: "idle" });
    returnFocusRef.current?.focus?.();
  }, []);

  // Programmatic opens (citation panel, research tabs).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<NormReaderRequest>).detail;
      if (detail?.code && detail?.paragraph) open(detail);
    };
    window.addEventListener(NORM_READER_EVENT, onOpen);
    return () => window.removeEventListener(NORM_READER_EVENT, onOpen);
  }, [open]);

  // Inline citation links rendered into answer HTML carry data-code/-paragraph.
  // A plain click reads the norm here; cmd/middle click still opens RIS.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!isPlainClick(e)) return;
      const a = (e.target as Element | null)?.closest?.("a.citation-official[data-code]");
      if (!(a instanceof HTMLAnchorElement)) return;
      const code = a.dataset.code;
      const paragraph = a.dataset.paragraph;
      if (!code || !paragraph) return;
      e.preventDefault();
      returnFocusRef.current = a;
      open({ code, paragraph, jurisdiction: readerJurisdiction(a.dataset.jurisdiction) });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const isOpen = state.status !== "idle";

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // On wide screens the panel takes its own column instead of covering the
  // answer (globals.css: html[data-norm-reader="open"] #main-content).
  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) root.dataset.normReader = "open";
    else delete root.dataset.normReader;
    return () => {
      delete root.dataset.normReader;
    };
  }, [isOpen]);

  // Move focus into the panel when a norm opens, so keyboard/screen-reader
  // users land on what they asked for.
  useEffect(() => {
    if (openCount > 0) headingRef.current?.focus();
  }, [openCount]);

  if (!isOpen) return null;

  const req = state.req;
  const norm = state.status === "ready" ? state.norm : null;
  // The abbreviation as the answer cited it ("ZPO"), not the corpus label ("ZPO-AT").
  const title = `${req.paragraph} ${req.code}`;
  const inForce = formatDate(norm?.in_force_since ?? null);
  const retrieved = formatDate(norm?.retrieved_at ?? null);

  async function copyText() {
    if (!norm?.text) return;
    try {
      await navigator.clipboard.writeText(`${title}\n\n${norm.text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  }

  return (
    <aside
      aria-label={`Normtext: ${title}`}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[45] flex max-h-[85dvh] flex-col rounded-t-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-2xl",
        "md:top-12 md:right-0 md:bottom-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:border-y-0 md:border-r-0 md:shadow-xl"
      )}
    >
      {/* Header */}
      <header className="flex items-start gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-5 py-4">
        <div className="brand-soft brand-border mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
          <BookOpen size={15} className="brand-text" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-[15px] leading-tight font-semibold text-[color:var(--ds-text)] outline-none"
          >
            {title}
          </h2>
          <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
            {norm?.statute ?? (norm ? JURISDICTION_LABEL[norm.jurisdiction] : "Normtext")}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Normtext schließen"
          className="-mr-1 rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
        >
          <X size={16} />
        </button>
      </header>

      {/* Status strip */}
      {norm && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--ds-border)] px-5 py-2.5 text-[11px]">
          {norm.text ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-2 py-0.5 font-medium text-[color:var(--ds-success-text)]">
              <ShieldCheck size={11} aria-hidden="true" />
              Im Rechtskorpus verifiziert
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2 py-0.5 font-medium text-[color:var(--ds-warning-text)]">
              Nicht im Rechtskorpus gefunden
            </span>
          )}
          <span className="rounded-full border border-[color:var(--ds-border)] px-2 py-0.5 text-[color:var(--ds-text-muted)]">
            {JURISDICTION_LABEL[norm.jurisdiction] ?? norm.jurisdiction.toUpperCase()}
          </span>
          {inForce && (
            <span className="rounded-full border border-[color:var(--ds-border)] px-2 py-0.5 text-[color:var(--ds-text-muted)]">
              in Kraft seit {inForce}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" aria-live="polite">
        {state.status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
            <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />
            Normtext wird geladen …
          </div>
        )}
        {state.status === "error" && (
          <p className="text-sm text-[color:var(--ds-warning-text)]">
            {state.message.includes("unknown_statute")
              ? "Dieses Gesetz ist im Rechtskorpus nicht enthalten."
              : "Der Normtext konnte nicht geladen werden."}
          </p>
        )}
        {norm && !norm.text && (
          <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            Diese Bestimmung ist im Rechtskorpus nicht enthalten. Bitte die Fundstelle in der
            amtlichen Quelle prüfen.
          </p>
        )}
        {norm?.text && <NormText text={norm.text} />}
      </div>

      {/* Footer */}
      <footer className="space-y-2.5 border-t border-[color:var(--ds-border)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          {norm?.source_url && (
            <a
              href={norm.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-solid)] px-3 py-2 text-sm font-medium text-white transition-[background-color] hover:bg-[color:var(--brand-solid-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
            >
              Amtliche Fassung {officialSourceIn(norm.source_url)}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
          {norm?.text && (
            <button
              type="button"
              onClick={copyText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          )}
        </div>
        <p className="text-[11px] leading-snug text-[color:var(--ds-text-subtle)]">
          {norm?.source_url
            ? `Rechtlich maßgeblich ist die ${officialSourceIn(norm.source_url)} kundgemachte Fassung.`
            : "Rechtlich maßgeblich ist die amtlich kundgemachte Fassung."}
          {retrieved ? ` Stand unseres Korpus: ${retrieved}.` : ""}
        </p>
      </footer>
    </aside>
  );
}

function NormText({ text }: { text: string }) {
  const { headings, normTitle, blocks } = layoutNormText(text);
  return (
    <article className="text-[14.5px] leading-[1.7] text-[color:var(--ds-text)]">
      {headings.length > 0 && (
        <div className="mb-4 space-y-1 text-center text-[13px] leading-snug text-[color:var(--ds-text-muted)]">
          {headings.map((h, i) => (
            <p key={i}>{h}</p>
          ))}
        </div>
      )}
      {normTitle && (
        <p className="mb-3 text-center text-[15px] font-semibold tracking-wide">{normTitle}</p>
      )}
      {blocks.map((b, i) =>
        b.marker ? (
          <p key={i} className="mb-3 grid grid-cols-[2.25rem_1fr] gap-x-1">
            <span className="text-[color:var(--ds-text-muted)] tabular-nums">{b.marker}</span>
            <span className="whitespace-pre-line">{b.body}</span>
          </p>
        ) : (
          <p key={i} className="mb-3 whitespace-pre-line">
            {b.body}
          </p>
        )
      )}
    </article>
  );
}
