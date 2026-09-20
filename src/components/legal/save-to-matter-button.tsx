"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderInput, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CaseSelect } from "@/components/legal/case-select";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { encodeSlugPath } from "@/lib/utils";
import type { GroundedCitation } from "@/lib/types";
import type { SaveToMatterSource } from "@/lib/save-to-matter";

/**
 * "In Akte speichern" — files an AI result in a matter as an unreviewed
 * document, with its grounding verdict. Opens a small dialog to confirm the
 * matter and title.
 */
export function SaveToMatterButton({
  content,
  source,
  defaultTitle,
  defaultCase = "",
  citations,
  variant = "secondary",
  size = "sm",
  className,
}: {
  content: string;
  source: SaveToMatterSource;
  defaultTitle: string;
  defaultCase?: string;
  citations?: GroundedCitation[];
  variant?: "secondary" | "ghost";
  size?: "sm" | "icon";
  className?: string;
}) {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [caseSlug, setCaseSlug] = useState(defaultCase);
  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  function openDialog() {
    setCaseSlug(defaultCase);
    setTitle(defaultTitle.slice(0, 200));
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!caseSlug || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/legal/save-to-matter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: caseSlug,
          title: title.trim(),
          content,
          source,
          citations: citations?.map((c) => ({
            code: c.code,
            paragraph: c.paragraph,
            verified: c.verified,
            support: c.support,
            source_url: c.source_url,
          })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { slug?: string; listed?: boolean };
      };
      if (!res.ok || !body.data?.slug) {
        setError(body.error ?? "Speichern fehlgeschlagen. Bitte erneut versuchen.");
        return;
      }
      setOpen(false);
      setSavedTo(caseSlug);
      addToast({
        type: "success",
        title: "In der Akte gespeichert",
        description: body.data.listed
          ? "Als ungeprüftes KI-Ergebnis unter „Dokumente“ abgelegt."
          : "Gespeichert, aber noch nicht in der Dokumentliste der Akte. Bitte später neu laden.",
      });
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={openDialog}
        disabled={!content.trim()}
        aria-label="In Akte speichern"
        title="In Akte speichern"
        className={className}
      >
        <FolderInput size={14} aria-hidden="true" />
        {size !== "icon" && <span>In Akte speichern</span>}
      </Button>
      {savedTo && size !== "icon" && (
        <Link
          href={`/dashboard/cases/${encodeSlugPath(savedTo)}`}
          className="text-xs text-[color:var(--ds-text-muted)] underline-offset-2 hover:underline"
        >
          Gespeichert · zur Akte
        </Link>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>In Akte speichern</DialogTitle>
            <DialogDescription>
              Das Ergebnis wird als ungeprüftes KI-Dokument in der Akte abgelegt, mit den
              Prüfergebnissen der Zitate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="save-matter-case"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                Akte
              </label>
              <CaseSelect
                id="save-matter-case"
                value={caseSlug}
                onChange={setCaseSlug}
                allowEmpty={!defaultCase}
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="save-matter-title"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                Titel
              </label>
              <Input
                id="save-matter-title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
                {error}
              </p>
            )}
            {caseSlug && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                <Link
                  href={`/dashboard/cases/${encodeSlugPath(caseSlug)}`}
                  className="underline-offset-2 hover:underline"
                >
                  Akte öffnen
                </Link>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button onClick={() => void save()} disabled={saving || !caseSlug || !title.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
