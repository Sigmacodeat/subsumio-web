"use client";

import { useState } from "react";
import { Users, Mail, Trash2, LogOut, Crown, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  useOrg,
  useCreateOrg,
  useInviteMemberOrg,
  useRemoveMemberOrg,
  useLeaveOrg,
} from "@/lib/queries/settings";
import { PageHeader } from "@/components/dashboard/page-header";

interface Member {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
}

interface OrgState {
  org: { id: string; name: string; ownerId: string } | null;
  members?: Member[];
  isOwner?: boolean;
}

const ERRORS: Record<string, string> = {
  already_in_org: "Du bist bereits in einem Team.",
  invalid_name: "Bitte gib einen Team-Namen mit 2–80 Zeichen ein.",
  owner_only: "Nur der Team-Inhaber kann das.",
  self_invite: "Du bist schon drin — dich selbst einzuladen geht nicht.",
  no_seats_left: "Keine freien Plätze mehr. Upgrade auf einen größeren Plan oder entferne ein Mitglied.",
  already_member: "Diese Person ist bereits Mitglied.",
  invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein.",
  owner_must_remove_members_first: "Als Inhaber zuerst alle Mitglieder entfernen — dann löst sich das Team auf.",
  owner_cannot_remove_self: "Der Inhaber kann sich nicht selbst entfernen.",
  rate_limited: "Zu viele Versuche — bitte kurz warten.",
  generic: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
};

function errMsg(code?: string): string {
  return ERRORS[code ?? ""] ?? ERRORS.generic;
}

export default function TeamPage() {
  const orgQuery = useOrg();
  const createOrgMutation = useCreateOrg();
  const inviteMutation = useInviteMemberOrg();
  const removeMutation = useRemoveMemberOrg();
  const leaveMutation = useLeaveOrg();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devJoinUrl, setDevJoinUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const loading = orgQuery.isLoading;
  const state = (orgQuery.data ?? { org: null }) as OrgState;
  const busy = createOrgMutation.isPending || inviteMutation.isPending || removeMutation.isPending || leaveMutation.isPending;

  function handleErr(err: unknown) {
    setError(err instanceof Error ? errMsg(err.message) : ERRORS.generic);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-[color:var(--ds-text-muted)] text-sm">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Lade Team…
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Team"
        description="Ein gemeinsames Brain für euer ganzes Team — Mitglieder sehen und füttern dasselbe Wissen."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Team" }]}
      />

      {error && (
        <div role="alert" className="flex items-start gap-2.5 p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5">
          <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2.5 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-[#454552]">{notice}</p>
        </div>
      )}
      {devJoinUrl && (
        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <p className="text-xs text-amber-700 mb-1.5">
            Mail-Provider nicht konfiguriert — gib der Person diesen Einladungs-Link direkt:
          </p>
          <code className="text-xs brand-text break-all">{devJoinUrl}</code>
        </div>
      )}

      {!state?.org ? (
        <Card>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <Users size={18} className="brand-text" aria-hidden />
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">Team erstellen</h2>
            </div>
            <p className="text-sm text-[color:var(--ds-text-muted)] leading-relaxed">
              Erstelle ein Team-Brain und lade Kolleginnen und Kollegen ein. Die Plätze richten
              sich nach deinem Plan (Free/Pro: 1 · Team: 5 · Enterprise: 25). Dein persönliches
              Brain bleibt unangetastet — das Team bekommt ein eigenes.
            </p>
            <form
              className="flex flex-col sm:flex-row gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setNotice(null);
                try {
                  await createOrgMutation.mutateAsync(orgName);
                  setNotice("Team erstellt — lade jetzt Mitglieder ein.");
                  setOrgName("");
                } catch (err) {
                  handleErr(err);
                }
              }}
            >
              <label className="flex-1">
                <span className="sr-only">Team-Name</span>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="z. B. Kanzlei Beispiel & Partner"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <Button type="submit" variant="glow" disabled={busy}>
                Erstellen
              </Button>
            </form>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="p-6 border-b border-[color:var(--ds-border)] flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-semibold text-[color:var(--ds-text)]">{state.org.name}</h2>
                <p className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">
                  {state.members?.length ?? 0} Mitglied{(state.members?.length ?? 0) !== 1 ? "er" : ""} · gemeinsames Brain
                </p>
              </div>
              {state.isOwner && <Badge>Inhaber</Badge>}
            </div>
            <ul className="divide-y divide-[color:var(--ds-border)]">
              {(state.members ?? []).map((m) => (
                <li key={m.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-[color:var(--ds-text)] truncate flex items-center gap-1.5">
                      {m.name}
                      {m.isOwner && <Crown size={12} className="text-amber-600 shrink-0" aria-label="Inhaber" />}
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-muted)] truncate">{m.email}</p>
                  </div>
                  {state.isOwner && !m.isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`${m.name} entfernen`}
                      onClick={async () => {
                        setError(null);
                        setNotice(null);
                        try {
                          await removeMutation.mutateAsync(m.id);
                          setNotice("Mitglied entfernt — es arbeitet ab sofort wieder im eigenen Brain.");
                        } catch (err) {
                          handleErr(err);
                        }
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {state.isOwner && (
            <Card>
              <div className="p-6 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Mail size={16} className="brand-text" aria-hidden />
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Mitglied einladen</h3>
                </div>
                <form
                  className="flex flex-col sm:flex-row gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    setNotice(null);
                    setDevJoinUrl(null);
                    try {
                      const data = await inviteMutation.mutateAsync(inviteEmail);
                      setNotice("Einladung verschickt — Link ist 7 Tage gültig.");
                      if (data?.devJoinUrl) setDevJoinUrl(data.devJoinUrl);
                      setInviteEmail("");
                    } catch (err) {
                      handleErr(err);
                    }
                  }}
                >
                  <label className="flex-1">
                    <span className="sr-only">E-Mail-Adresse</span>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="kollegin@kanzlei.de"
                      required
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Einladen
                  </Button>
                </form>
              </div>
            </Card>
          )}

          <Card>
            <div className="p-6 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Team verlassen</h3>
                <p className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">
                  {state.isOwner
                    ? "Als Inhaber: erst alle Mitglieder entfernen, dann löst Verlassen das Team auf."
                    : "Du arbeitest danach wieder in deinem persönlichen Brain."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setError(null);
                  setNotice(null);
                  try {
                    await leaveMutation.mutateAsync();
                    setNotice("Du hast das Team verlassen.");
                  } catch (err) {
                    handleErr(err);
                  }
                }}
              >
                <LogOut size={14} aria-hidden /> Verlassen
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
