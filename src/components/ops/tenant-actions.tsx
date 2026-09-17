"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { csrfFetch } from "@/lib/csrf";

type Role = "admin" | "lawyer" | "assistant" | "client_viewer";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  lawyer: "Anwalt",
  assistant: "Assistenz",
  client_viewer: "Mandant (lesend)",
};

const SELECT_CLASS =
  "rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-60";

async function patchTenant(
  tenantId: string,
  body: Record<string, unknown>
): Promise<string | null> {
  const res = await csrfFetch(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (res?.ok) return null;
  const data = (await res?.json().catch(() => null)) as { message?: string; error?: string } | null;
  return data?.message ?? "Aktion fehlgeschlagen.";
}

export function TenantSuspensionPanel({
  tenantId,
  tenantName,
  suspended,
  suspendedAt,
  reason,
  activeMembers,
}: {
  tenantId: string;
  tenantName: string;
  suspended: boolean;
  suspendedAt: string | null;
  reason: string | null;
  activeMembers: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const failure = await patchTenant(tenantId, body);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setText("");
    router.refresh();
  }

  async function suspend() {
    if (text.trim().length < 10) {
      setError("Bitte einen aussagekräftigen Grund angeben (mind. 10 Zeichen).");
      return;
    }
    const ok = await confirm({
      title: `${tenantName} sperren?`,
      message: `${activeMembers} aktive Konten werden sofort abgemeldet und können sich nicht mehr anmelden. Die Daten bleiben erhalten.`,
      confirmLabel: "Kanzlei sperren",
      variant: "danger",
    });
    if (ok) await run({ action: "suspend", reason: text.trim() });
  }

  return (
    <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <h2 className="text-sm font-semibold">Zugang der Kanzlei</h2>
      {suspended ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]">
            Gesperrt seit {suspendedAt ? new Date(suspendedAt).toLocaleString("de-AT") : "—"}
            {reason ? `. Grund: ${reason}` : "."}
          </p>
          <Button
            size="sm"
            variant="outline"
            loading={busy}
            onClick={() => void run({ action: "reactivate" })}
          >
            <RotateCcw size={14} aria-hidden /> Kanzlei entsperren
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Sperren meldet alle Konten der Kanzlei ab und verhindert neue Anmeldungen. Daten, Akten
            und Fristen bleiben unverändert. Entsperren stellt genau die Konten wieder her, die
            durch die Sperre deaktiviert wurden.
          </p>
          <label htmlFor="tenant-suspend-reason" className="sr-only">
            Grund für die Sperre
          </label>
          <Textarea
            id="tenant-suspend-reason"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Grund für die Sperre (z. B. Zahlungsverzug, Kündigung, Missbrauch)…"
            rows={2}
          />
          <Button size="sm" variant="danger" loading={busy} onClick={() => void suspend()}>
            <Ban size={14} aria-hidden /> Kanzlei sperren
          </Button>
        </div>
      )}
      <p
        role="status"
        aria-live="polite"
        className="mt-2 text-xs text-[color:var(--ds-danger-text)]"
      >
        {error}
      </p>
    </section>
  );
}

export function MemberRoleControl({
  tenantId,
  userId,
  userName,
  role,
  isOwner,
  deactivated,
  teamFirm,
}: {
  tenantId: string;
  userId: string;
  userName: string;
  role: Role;
  isOwner: boolean;
  deactivated: boolean;
  teamFirm: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!teamFirm) return <span>{ROLE_LABEL[role] ?? role}</span>;

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const failure = await patchTenant(tenantId, body);
    setBusy(false);
    if (failure) setError(failure);
    else router.refresh();
  }

  async function makeOwner() {
    const ok = await confirm({
      title: "Inhaber wechseln?",
      message: `${userName} wird Inhaber und Admin der Kanzlei. Der bisherige Inhaber bleibt Admin.`,
      confirmLabel: "Zum Inhaber machen",
    });
    if (ok) await run({ action: "transfer_owner", userId });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`role-${userId}`} className="sr-only">
        Rolle von {userName}
      </label>
      <select
        id={`role-${userId}`}
        value={role}
        disabled={busy || isOwner}
        title={isOwner ? "Der Inhaber bleibt Admin" : undefined}
        onChange={(e) => void run({ action: "set_role", userId, role: e.target.value })}
        className={SELECT_CLASS}
      >
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {!isOwner && !deactivated && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void makeOwner()}>
          Zum Inhaber machen
        </Button>
      )}
      {error && (
        <span role="alert" className="basis-full text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </span>
      )}
    </div>
  );
}
