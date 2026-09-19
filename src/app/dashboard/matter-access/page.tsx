"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, History, Loader2, Lock, ShieldAlert, UserPlus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { unwrapApiBody } from "@/lib/api-body";
import { csrfFetch } from "@/lib/csrf";
import { activeGrant, type MatterGrant, type MatterPermissions } from "@/lib/matter-access";
import { useLang } from "@/lib/use-lang";
import { cn, formatDate } from "@/lib/utils";

type Visibility = NonNullable<MatterPermissions["visibility"]>;

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AccessState {
  case_slug: string;
  title: string;
  permissions: MatterPermissions;
  my_level: "none" | "read" | "write";
  can_manage: boolean;
  can_grant: boolean;
  me: string;
  members: Member[];
  audit: Array<{ at: string; by: string; details: Record<string, unknown> }>;
}

const ROLE_LABEL: Record<string, { de: string; en: string }> = {
  admin: { de: "Administration", en: "Admin" },
  lawyer: { de: "Anwältin/Anwalt", en: "Lawyer" },
  assistant: { de: "Assistenz", en: "Assistant" },
  client_viewer: { de: "Mandantenzugang", en: "Client viewer" },
};

const VISIBILITY: Array<{
  value: Visibility;
  icon: React.ElementType;
  de: [string, string];
  en: [string, string];
}> = [
  {
    value: "full",
    icon: Eye,
    de: ["Ganze Kanzlei", "Alle in der Kanzlei sehen die Akte, je nach Rolle."],
    en: ["Whole firm", "Everyone in the firm sees the matter, by role."],
  },
  {
    value: "restricted",
    icon: Users,
    de: ["Eingeschränkt", "Nur das Aktenteam, Freigaben und Administratoren."],
    en: ["Restricted", "Only the matter team, grants and admins."],
  },
  {
    value: "confidential",
    icon: Lock,
    de: ["Vertraulich", "Nur das Aktenteam und Freigaben — auch Administratoren nicht."],
    en: ["Confidential", "Only the matter team and grants — not even admins."],
  },
];

