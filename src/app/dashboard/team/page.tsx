"use client";

import { useState } from "react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { Users, Mail, Trash2, LogOut, Crown, AlertCircle, CheckCircle } from "lucide-react";
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
import { Skeleton, RowSkeleton } from "@/components/dashboard/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";

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

const ERROR_KEYS: Record<string, string> = {
  already_in_org: "team.error_already_in_org",
  invalid_name: "team.error_invalid_name",
  owner_only: "team.error_owner_only",
  self_invite: "team.error_self_invite",
  no_seats_left: "__TEAM_SEAT_LIMIT__",
  already_member: "team.error_already_member",
  invalid_email: "team.error_invalid_email",
  owner_must_remove_members_first: "team.error_owner_remove_members",
  owner_cannot_remove_self: "team.error_owner_cannot_remove",
  rate_limited: "team.error_rate_limited",
  generic: "team.error_generic",
};

function errMsg(
  t: (key: import("@/content/dashboard").DashboardKey) => string,
  code?: string
): string {
  const key = ERROR_KEYS[code ?? ""] ?? ERROR_KEYS.generic;
  return key === "__TEAM_SEAT_LIMIT__"
    ? "__TEAM_SEAT_LIMIT__"
    : t(key as import("@/content/dashboard").DashboardKey);
}

export default function TeamPage() {
  const { t } = useLang();
  const orgQuery = useOrg();
  const createOrgMutation = useCreateOrg();
  const inviteMutation = useInviteMemberOrg();
  const removeMutation = useRemoveMemberOrg();
  const leaveMutation = useLeaveOrg();
  const confirm = useConfirm();

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
    const raw = err instanceof Error ? errMsg(t, err.message) : errMsg(t);
    setError(raw === "__TEAM_SEAT_LIMIT__" ? t("team.seat_limit_reached") : raw);
  }

  if (loading) {
    return (
      <div
        className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8"
        role="status"
        aria-label={t("team.loading")}
      >
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-32 rounded" />
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-80 max-w-full rounded" />
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <RowSkeleton count={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("nav.team")}
        description={t("team.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("nav.team") },
        ]}
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3.5"
        >
          <AlertCircle
            size={15}
            className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]"
            aria-hidden
          />
          <p className="text-sm text-[color:var(--ds-danger-text)]">{error}</p>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-3.5"
        >
          <CheckCircle
            size={15}
            className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
            aria-hidden
          />
          <p className="text-sm text-[color:var(--ds-success-text)]">{notice}</p>
        </div>
      )}
      {devJoinUrl && (
        <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3.5">
          <p className="mb-1.5 text-xs text-[color:var(--ds-warning-text)]">
            Der E-Mail-Versand ist noch nicht eingerichtet. Bitte senden Sie der eingeladenen Person
            diesen Einladungslink selbst zu:
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
                {t("team.create_title")}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              {t("team.create_desc")}
            </p>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setNotice(null);
                try {
                  await createOrgMutation.mutateAsync(orgName);
                  setNotice(t("team.create_notice"));
                  setOrgName("");
                } catch (err) {
                  handleErr(err);
                }
              }}
            >
              <label className="flex-1 space-y-1.5">
                <span className="block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  Name des Teams, etwa der Kanzleiname
                </span>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="z. B. Kanzlei Beispiel & Partner"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <Button type="submit" variant="glow" disabled={busy} className="whitespace-nowrap">
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
                  <span className="tabular-nums">{state.members?.length ?? 0}</span> Mitglied
                  {(state.members?.length ?? 0) !== 1 ? "er" : ""} · gemeinsames Kanzleiwissen
                </p>
              </div>
              {state.isOwner && <Badge>Inhaber</Badge>}
            </div>
            <ul className="divide-y divide-[color:var(--ds-border)]">
              {(state.members ?? []).length === 0 ? (
                <li className="px-6 py-12 text-center text-sm text-[color:var(--ds-text-muted)]">
                  {t("team.empty" as DashboardKey)}
                </li>
              ) : (
                (state.members ?? []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm text-[color:var(--ds-text)]">
                        {m.name}
                        {m.isOwner && (
                          <Crown
                            size={12}
                            className="shrink-0 text-[color:var(--ds-warning-text)]"
                            aria-label={t("aria.owner")}
                          />
                        )}
                      </p>
                      <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                        {m.email}
                      </p>
                    </div>
                    {state.isOwner && !m.isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`${m.name} entfernen`}
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Mitglied entfernen",
                            message: `${m.name} verliert den Zugriff auf das gemeinsame Kanzleiwissen des Teams und arbeitet danach wieder im persönlichen Kanzleiwissen.`,
                            confirmLabel: "Entfernen",
                            variant: "danger",
                          });
                          if (!ok) return;
                          setError(null);
                          setNotice(null);
                          try {
                            await removeMutation.mutateAsync(m.id);
                            setNotice(
                              `${m.name} wurde entfernt und arbeitet ab sofort wieder im persönlichen Kanzleiwissen.`
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
                ))
              )}
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
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Die eingeladene Person erhält per E-Mail einen Link, mit dem sie dem Team
                  beitritt. Der Link ist 7 Tage gültig.
                </p>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    setNotice(null);
                    setDevJoinUrl(null);
                    try {
                      const data = await inviteMutation.mutateAsync(inviteEmail);
                      setNotice(t("team.invite_sent"));
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
                      autoComplete="email"
                      inputMode="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="kollegin@kanzlei.at"
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
                  {state.isOwner ? t("team.leave_owner_desc") : t("team.leave_member_desc")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Team verlassen",
                    message: state.isOwner
                      ? "Wenn Sie als Inhaber das Team verlassen, wird das Team aufgelöst."
                      : "Sie verlieren den Zugriff auf das gemeinsame Kanzleiwissen des Teams.",
                    confirmLabel: "Verlassen",
                    variant: "danger",
                  });
                  if (!ok) return;
                  setError(null);
                  setNotice(null);
                  try {
                    await leaveMutation.mutateAsync();
                    setNotice("Sie haben das Team verlassen.");
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
