"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { csrfFetch } from "@/lib/csrf";

type MappedRole = "lawyer" | "assistant" | "client_viewer";

interface GroupRow {
  id: string;
  displayName: string;
  memberCount: number;
  role: MappedRole | null;
}

const ROLE_LABEL: Record<MappedRole, string> = {
  lawyer: "Anwältin / Anwalt",
  assistant: "Sekretariat",
  client_viewer: "Mandant (nur lesen)",
};

/**
 * Directory group → role (SCIM settings). Admin is deliberately not
 * offered: firm admins are appointed in Subsumio only.
 */
export function ScimGroupRoles() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [draft, setDraft] = useState<Record<string, MappedRole | "">>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scim/group-roles");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      const rows: GroupRow[] = body?.data?.groups ?? [];
      setGroups(rows);
      setDraft(Object.fromEntries(rows.map((g) => [g.displayName, g.role ?? ""])));
    } catch {
      setError("Die Gruppen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const mapping = Object.fromEntries(
        Object.entries(draft).map(([name, role]) => [name, role === "" ? null : role])
      );
      const res = await csrfFetch("/api/scim/group-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Speichern fehlgeschlagen.");
        return;
      }
      const n = Number(body?.data?.rolesChanged ?? 0);
      setMessage(
        n > 0
          ? `Gespeichert. ${n} ${n === 1 ? "Rolle wurde" : "Rollen wurden"} angepasst.`
          : "Gespeichert."
      );
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-6 py-4">
        <FolderTree size={16} className="text-[color:var(--ds-text-muted)]" aria-hidden />
        <h2 className="text-base font-semibold text-[color:var(--ds-text)]">Gruppen und Rollen</h2>
      </div>
      <div className="space-y-4 px-6 py-4">
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Ordnen Sie Gruppen aus Ihrem Verzeichnis einer Rolle zu. Wer in einer zugeordneten Gruppe
          ist, erhält die höchste zugeordnete Rolle; wer alle zugeordneten Gruppen verlässt, fällt
          auf Sekretariat zurück (nie höher als bisher). Administratoren und die Inhaberin bzw. der
          Inhaber werden nie über Gruppen geändert, und keine Gruppe macht jemanden zum Admin.
        </p>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : groups.length === 0 ? (
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Noch keine Gruppen aus dem Verzeichnis übertragen.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ds-border)]">
            {groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium text-[color:var(--ds-text)]">{g.displayName}</p>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {g.memberCount} {g.memberCount === 1 ? "Mitglied" : "Mitglieder"}
                  </p>
                </div>
                <select
                  aria-label={`Rolle für ${g.displayName}`}
                  value={draft[g.displayName] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [g.displayName]: e.target.value as MappedRole | "" }))
                  }
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-sm text-[color:var(--ds-text)]"
                >
                  <option value="">Keine Rolle zuordnen</option>
                  {(Object.keys(ROLE_LABEL) as MappedRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        {groups.length > 0 && (
          <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>
            Zuordnung speichern
          </Button>
        )}
        {message && (
          <p role="status" className="text-xs text-[color:var(--ds-success-text)]">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
