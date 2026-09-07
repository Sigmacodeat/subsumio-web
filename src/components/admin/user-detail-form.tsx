"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, UserX, CheckCircle2, AlertTriangle } from "lucide-react";
import { csrfFetch } from "@/lib/csrf";
import type { PublicUser } from "@/lib/auth/store";

interface UserDetailFormProps {
  user: PublicUser;
}

export function UserDetailForm({ user }: UserDetailFormProps) {
  const router = useRouter();
  const [plan, setPlan] = useState(user.plan);
  const [role, setRole] = useState(user.role);
  const [industry, setIndustry] = useState(user.industry ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await csrfFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, role, industry: industry || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ type: "success", msg: "Änderungen gespeichert." });
        router.refresh();
      } else {
        setNotice({ type: "error", msg: data?.error ?? "Fehler beim Speichern" });
      }
    } catch {
      setNotice({ type: "error", msg: "Netzwerkfehler" });
    }
    setSaving(false);
  }

  async function deactivate() {
    if (!confirm("Benutzer wirklich deaktivieren? Er kann sich nicht mehr einloggen.")) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await csrfFetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ type: "success", msg: "Benutzer deaktiviert." });
        router.refresh();
      } else {
        setNotice({ type: "error", msg: data?.error ?? "Fehler beim Deaktivieren" });
      }
    } catch {
      setNotice({ type: "error", msg: "Netzwerkfehler" });
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 ${
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : (
            <AlertTriangle size={16} className="text-[color:var(--ds-danger-text)]" />
          )}
          <p
            className={`text-sm ${notice.type === "success" ? "text-emerald-700" : "text-[color:var(--ds-danger-text)]"}`}
          >
            {notice.msg}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">
          Benutzer bearbeiten
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Name
            </label>
            <input
              type="text"
              value={user.name}
              disabled
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text-muted)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              E-Mail
            </label>
            <input
              type="text"
              value={user.email}
              disabled
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text-muted)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Plan
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as typeof plan)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Rolle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            >
              <option value="admin">Admin</option>
              <option value="lawyer">Lawyer</option>
              <option value="assistant">Assistant</option>
              <option value="client_viewer">Client Viewer</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Branche
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            >
              <option value="">— Keine —</option>
              <option value="legal">Legal</option>
              <option value="tax">Tax</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="brand-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-[background-color,border-color,color] hover:opacity-90 active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none"
          >
            <Save size={14} /> Speichern
          </button>
          {!user.deactivatedAt && (
            <button
              onClick={deactivate}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] px-4 py-2 text-sm font-medium text-[color:var(--ds-danger-text)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-danger-bg)] active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none"
            >
              <UserX size={14} /> Deaktivieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
