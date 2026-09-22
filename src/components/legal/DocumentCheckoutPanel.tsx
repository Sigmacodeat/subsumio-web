"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Lock, LockOpen, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import type { DocumentLock, DocumentVersionFrontmatter } from "@/lib/document-versions";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });

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
          {[...versions].reverse().map((v) => (
            <li key={v.version} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <span className="font-medium">v{v.version}</span>
                <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
                  {fmtDate(v.checked_in_at)} · {v.checked_in_by}
                  {v.note ? ` — ${v.note}` : ""}
                </span>
              </div>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
