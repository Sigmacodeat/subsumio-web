"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, UserX, CheckCircle2, AlertTriangle } from "lucide-react";
import { PlanBadge } from "@/components/admin/admin-stat-card";
import type { PublicUser } from "@/lib/auth/store";

interface UserDetailFormProps {
  user: PublicUser;
}

export function UserDetailForm({ user }: UserDetailFormProps) {
  const router = useRouter();
  const [plan, setPlan] = useState(user.plan);
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrf() },
        body: JSON.stringify({ plan, role }),
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
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrf() },
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

  function getCsrf(): string {
    const match = document.cookie.match(/csrf-token=([^;]+)/);
    return match?.[1] ?? "";
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 ${
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-rose-500/30 bg-rose-500/10"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : (
            <AlertTriangle size={16} className="text-rose-600" />
          )}
          <p
            className={`text-sm ${notice.type === "success" ? "text-emerald-700" : "text-rose-700"}`}
          >
            {notice.msg}
          </p>
        </div>
      )}

      <div className="rounded-xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
        <h2 className="mb-4 text-sm font-semibold [color:var(--mk-text)]">Benutzer bearbeiten</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium [color:var(--mk-text-muted)]">
              Name
            </label>
            <input
              type="text"
              value={user.name}
              disabled
              className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium [color:var(--mk-text-muted)]">
              E-Mail
            </label>
            <input
              type="text"
              value={user.email}
              disabled
              className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium [color:var(--mk-text-muted)]">
              Plan
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as typeof plan)}
              className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium [color:var(--mk-text-muted)]">
              Rolle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="lawyer">Lawyer</option>
              <option value="assistant">Assistant</option>
              <option value="client_viewer">Client Viewer</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="brand-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} /> Speichern
          </button>
          {!user.deactivatedAt && (
            <button
              onClick={deactivate}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-4 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
            >
              <UserX size={14} /> Deaktivieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
