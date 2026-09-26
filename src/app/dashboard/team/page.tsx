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
import { EmptyState } from "@/components/dashboard/empty-state";
import { teamErrorText } from "./team-errors";
import {
  DEFAULT_INVITE_ROLE,
  INVITE_ROLES,
  isInviteRole,
  type InviteRole,
} from "@/lib/invite-roles";

interface Member {
  id: string;
  name: string;
  email: string;
  role?: string;
  isOwner: boolean;
}

const ROLE_LABEL_KEYS: Record<string, DashboardKey> = {
  admin: "settings.role_admin",
  lawyer: "settings.role_lawyer",
  assistant: "settings.role_assistant",
  client_viewer: "settings.role_client_viewer",
};

interface OrgState {
  org: { id: string; name: string; ownerId: string } | null;
  members?: Member[];
  isOwner?: boolean;
  /** Owner or administrator: may invite and remove members. */
  canManageTeam?: boolean;
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
  // Least privileged staff role by default; never admin (the owner promotes later).
  const [inviteRole, setInviteRole] = useState<InviteRole>(DEFAULT_INVITE_ROLE);

  const loading = orgQuery.isLoading;
  const state = (orgQuery.data ?? { org: null }) as OrgState;
  const busy =
    createOrgMutation.isPending ||
    inviteMutation.isPending ||
    removeMutation.isPending ||
    leaveMutation.isPending;

  function handleErr(err: unknown) {
    setError(teamErrorText(t, err));
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

  // A failed load must not look like "no team yet" — that would offer to create
  // a new organisation instead of saying the team could not be loaded.
  if (orgQuery.isError) {
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
        <div role="alert">
          <EmptyState
            icon={AlertCircle}
            title={t("team.load_error" as DashboardKey)}
            actionLabel={t("common.retry")}
            onAction={() => void orgQuery.refetch()}
          />
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
                        {m.role && ROLE_LABEL_KEYS[m.role] && <> · {t(ROLE_LABEL_KEYS[m.role])}</>}
                      </p>
                    </div>
                    {(state.canManageTeam ?? state.isOwner) && !m.isOwner && (
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

          {(state.canManageTeam ?? state.isOwner) && (
            <Card>
              <div className="space-y-3 p-6">
                <div className="flex items-center gap-2.5">
                  <Mail size={16} className="brand-text" aria-hidden />
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    Mitglied einladen
                  </h3>
                </div>
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Die eingeladene Person erhält per E-Mail einen Link, mit dem sie dem Team mit der
                  gewählten Rolle beitritt. Der Link ist 7 Tage gültig.
                </p>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    setNotice(null);
                    setDevJoinUrl(null);
                    try {
                      const data = await inviteMutation.mutateAsync({
                        email: inviteEmail,
                        role: inviteRole,
                      });
                      setNotice(t("team.invite_sent"));
                      if (data?.devJoinUrl) setDevJoinUrl(data.devJoinUrl);
                      setInviteEmail("");
                      setInviteRole(DEFAULT_INVITE_ROLE);
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
                  <label className="sm:w-56">
                    <span className="sr-only">Rolle im Team</span>
                    <select
                      aria-label="Rolle im Team"
                      value={inviteRole}
                      onChange={(e) => {
                        if (isInviteRole(e.target.value)) setInviteRole(e.target.value);
                      }}
                      className="h-full w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                    >
                      {INVITE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(ROLE_LABEL_KEYS[r])}
                        </option>
                      ))}
                    </select>
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
