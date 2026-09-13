"use client";

// Shown at the top of the Kanzlei dashboard whenever the account currently
// browsing it is a Subsumio platform operator inside an active support
// session (see src/lib/support-session.ts). Deliberately not dismissible —
// only "Sitzung beenden" or the 60-minute expiry removes it, so nobody can
// browse a firm's data with the banner silently closed.
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";

export interface SupportSessionInfo {
  orgName: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
}

export function SupportSessionBanner({ session }: { session: SupportSessionInfo }) {
  const qc = useQueryClient();
  const [ending, setEnding] = useState(false);

  const expiresLabel = new Date(session.expiresAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  async function endSession() {
    setEnding(true);
    try {
      await csrfFetch("/api/admin/support-session/end", { method: "POST" });
    } finally {
      // A full reload — not just a query invalidation — is deliberate: every
      // server component on the page was rendered against the firm's brain
      // via the now-ended session and needs a fresh request to fall back to
      // the operator's own (empty) context.
      qc.clear();
      window.location.href = "/dashboard";
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2 text-xs text-[color:var(--ds-warning-text)]"
    >
      <ShieldAlert size={14} className="shrink-0" aria-hidden />
      <span className="font-semibold">Support-Zugriff aktiv</span>
      <span>
        Kanzlei: <strong>{session.orgName}</strong>
      </span>
      <span className="hidden sm:inline">
        Grund: {session.reason}
      </span>
      <span>Endet spätestens um {expiresLabel} Uhr</span>
      <button
        type="button"
        onClick={() => void endSession()}
        disabled={ending}
        className="ml-auto shrink-0 rounded-md border border-[color:var(--ds-warning-border)] px-2.5 py-1 font-medium text-[color:var(--ds-warning-text)] transition-colors hover:bg-[color:var(--ds-warning-solid)] hover:text-white focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50"
      >
        {ending ? "Wird beendet…" : "Sitzung beenden"}
      </button>
    </div>
  );
}
