"use client";

/**
 * Connect the Office add-ins (Word, Outlook) with a short-lived add-in token
 * instead of a permanent API key: valid for 24 hours, only read/write access,
 * shown once, revocable here at any time.
 */
import { useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AddinTokenPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"issue" | "revoke" | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function issue() {
    setBusy("issue");
    setMessage(null);
    try {
      const res = await csrfFetch("/api/addin-token", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        expires_at?: string;
        error?: string;
      };
      if (!res.ok || !data.token) throw new Error(data.error || `HTTP ${res.status}`);
      setToken(data.token);
      setExpiresAt(data.expires_at ?? null);
      setCopied(false);
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Zugang konnte nicht erstellt werden.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    setMessage(null);
    try {
      const res = await csrfFetch("/api/addin-token", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToken(null);
      setExpiresAt(null);
      setMessage({ ok: true, text: "Alle Add-in-Zugänge wurden widerrufen." });
    } catch {
      setMessage({ ok: false, text: "Widerruf fehlgeschlagen — bitte erneut versuchen." });
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      /* the token stays selectable */
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          className="gap-2 whitespace-nowrap"
          onClick={() => void issue()}
          disabled={busy !== null}
        >
          {busy === "issue" ? (
            <Loader2 size={13} aria-hidden className="animate-spin" />
          ) : (
            <KeyRound size={13} aria-hidden />
          )}
          Add-in-Zugang erstellen (24 h)
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 whitespace-nowrap"
          onClick={() => void revoke()}
          disabled={busy !== null}
        >
          <ShieldOff size={13} aria-hidden /> Alle Add-in-Zugänge widerrufen
        </Button>
      </div>
      {token && (
        <div className="space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 truncate rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 font-mono text-xs text-[color:var(--ds-text)]">
              {token}
            </code>
            <Button
              variant="ghost"
              size="sm"
              aria-label={copied ? "Kopiert" : "Zugang kopieren"}
              onClick={() => void copy()}
            >
              {copied ? (
                <CheckCircle2
                  size={12}
                  aria-hidden
                  className="text-[color:var(--ds-success-text)]"
                />
              ) : (
                <Copy size={12} aria-hidden />
              )}
            </Button>
          </div>
          <p className="text-xs">
            Nur jetzt sichtbar. Gültig bis {expiresAt ? formatExpiry(expiresAt) : "in 24 Stunden"} —
            danach im Add-in neu verbinden. Ein neuer Zugang ersetzt den bisherigen.
          </p>
        </div>
      )}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            message.ok
              ? "text-xs text-[color:var(--ds-success-text)]"
              : "text-xs text-[color:var(--ds-danger-text)]"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
