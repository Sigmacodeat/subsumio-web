"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";

interface LearningState {
  enabled: boolean;
  canEdit: boolean;
  scope: "org" | "solo";
}

/**
 * Firm setting "Kanzlei-Gehirn lernt mit" (see docs/architecture/BRAIN_LEARNING.md).
 * Admins switch it; everyone else sees it read-only.
 */
export function BrainLearningCard() {
  const { lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const [state, setState] = useState<LearningState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/brain-learning")
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { data: LearningState };
        if (!cancelled) setState(json.data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    if (!state || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await csrfFetch("/api/settings/brain-learning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState({ ...state, enabled: next });
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="brain-learning-title"
      className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="brain-learning-title"
            className="text-sm font-semibold text-[color:var(--ds-text)]"
          >
            {L("Kanzlei-Gehirn lernt mit", "Firm knowledge learns along")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            {L(
              "Legt fest, ob das Wissen Ihrer Kanzlei aus Ihrer laufenden Arbeit automatisch erweitert wird. Dabei wird kein KI-Modell trainiert, und nichts verlässt Ihre Kanzlei.",
              "Decides whether your firm's knowledge is extended automatically from your ongoing work. No AI model is trained, and nothing leaves your firm."
            )}
          </p>
        </div>
        {state && (
          <Switch
            id="brain-learning-switch"
            checked={state.enabled}
            disabled={!state.canEdit || saving}
            onCheckedChange={(v) => void toggle(v)}
            aria-label={L("Kanzlei-Gehirn lernt mit", "Firm knowledge learns along")}
          />
        )}
      </div>

      {!state && !loadFailed && (
        <div role="status" aria-label={L("Wird geladen", "Loading")}>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      )}

      {loadFailed && (
        <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
          {L(
            "Die Einstellung konnte nicht geladen werden. Bitte laden Sie die Seite neu.",
            "The setting could not be loaded. Please reload the page."
          )}
        </p>
      )}

      {state && (
        <>
          <dl className="grid grid-cols-1 gap-3 text-xs leading-relaxed sm:grid-cols-2">
            <div className="rounded-lg border border-[color:var(--ds-border)] p-3">
              <dt className="font-medium text-[color:var(--ds-text)]">
                {L("Eingeschaltet", "On")}
              </dt>
              <dd className="mt-1 text-[color:var(--ds-text-muted)]">
                {L(
                  "Aus Ihren Dokumenten und Notizen werden automatisch Tatsachen und Einschätzungen abgeleitet, der Assistent merkt sich Vorgaben aus Gesprächen, und für Ihre Prüfleitfäden werden Ergänzungen aus unterzeichneten Verträgen vorgeschlagen.",
                  "Facts and assessments are derived automatically from your documents and notes, the assistant remembers instructions from conversations, and additions to your contract playbooks are suggested from signed contracts."
                )}
              </dd>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] p-3">
              <dt className="font-medium text-[color:var(--ds-text)]">
                {L("Ausgeschaltet", "Off")}
              </dt>
              <dd className="mt-1 text-[color:var(--ds-text-muted)]">
                {L(
                  "Ihre Dokumente werden weiterhin gespeichert und sind voll durchsuchbar; der Assistent beantwortet Fragen wie gewohnt. Es wird nur nichts Neues mehr automatisch daraus abgeleitet. Bereits Gelerntes bleibt erhalten.",
                  "Your documents are still stored and fully searchable, and the assistant answers as usual. Nothing new is derived from them automatically. What was learned before is kept."
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/dashboard/settings/memory" className="brand-text hover:underline">
              {L(
                "Gedächtnis des Assistenten ansehen und löschen",
                "View and delete the assistant's memory"
              )}
            </Link>
            {!state.canEdit && (
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                {L(
                  "Nur Administratorinnen und Administratoren der Kanzlei können diese Einstellung ändern.",
                  "Only your firm's administrators can change this setting."
                )}
              </span>
            )}
            {saveFailed && (
              <span role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
                {L(
                  "Die Änderung wurde nicht übernommen. Bitte versuchen Sie es erneut.",
                  "The change was not saved. Please try again."
                )}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
