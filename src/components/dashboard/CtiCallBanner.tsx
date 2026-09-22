"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, PhoneMissed, X } from "lucide-react";
import { useRealtime } from "@/lib/realtime";
import { encodeSlugPath } from "@/lib/utils";

interface CtiPayload {
  callId: string;
  event: "ringing" | "answered" | "ended" | "missed";
  caller: string;
  contactName?: string;
  contactSlug?: string;
  caseSlug?: string;
  caseTitle?: string;
  noteSlug?: string;
  at: string;
}

/**
 * CTI-Anruf-Banner (WP-4.20): zeigt eingehende Rufe mit Anruferkennung
 * an — Kontaktname, verlinkte Akte, Notiz-Verknüpfung. Klingelt überall
 * im Dashboard (SSE), schließt bei "ended"/"missed" nach kurzer Anzeige.
 */
export function CtiCallBanner() {
  const [call, setCall] = useState<CtiPayload | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissLater = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCall(null), ms);
  }, []);

  useRealtime(
    "cti.incoming_call",
    useCallback(
      (payload) => {
        const p = payload as CtiPayload;
        if (p.event === "ringing" || p.event === "answered" || p.event === "missed") {
          setCall(p);
          if (timer.current) clearTimeout(timer.current);
          if (p.event === "missed") dismissLater(30_000);
        } else if (p.event === "ended") {
          setCall((cur) => (cur?.callId === p.callId ? { ...cur, ...p } : cur));
          dismissLater(8_000);
        }
      },
      [dismissLater]
    )
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  if (!call) return null;

  const missed = call.event === "missed";

  return (
    <div
      role="alert"
      className="fixed top-[env(safe-area-inset-top)] left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 shadow-2xl"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          missed
            ? "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
            : "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
        }`}
      >
        {missed ? <PhoneMissed size={16} aria-hidden /> : <Phone size={16} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
          {missed ? "Verpasster Anruf" : "Eingehender Anruf"}: {call.contactName ?? call.caller}
        </p>
        <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
          {call.contactName ? call.caller : "Unbekannte Nummer"}
          {call.caseTitle ? ` · ${call.caseTitle}` : ""}
        </p>
      </div>
      {call.caseSlug && (
        <Link
          href={`/dashboard/cases/${encodeSlugPath(call.caseSlug)}`}
          onClick={() => setCall(null)}
          className="brand-text shrink-0 text-xs font-medium whitespace-nowrap hover:underline"
        >
          Akte öffnen
        </Link>
      )}
      <button
        type="button"
        aria-label="Anruf-Banner schließen"
        onClick={() => setCall(null)}
        className="shrink-0 text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
      >
        <X size={15} />
      </button>
    </div>
  );
}
