"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_LENGTH = 5000;

/**
 * The only matter text the client portal shows. The case body holds internal
 * notes and strategy and never reaches the portal; the firm releases a
 * client-facing summary here instead. Lawyers and admins only.
 */
export function PortalSummaryEditor({
  value,
  canEdit,
  disabled,
  lang,
  onSave,
}: {
  value: string | undefined;
  canEdit: boolean;
  disabled?: boolean;
  lang: string;
  onSave: (next: string) => Promise<void>;
}) {
  const en = lang === "en";
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  if (!canEdit) return null;

  const dirty = draft.trim() !== (value ?? "").trim();

  return (
    <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <label
        htmlFor="portal-summary"
        className="block text-sm font-semibold text-[color:var(--ds-text)]"
      >
        {en
          ? "Summary released for the client portal"
          : "Für das Mandantenportal freigegebene Zusammenfassung"}
      </label>
      <p id="portal-summary-hint" className="text-xs text-[color:var(--ds-text-muted)]">
        {en
          ? "The client sees exactly this text in the portal. Internal case notes are never shown. Leave empty to show no summary."
          : "Der Mandant sieht genau diesen Text im Portal. Interne Aktennotizen werden nie angezeigt. Leer lassen, um keinen Sachverhalt anzuzeigen."}
      </p>
      <textarea
        id="portal-summary"
        aria-describedby="portal-summary-hint"
        value={draft}
        maxLength={MAX_LENGTH}
        disabled={disabled || saving}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        rows={4}
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
      />
      <div className="flex items-center justify-end gap-2">
        {saved && !dirty && (
          <span role="status" className="text-xs text-[color:var(--ds-success-text)]">
            {en ? "Saved" : "Gespeichert"}
          </span>
        )}
        <Button
          variant="secondary"
          className="gap-1.5 text-xs"
          disabled={!dirty || saving || disabled}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft.trim());
              setSaved(true);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {en ? "Release for portal" : "Für Portal freigeben"}
        </Button>
      </div>
    </div>
  );
}
