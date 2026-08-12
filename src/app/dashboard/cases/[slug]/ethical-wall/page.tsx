"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ShieldAlert, Users, Plus, X, Loader2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";

export default function EthicalWallPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const params = useParams();
  const caseSlug = params.slug as string;

  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [newUser, setNewUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditEvents, setAuditEvents] = useState<
    Array<{ action: string; timestamp: string; details: unknown }>
  >([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/ethical-wall?case_slug=${encodeURIComponent(caseSlug)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBlockedUsers(data.blocked_users ?? []);
      setAuditEvents(data.audit_events ?? []);
    } catch {
      addToast({ type: "error", title: t("ethical_wall.err_load") });
    } finally {
      setLoading(false);
    }
  }, [caseSlug, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/cases/ethical-wall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_slug: caseSlug, blocked_users: blockedUsers }),
      });
      if (!res.ok) throw new Error();
      addToast({ type: "success", title: t("ethical_wall.saved") });
      await load();
    } catch {
      addToast({ type: "error", title: t("ethical_wall.err_save") });
    } finally {
      setSaving(false);
    }
  }

  function addUser() {
    if (!newUser.trim()) return;
    if (blockedUsers.includes(newUser.trim())) return;
    setBlockedUsers([...blockedUsers, newUser.trim()]);
    setNewUser("");
  }

  function removeUser(user: string) {
    setBlockedUsers(blockedUsers.filter((u) => u !== user));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-live="polite">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <ShieldAlert size={20} className="text-[color:var(--ds-warning-text)]" />
          <h1 className="text-lg font-semibold text-[color:var(--ds-text)]">
            {t("ethical_wall.title")}
          </h1>
        </div>
        <Button onClick={() => void save()} disabled={saving} className="brand-bg text-white">
          {saving ? <Loader2 size={14} className="animate-spin" /> : t("ethical_wall.save")}
        </Button>
      </div>

      <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
        <p className="text-sm text-[color:var(--ds-warning-text)]">{t("ethical_wall.warning")}</p>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium text-[color:var(--ds-text)]">
          {t("ethical_wall.blocked_users")}
        </Label>
        <div className="flex gap-2">
          <Input
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addUser();
            }}
            placeholder={t("ethical_wall.user_placeholder")}
            className="flex-1"
          />
          <Button onClick={addUser} variant="secondary" className="gap-2">
            <Plus size={14} />
            {t("ethical_wall.add")}
          </Button>
        </div>
        <div className="space-y-2">
          {blockedUsers.length === 0 ? (
            <p className="text-sm text-[color:var(--ds-text-muted)]">{t("ethical_wall.empty")}</p>
          ) : (
            blockedUsers.map((user) => (
              <div
                key={user}
                className="flex items-center justify-between rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-[color:var(--ds-warning-text)]" />
                  <span className="text-sm text-[color:var(--ds-text)]">{user}</span>
                </div>
                <Button
                  onClick={() => removeUser(user)}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[color:var(--ds-warning-text)] hover:bg-[color:var(--ds-warning-bg)]"
                >
                  <X size={14} />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {auditEvents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-[color:var(--ds-text-muted)]" />
            <Label className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("ethical_wall.changes")}
            </Label>
          </div>
          <div className="space-y-2">
            {auditEvents.map((evt, i) => (
              <div
                key={i}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
              >
                <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                  <span>{new Date(evt.timestamp).toLocaleString()}</span>
                  <Badge
                    variant="default"
                    className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {evt.action}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
