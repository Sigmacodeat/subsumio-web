"use client";

import { useState } from "react";
import { useLang } from "@/lib/use-lang";
import {
  Users,
  Mail,
  Trash2,
  LogOut,
  Crown,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
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
  no_seats_left:
    "Keine freien Plätze mehr. Upgrade auf einen größeren Plan oder entferne ein Mitglied.",
  already_member: "Diese Person ist bereits Mitglied.",
  invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein.",
  owner_must_remove_members_first:
    "Als Inhaber zuerst alle Mitglieder entfernen — dann löst sich das Team auf.",
  owner_cannot_remove_self: "Der Inhaber kann sich nicht selbst entfernen.",
  rate_limited: "Zu viele Versuche — bitte kurz warten.",
  generic: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
};

function errMsg(code?: string): string {
  return ERRORS[code ?? ""] ?? ERRORS.generic;
}

export default function TeamPage() {
  const { t } = useLang();
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
  const busy =
    createOrgMutation.isPending ||
    inviteMutation.isPending ||
    removeMutation.isPending ||
    leaveMutation.isPending;

  function handleErr(err: unknown) {
    setError(err instanceof Error ? errMsg(err.message) : ERRORS.generic);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[color:var(--ds-text-muted)]">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Lade Team…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Team"
        description="Ein gemeinsames Brain für euer ganzes Team — Mitglieder sehen und füttern dasselbe Wissen."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Team" }]}
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-600" aria-hidden />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5"
        >
          <CheckCircle size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
          <p className="text-sm [color:var(--mk-text-subtle)]">{notice}</p>
        </div>
      )}
      {devJoinUrl && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
          <p className="mb-1.5 text-xs text-amber-700">
            Mail-Provider nicht konfiguriert — gib der Person diesen Einladungs-Link direkt:
          </p>
          <code className="brand-text text-xs break-all">{devJoinUrl}</code>
        </div>
      )}

      {!state?.org ? (
        <Card>
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2.5">
              <Users size={18} className="brand-text" aria-hidden />
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                Team erstellen
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              Erstelle ein Team-Brain und lade Kolleginnen und Kollegen ein. Die Plätze richten sich
              nach deinem Plan (Free/Pro: 1 · Team: 5 · Enterprise: 25). Dein persönliches Brain
              bleibt unangetastet — das Team bekommt ein eigenes.
            </p>
            <form
              className="flex flex-col gap-3 sm:flex-row"
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
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--ds-border)] p-6">
              <div>
                <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                  {state.org.name}
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {state.members?.length ?? 0} Mitglied
                  {(state.members?.length ?? 0) !== 1 ? "er" : ""} · gemeinsames Brain
                </p>
              </div>
              {state.isOwner && <Badge>Inhaber</Badge>}
            </div>
            <ul className="divide-y divide-[color:var(--ds-border)]">
              {(state.members ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm text-[color:var(--ds-text)]">
                      {m.name}
                      {m.isOwner && (
                        <Crown
                          size={12}
                          className="shrink-0 text-amber-600"
                          aria-label={t("aria.owner")}
                        />
                      )}
                    </p>
                    <p className="truncate text-xs text-[color:var(--ds-text-muted)]">{m.email}</p>
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
                          setNotice(
                            "Mitglied entfernt — es arbeitet ab sofort wieder im eigenen Brain."
                          );
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
              <div className="space-y-3 p-6">
                <div className="flex items-center gap-2.5">
                  <Mail size={16} className="brand-text" aria-hidden />
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    Mitglied einladen
                  </h3>
                </div>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
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
            <div className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Team verlassen
                </h3>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
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
