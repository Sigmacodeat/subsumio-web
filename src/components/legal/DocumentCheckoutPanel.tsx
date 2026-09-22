"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitCompareArrows, History, Lock, LockOpen, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { diffWords, diffStats, type DiffToken } from "@/lib/word-diff";
import type { DocumentLock, DocumentVersionFrontmatter } from "@/lib/document-versions";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });

// LCS ist O(m·n) über Wort-Token — bei sehr großen Dokumenten den
// Inline-Diff verweigern statt den Tab einzufrieren.
const MAX_DIFF_TOKEN_PRODUCT = 2_000_000;

function DiffSideBySide({ left, right }: { left: string; right: string }) {
  const diff = useMemo(() => diffWords(left, right), [left, right]);
  return (
    <div className="grid max-h-80 grid-cols-1 gap-3 overflow-auto sm:grid-cols-2">
      <pre className="font-[family-name:var(--font-inter)] text-xs leading-relaxed break-words whitespace-pre-wrap text-[color:var(--ds-text)]">
        <DiffTokens tokens={diff.left} side="left" />
      </pre>
      <pre className="font-[family-name:var(--font-inter)] text-xs leading-relaxed break-words whitespace-pre-wrap text-[color:var(--ds-text)] sm:border-l sm:border-[color:var(--ds-border)] sm:pl-3">
        <DiffTokens tokens={diff.right} side="right" />
      </pre>
    </div>
  );
}

function DiffTokens({ tokens, side }: { tokens: DiffToken[]; side: "left" | "right" }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.type === "equal" ? (
          <span key={i}>{t.text}</span>
        ) : (
          <mark
            key={i}
            className={
              t.type === "removed" && side === "left"
                ? "rounded-sm bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] line-through decoration-[color:var(--ds-danger-text)]"
                : t.type === "added" && side === "right"
                  ? "rounded-sm bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                  : "rounded-sm opacity-40"
            }
          >
            {t.text}
          </mark>
        )
      )}
    </>
  );
}

/**
 * Check-in/Check-out + Versionsliste für Akten-Dokumente.
 * Die Sperre wird serverseitig in /api/pages erzwungen (409 für Fremde).
 */
export function DocumentCheckoutPanel({
  slug,
  lockedBy,
  onChanged,
}: {
  slug: string;
  /** Lock aus dem Dokument-Frontmatter (null = frei). */
  lockedBy: DocumentLock | null;
  onChanged?: () => void;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<"checkout" | "checkin" | "release" | number | null>(null);
  const [versions, setVersions] = useState<DocumentVersionFrontmatter[] | null>(null);
  const [versionsError, setVersionsError] = useState(false);
  const [diffFor, setDiffFor] = useState<number | null>(null);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/legal/documents/versions?slug=${encodeURIComponent(slug)}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setVersions(data.data ?? data ?? []);
      setVersionsError(false);
    } catch {
      setVersionsError(true);
    }
  }, [slug]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  async function post(path: string, payload: Record<string, unknown>, kind: typeof busy) {
    setBusy(kind);
    try {
      const res = await csrfFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast({
          type: "error",
          title: data.message ?? "Aktion fehlgeschlagen",
        });
        return;
      }
      addToast({ type: "success", title: "Gespeichert" });
      await loadVersions();
      onChanged?.();
    } catch {
      addToast({ type: "error", title: "Aktion fehlgeschlagen" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="Versionen und Sperre"
      className="space-y-3 rounded-lg border border-[color:var(--ds-border)] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <History size={15} aria-hidden /> Versionen
        </h3>
        {lockedBy ? (
          <Badge variant="warning">
            <Lock size={11} className="mr-1" aria-hidden />
            Ausgecheckt von {lockedBy.userEmail || "Kolleg:in"}
          </Badge>
        ) : (
          <Badge variant="default">
            <LockOpen size={11} className="mr-1" aria-hidden /> Frei
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!lockedBy && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void post("/api/legal/documents/checkout", { slug }, "checkout")}
          >
            <Lock size={13} className="mr-1.5" aria-hidden /> Auschecken
          </Button>
        )}
        {lockedBy && (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void post("/api/legal/documents/checkin", { slug }, "checkin")}
            >
              Einchecken (Version sichern)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void post("/api/legal/documents/release", { slug }, "release")}
            >
              Sperre freigeben
            </Button>
          </>
        )}
      </div>

      {versionsError ? (
        <p className="text-xs text-[color:var(--ds-danger-text)]" role="alert">
          Versionen konnten nicht geladen werden.
        </p>
      ) : versions === null ? (
        <p className="text-xs text-[color:var(--ds-text-muted)]">Versionen werden geladen…</p>
      ) : versions.length === 0 ? (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Noch keine Versionen — beim ersten Einchecken wird ein Snapshot gesichert.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)] text-sm">
          {[...versions].reverse().map((v) => {
            const prev = versions.find((x) => x.version === v.version - 1);
            const prevContent = prev?.doc_content ?? "";
            const tooLarge =
              prevContent.length > 0 &&
              prevContent.split(/\s+/).length * v.doc_content.split(/\s+/).length >
                MAX_DIFF_TOKEN_PRODUCT;
            const stats =
              diffFor === v.version && !tooLarge ? diffStats(prevContent, v.doc_content) : null;
            return (
              <li key={v.version} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium">v{v.version}</span>
                    <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
                      {fmtDate(v.checked_in_at)} · {v.checked_in_by}
                      {v.note ? ` — ${v.note}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Version ${v.version} mit ${prev ? `Version ${prev.version}` : "leerem Dokument"} vergleichen`}
                      aria-expanded={diffFor === v.version}
                      title="Änderungen zur Vorversion anzeigen"
                      onClick={() => setDiffFor(diffFor === v.version ? null : v.version)}
                    >
                      <GitCompareArrows size={14} aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={busy !== null}
                      aria-label={`Version ${v.version} wiederherstellen`}
                      title="Wiederherstellen (aktueller Stand wird vorher gesichert)"
                      onClick={() =>
                        void post(
                          "/api/legal/documents/versions",
                          { slug, version: v.version },
                          v.version
                        )
                      }
                    >
                      <RotateCcw size={14} aria-hidden />
                    </Button>
                  </div>
                </div>
                {diffFor === v.version && (
                  <div className="mt-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                    {tooLarge ? (
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        Dokument zu groß für Inline-Vergleich — bitte Version wiederherstellen und
                        extern vergleichen.
                      </p>
                    ) : stats && stats.additions === 0 && stats.removals === 0 ? (
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        Keine inhaltlichen Änderungen zur Vorversion.
                      </p>
                    ) : (
                      <>
                        <p className="mb-2 text-xs text-[color:var(--ds-text-muted)]">
                          {stats ? `+${stats.additions} / −${stats.removals} Wörter` : ""} — links{" "}
                          {prev ? `v${prev.version}` : "leer"}, rechts v{v.version}
                        </p>
                        <DiffSideBySide left={prevContent} right={v.doc_content} />
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
