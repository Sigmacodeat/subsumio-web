"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/csrf";

type Method = "id_austria" | "a_trust_card";

let statusPromise: Promise<boolean> | null = null;
function qesAvailable(): Promise<boolean> {
  statusPromise ??= fetch("/api/signature/qes/status", { cache: "no-store" })
    .then((r) => r.json())
    .then((b: { data?: { available?: boolean } }) => Boolean(b.data?.available))
    .catch(() => false);
  return statusPromise;
}

const METHODS: Array<{ id: Method; title: string; text: string }> = [
  {
    id: "id_austria",
    title: "ID Austria",
    text: "Signatur am Smartphone mit der App „Digitales Amt“ oder einem FIDO-Token.",
  },
  {
    id: "a_trust_card",
    title: "A-Trust-Signaturkarte",
    text: "Signatur mit Kartenleser und Bürgerkartensoftware an diesem Computer.",
  },
];

/**
 * PDFs only. Older list entries carry neither a media type nor an extension;
 * those get the button and the server checks the stored file.
 */
export function mayBePdf(name: string, mimeType?: string): boolean {
  if (mimeType) return /pdf/i.test(mimeType);
  if (/\.pdf$/i.test(name)) return true;
  return !/\.[a-z0-9]{2,5}$/i.test(name);
}

/**
 * Qualified electronic signature (eIDAS Art. 3 Z 12) of a matter's PDF via
 * PDF-AS-WEB. Shown only for PDFs and only when the installation has it set up.
 */
export function QesSignButton({
  documentSlug,
  documentName,
  mimeType,
  disabled,
}: {
  documentSlug: string;
  documentName: string;
  mimeType?: string;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Method | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void qesAvailable().then((v) => !cancelled && setAvailable(v));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available || !mayBePdf(documentName, mimeType)) return null;

  async function begin(method: Method) {
    setBusy(method);
    setError(null);
    try {
      const res = await csrfFetch("/api/signature/qes/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_slug: documentSlug, method }),
      });
      const body = (await res.json().catch(() => null)) as {
        data?: { redirectUrl?: string };
        error?: string;
      } | null;
      if (!res.ok || !body?.data?.redirectUrl) {
        setError(body?.error ?? "Die Signatur konnte nicht gestartet werden.");
        setBusy(null);
        return;
      }
      window.location.assign(body.data.redirectUrl);
    } catch {
      setError("Die Signatur konnte nicht gestartet werden.");
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="hover:brand-text flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] disabled:opacity-50 motion-reduce:transition-none"
        title="Qualifiziert signieren"
      >
        <BadgeCheck size={14} aria-hidden />
        <span className="hidden sm:inline">Qualifiziert signieren</span>
      </button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Qualifiziert signieren</DialogTitle>
            <DialogDescription>
              Die qualifizierte elektronische Signatur ist der eigenhändigen Unterschrift
              gleichgestellt. Das signierte PDF wird als neues Dokument in der Akte abgelegt, das
              Original bleibt unverändert.
            </DialogDescription>
          </DialogHeader>
          <p className="truncate text-sm font-medium" title={documentName}>
            {documentName}
          </p>
          <div className="grid gap-2">
            {METHODS.map((m) => (
              <Button
                key={m.id}
                type="button"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void begin(m.id)}
                className="h-auto flex-col items-start gap-0.5 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 font-medium">
                  {busy === m.id && <Loader2 size={14} className="animate-spin" aria-hidden />}
                  {m.title}
                </span>
                <span className="text-xs font-normal text-[color:var(--ds-text-muted)]">
                  {m.text}
                </span>
              </Button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
