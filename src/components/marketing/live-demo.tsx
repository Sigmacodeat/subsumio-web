"use client";

// Interactive "try the brain" widget for the marketing branch pages. Terminal
// styling matches DemoWindow. Visitors can edit the question and ask a public,
// rate-limited, read-only demo brain (/api/demo). Until the engine is deployed
// /api/demo returns { configured:false } and the widget shows the page's
// scripted answer — so the section is always useful, never broken.

import { useState } from "react";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import type { Lang } from "@/content/site";
import { UI_STRINGS } from "@/content/site";

interface DemoResult {
  slug?: string;
  title?: string;
  snippet?: string;
  chunk_text?: string;
  text?: string;
  evidence?: string;
}

function renderStrongText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold [color:var(--mk-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export default function LiveDemo({
  lang,
  windowTitle,
  you,
  q,
  a,
  sourcesLabel,
  sources,
}: {
  lang: Lang;
  windowTitle: string;
  you: string;
  q: string;
  a: string;
  sourcesLabel: string;
  sources: readonly string[];
}) {
  const [input, setInput] = useState(q);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState<DemoResult[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const t = {
    ask: lang === "en" ? "Ask" : "Fragen",
    placeholder: lang === "en" ? "Ask the demo brain…" : "Frag das Demo-Brain…",
    scripted:
      lang === "en"
        ? "Example answer · live brain after deploy"
        : "Beispiel-Antwort · Live-Brain nach Deploy",
    liveLabel: lang === "en" ? "Live from the demo brain:" : "Live aus dem Demo-Brain:",
    none:
      lang === "en"
        ? "No demo matches — here's the example answer."
        : "Keine Demo-Treffer — hier die Beispiel-Antwort.",
    rate:
      lang === "en"
        ? "Demo limit reached — try again later."
        : "Demo-Limit erreicht — später erneut.",
  };

  async function ask() {
    const query = input.trim();
    if (!query || loading) return;
    setLoading(true);
    setLive(null);
    setNote(null);
    try {
      const res = await fetch(`/api/demo?q=${encodeURIComponent(query)}`);
      if (res.status === 429) {
        setNote(t.rate);
        return;
      }
      const data = await res.json();
      if (data?.configured && Array.isArray(data.results) && data.results.length > 0) {
        setLive(data.results as DemoResult[]);
      } else {
        // engine not deployed yet, or no matches → scripted fallback
        setNote(data?.configured ? t.none : t.scripted);
      }
    } catch {
      setNote(t.scripted);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] text-left shadow-2xl shadow-black/10 [background:var(--mk-surface)]"
      role="region"
      aria-label={UI_STRINGS[lang].liveDemoRegion}
    >
      {/* top bar — matches real dashboard topbar */}
      <div className="flex items-center gap-3 border-b [border-color:var(--mk-border)] px-4 py-2.5 [background:var(--mk-surface)]">
        <div className="flex items-center gap-2">
          <div className="brand-bg flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
            <SubsumioMark size={14} />
          </div>
          <span className="text-xs font-semibold [color:var(--mk-text)]">{windowTitle}</span>
        </div>
      </div>

      {/* editable question */}
      <div className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <div className="brand-soft brand-border mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
            <span className="brand-text text-xs font-semibold">{you}</span>
          </div>
          <div className="focus-within:brand-border-strong flex flex-1 items-end gap-2 rounded-xl border [border-color:var(--mk-border)] px-3 py-2 transition-colors [background:var(--mk-bg)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              rows={2}
              placeholder={t.placeholder}
              aria-label={t.placeholder}
              className="flex-1 resize-none bg-transparent text-sm leading-relaxed [color:var(--mk-text)] placeholder:[color:var(--mk-text-subtle)] focus:outline-none"
            />
            <button
              onClick={ask}
              disabled={loading || !input.trim()}
              aria-label={t.ask}
              className="brand-bg inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-40"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}{" "}
              {t.ask}
            </button>
          </div>
        </div>
      </div>

      {/* answer */}
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-start gap-3">
          <SubsumioMark size={28} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            {live ? (
              <div>
                <p className="brand-text mb-2 flex items-center gap-1.5 text-xs">
                  <CheckCircle2 size={12} /> {t.liveLabel}
                </p>
                <ul className="space-y-2">
                  {live.map((r, i) => (
                    <li
                      key={(r.slug ?? "") + i}
                      className="text-sm leading-relaxed [color:var(--mk-text-muted)]"
                    >
                      <span className="[color:var(--mk-text-muted)]">
                        {r.snippet || r.chunk_text || r.text || r.evidence || r.title}
                      </span>
                      {r.slug && (
                        <span className="brand-text brand-soft ml-2 rounded px-1.5 py-0.5 font-mono text-xs">
                          {r.slug}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-line [color:var(--mk-text)]">
                {renderStrongText(a)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* sources / note */}
      <div className="flex min-h-[40px] flex-wrap items-center gap-2 border-t [border-color:var(--mk-border)] px-5 py-3 [background:var(--mk-bg)]">
        {note ? (
          <span className="text-xs [color:var(--signal-amber)] opacity-80">{note}</span>
        ) : !live ? (
          <>
            <span className="text-xs [color:var(--mk-text)] opacity-60">{sourcesLabel}</span>
            {sources.map((slug) => (
              <span
                key={slug}
                className="brand-text brand-soft rounded px-2 py-0.5 font-mono text-xs"
              >
                {slug}
              </span>
            ))}
          </>
        ) : (
          <span className="text-xs [color:var(--mk-text-subtle)]">
            {lang === "en"
              ? "Read-only demo brain · your data stays yours"
              : "Read-only Demo-Brain · deine Daten bleiben bei dir"}
          </span>
        )}
      </div>
    </div>
  );
}