function MatterAccessContent() {
  const params = useSearchParams();
  const caseSlug = params.get("case") ?? "";
  const { lang } = useLang();
  const en = lang === "en";
  const L = (de: string, enText: string) => (en ? enText : de);
  const { addToast } = useToast();

  const [state, setState] = useState<AccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("full");
  const [team, setTeam] = useState<string[]>([]);
  const [walls, setWalls] = useState<string[]>([]);
  const [grantUser, setGrantUser] = useState("");
  const [grantLevel, setGrantLevel] = useState<"read" | "write">("read");
  const [grantUntil, setGrantUntil] = useState("");

  const load = useCallback(async () => {
    if (!caseSlug) return;
    setError(null);
    try {
      const res = await fetch(`/api/cases/access?case_slug=${encodeURIComponent(caseSlug)}`);
      const body = unwrapApiBody<AccessState & { message?: string; error?: string }>(
        await res.json()
      );
      if (!res.ok) throw new Error(body.message ?? body.error ?? "load_failed");
      setState(body);
      setVisibility(body.permissions.visibility ?? "full");
      setTeam(body.permissions.allowed_users ?? []);
      setWalls(body.permissions.blocked_users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [caseSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberById = useMemo(
    () => new Map((state?.members ?? []).map((m) => [m.id, m])),
    [state?.members]
  );
  const name = (id: string) => memberById.get(id)?.name ?? id;

  async function put(patch: Record<string, unknown>, success: string): Promise<boolean> {
    setSaving(true);
    try {
      const res = await csrfFetch("/api/cases/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_slug: caseSlug, ...patch }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          body?.error?.message ?? body?.message ?? L("Speichern fehlgeschlagen", "Save failed")
        );
      }
      addToast({ type: "success", title: success });
      await load();
      return true;
    } catch (err) {
      addToast({ type: "error", title: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const structureDirty =
    !!state &&
    (visibility !== (state.permissions.visibility ?? "full") ||
      team.join() !== (state.permissions.allowed_users ?? []).join() ||
      walls.join() !== (state.permissions.blocked_users ?? []).join());

  const grants = (state?.permissions.grants ?? []).filter((g) => activeGrant(g));

  async function addGrant() {
    if (!grantUser) return;
    const next: MatterGrant = {
      user_id: grantUser,
      level: grantLevel,
      ...(grantUntil ? { expires_at: new Date(`${grantUntil}T23:59:59`).toISOString() } : {}),
    };
    const ok = await put(
      { grants: [...grants, next] },
      L(`${name(grantUser)} hat jetzt Zugriff`, `${name(grantUser)} now has access`)
    );
    if (ok) {
      setGrantUser("");
      setGrantUntil("");
    }
  }

  async function revokeGrant(grant: MatterGrant) {
    await put(
      { grants: grants.filter((g) => g !== grant) },
      L("Freigabe zurückgenommen", "Access revoked")
    );
  }

  if (!caseSlug) {
    return (
      <p className="p-6 text-sm text-[color:var(--ds-text-muted)]">
        {L("Keine Akte angegeben.", "No matter given.")}
      </p>
    );
  }

  const caseHref = `/dashboard/cases/${caseSlug.split("/").map(encodeURIComponent).join("/")}`;
  const manage = state?.can_manage ?? false;
  const candidates = (exclude: string[]) =>
    (state?.members ?? []).filter((m) => !exclude.includes(m.id));

  return (
    <div className="mx-auto max-w-[960px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={L("Zugriff & Freigaben", "Access & sharing")}
        description={
          state
            ? L(
                `Wer die Akte „${state.title}“ sieht und bearbeitet. Die Regeln gelten überall: Akte, Suche, Copilot und Exporte.`,
                `Who sees and edits “${state.title}”. The rules apply everywhere: matter, search, Copilot and exports.`
              )
            : undefined
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: state?.title ?? L("Akte", "Matter"), href: caseHref },
          { label: L("Zugriff", "Access") },
        ]}
      />

      {error && (
        <Card>
          <CardContent className="p-6 text-sm text-[color:var(--ds-danger-text)]">
            {error}
          </CardContent>
        </Card>
      )}

      {!state && !error && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {state && (
        <>
          {/* Visibility */}
          <Card>
            <CardHeader>
              <CardTitle>{L("Wer sieht diese Akte", "Who sees this matter")}</CardTitle>
              {!manage && (
                <CardDescription>
                  {L(
                    "Sichtbarkeit, Aktenteam und Chinese Walls ändern Administratoren.",
                    "Admins change visibility, the matter team and ethical walls."
                  )}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div
                role="radiogroup"
                aria-label={L("Sichtbarkeit", "Visibility")}
                className="grid gap-3 md:grid-cols-3"
              >
                {VISIBILITY.map((v) => {
                  const Icon = v.icon;
                  const selected = visibility === v.value;
                  const [title, text] = en ? v.en : v.de;
                  return (
                    <button
                      key={v.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!manage || saving}
                      onClick={() => setVisibility(v.value)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-[border-color,background-color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:cursor-default motion-reduce:transition-none",
                        selected
                          ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                          : "border-[color:var(--ds-border)] hover:enabled:bg-[color:var(--ds-hover)]"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                        <Icon size={15} aria-hidden="true" />
                        {title}
                      </span>
                      <span className="mt-1 block text-xs text-[color:var(--ds-text-muted)]">
                        {text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Matter team */}
          <Card>
            <CardHeader>
              <CardTitle>{L("Aktenteam", "Matter team")}</CardTitle>
              <CardDescription>
                {L(
                  "Das Team sieht die Akte auch dann, wenn sie eingeschränkt oder vertraulich ist.",
                  "The team sees the matter even when it is restricted or confidential."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PersonChips
                ids={team}
                name={name}
                empty={L("Noch niemand im Aktenteam.", "Nobody on the matter team yet.")}
                removeLabel={L("aus dem Team nehmen", "remove from team")}
                onRemove={manage ? (id) => setTeam(team.filter((t) => t !== id)) : undefined}
              />
              {manage && (
                <MemberPicker
                  members={candidates([...team, ...walls])}
                  placeholder={L("Person hinzufügen", "Add person")}
                  lang={lang}
                  onPick={(id) => setTeam([...team, id])}
                />
              )}
            </CardContent>
          </Card>

          {/* Ethical wall */}
          <Card className="border-[color:var(--ds-danger-border)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert
                  size={16}
                  aria-hidden="true"
                  className="text-[color:var(--ds-danger-text)]"
                />
                {L("Chinese Wall", "Ethical wall")}
              </CardTitle>
              <CardDescription>
                {L(
                  "Wer hier steht, sieht die Akte nirgends — keine Suche, kein Copilot, keine Dokumente. Das gilt auch für Administratoren.",
                  "Anyone listed here sees the matter nowhere — no search, no Copilot, no documents. This applies to admins too."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PersonChips
                ids={walls}
                name={name}
                tone="danger"
                empty={L("Keine Wall für diese Akte.", "No wall on this matter.")}
                removeLabel={L("von der Wall nehmen", "remove from wall")}
                onRemove={manage ? (id) => setWalls(walls.filter((w) => w !== id)) : undefined}
              />
              {manage && (
                <MemberPicker
                  members={candidates([...walls, state.me])}
                  placeholder={L("Person aussperren", "Wall off person")}
                  lang={lang}
                  onPick={(id) => {
                    setWalls([...walls, id]);
                    setTeam(team.filter((t) => t !== id));
                  }}
                />
              )}
            </CardContent>
          </Card>

          {manage && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={!structureDirty || saving}
                onClick={() => {
                  setVisibility(state.permissions.visibility ?? "full");
                  setTeam(state.permissions.allowed_users ?? []);
                  setWalls(state.permissions.blocked_users ?? []);
                }}
              >
                {L("Verwerfen", "Discard")}
              </Button>
              <Button
                disabled={!structureDirty || saving}
                onClick={() =>
                  void put(
                    { visibility, allowed_users: team, blocked_users: walls },
                    L("Zugriffsregeln gespeichert", "Access rules saved")
                  )
                }
              >
                {saving && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />}
                {L("Speichern", "Save")}
              </Button>
            </div>
          )}

          {/* Grants */}
          <Card>
            <CardHeader>
              <CardTitle>{L("Freigaben für Kolleg:innen", "Access for colleagues")}</CardTitle>
              <CardDescription>
                {L(
                  "Einzelnen Personen Lese- oder Schreibzugriff geben, auf Wunsch befristet. Wer die Akte bearbeiten darf, kann freigeben und die eigenen Freigaben zurücknehmen.",
                  "Give individual people read or write access, optionally until a date. Anyone who may edit the matter can share it and take back their own grants."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {grants.length === 0 ? (
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {L("Keine Freigaben.", "No grants.")}
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--ds-border)]">
                  {grants.map((g) => {
                    const mayRevoke = manage || (state.can_grant && g.granted_by === state.me);
                    return (
                      <li
                        key={`${g.user_id}-${g.granted_at}`}
                        className="flex flex-wrap items-center gap-3 py-2.5"
                      >
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">
                          {name(g.user_id)}
                        </span>
                        <Badge variant="default" className="text-xs">
                          {g.level === "write"
                            ? L("Lesen & Schreiben", "Read & write")
                            : L("Lesen", "Read")}
                        </Badge>
                        <span className="text-xs text-[color:var(--ds-text-muted)]">
                          {g.expires_at
                            ? L(
                                `bis ${formatDate(g.expires_at)}`,
                                `until ${formatDate(g.expires_at)}`
                              )
                            : L("unbefristet", "no end date")}
                          {g.granted_by ? ` · ${L("von", "by")} ${name(g.granted_by)}` : ""}
                        </span>
                        {mayRevoke && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto"
                            disabled={saving}
                            onClick={() => void revokeGrant(g)}
                          >
                            {L("Zurücknehmen", "Revoke")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {state.can_grant && (
                <div className="grid gap-3 rounded-lg border border-dashed border-[color:var(--ds-border)] p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label>{L("Person", "Person")}</Label>
                    <Select value={grantUser} onValueChange={setGrantUser}>
                      <SelectTrigger aria-label={L("Person", "Person")}>
                        <SelectValue placeholder={L("Kolleg:in wählen", "Choose colleague")} />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates([state.me, ...walls]).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} ·{" "}
                            {(ROLE_LABEL[m.role] ?? { de: m.role, en: m.role })[en ? "en" : "de"]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{L("Recht", "Access")}</Label>
                    <Select
                      value={grantLevel}
                      onValueChange={(v) => setGrantLevel(v as "read" | "write")}
                    >
                      <SelectTrigger aria-label={L("Recht", "Access")} className="md:w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="read">{L("Lesen", "Read")}</SelectItem>
                        <SelectItem value="write">
                          {L("Lesen & Schreiben", "Read & write")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="grant-until">{L("Bis (optional)", "Until (optional)")}</Label>
                    <Input
                      id="grant-until"
                      type="date"
                      value={grantUntil}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setGrantUntil(e.target.value)}
                    />
                  </div>
                  <Button disabled={!grantUser || saving} onClick={() => void addGrant()}>
                    <UserPlus size={14} className="mr-2" aria-hidden="true" />
                    {L("Freigeben", "Share")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History size={16} aria-hidden="true" />
                {L("Verlauf", "History")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {state.audit.length === 0 ? (
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {L("Noch keine Änderungen protokolliert.", "No changes logged yet.")}
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {state.audit.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="text-[color:var(--ds-text-muted)]">
                      <span className="text-[color:var(--ds-text)]">{formatDate(e.at)}</span> ·{" "}
                      {e.by} · {describeChange(e.details, name, en)}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            <Link href={caseHref} className="hover:underline">
              {L("Zurück zur Akte", "Back to the matter")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function describeChange(
  details: Record<string, unknown>,
  name: (id: string) => string,
  en: boolean
): string {
  const vis = details.visibility as { from?: string; to?: string } | undefined;
  const parts: string[] = [];
  if (vis && vis.from !== vis.to)
    parts.push(`${en ? "visibility" : "Sichtbarkeit"} ${vis.from} → ${vis.to}`);
  const walls = (details.walls as string[] | undefined) ?? [];
  const team = (details.team as string[] | undefined) ?? [];
  const grants = (details.grants as Array<{ user_id: string; level: string }> | undefined) ?? [];
  parts.push(`${en ? "team" : "Team"}: ${team.map(name).join(", ") || "—"}`);
  parts.push(`${en ? "wall" : "Wall"}: ${walls.map(name).join(", ") || "—"}`);
  parts.push(
    `${en ? "grants" : "Freigaben"}: ${grants.map((g) => `${name(g.user_id)} (${g.level})`).join(", ") || "—"}`
  );
  return parts.join(" · ");
}

function PersonChips({
  ids,
  name,
  empty,
  removeLabel,
  onRemove,
  tone,
}: {
  ids: string[];
  name: (id: string) => string;
  empty: string;
  removeLabel: string;
  onRemove?: (id: string) => void;
  tone?: "danger";
}) {
  if (ids.length === 0) return <p className="text-sm text-[color:var(--ds-text-muted)]">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <li
          key={id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
            tone === "danger"
              ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
          )}
        >
          {name(id)}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={`${name(id)} ${removeLabel}`}
              className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function MemberPicker({
  members,
  placeholder,
  lang,
  onPick,
}: {
  members: Member[];
  placeholder: string;
  lang: string;
  onPick: (id: string) => void;
}) {
  if (members.length === 0) return null;
  return (
    <Select value="" onValueChange={(id) => id && onPick(id)}>
      <SelectTrigger aria-label={placeholder} className="md:w-72">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name} ·{" "}
            {(ROLE_LABEL[m.role] ?? { de: m.role, en: m.role })[lang === "en" ? "en" : "de"]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function MatterAccessPage() {
  return (
    <Suspense fallback={null}>
      <MatterAccessContent />
    </Suspense>
  );
}
