"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Building2, Copy, ExternalLink, FileText, Loader2, Mail, UserX } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { unwrapApiBody } from "@/lib/api-body";
import { csrfFetch } from "@/lib/csrf";
import { formatDate } from "@/lib/utils";

interface RoomView {
  id: string;
  title: string;
  host_firm: string;
  role: "host" | "guest";
  documents: Array<{ slug: string; title: string; added_at: string }>;
  expires_at?: string;
  case_slug?: string;
  can_manage?: boolean;
  members?: Array<{
    id: string;
    email: string;
    status: "invited" | "active" | "revoked";
    expires_at?: string;
    firm?: string;
    invited_at: string;
    accepted_at?: string;
  }>;
  matter_documents?: Array<{ slug: string; title: string }>;
}

const STATUS_LABEL = { invited: "Eingeladen", active: "Aktiv", revoked: "Entzogen" } as const;

/** Error text of an API body: `{ error: "<Text>", code }` (older bodies nest a message). */
function errorText(body: unknown, fallback: string): string {
  const e = (body as { error?: unknown } | null)?.error;
  if (typeof e === "string" && e) return e;
  const nested = (e as { message?: unknown } | undefined)?.message;
  return typeof nested === "string" && nested ? nested : fallback;
}

export default function DataRoomPage() {
  const { id } = useParams<{ id: string }>();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [until, setUntil] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [openText, setOpenText] = useState<{ title: string; content: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/data-rooms/${encodeURIComponent(id)}`);
      const raw = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(raw, "Datenraum nicht gefunden"));
      const body = unwrapApiBody<RoomView>(raw);
      setRoom(body);
      setSelected(new Set(body.documents.map((d) => d.slug)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(
    method: string,
    path: string,
    body: unknown
  ): Promise<Record<string, unknown> | null> {
    setBusy(true);
    try {
      const res = await csrfFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(json, "Aktion fehlgeschlagen"));
      return unwrapApiBody<Record<string, unknown>>(json);
    } catch (err) {
      addToast({ type: "error", title: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDocuments() {
    const ok = await call("PUT", `/api/data-rooms/${id}`, { doc_slugs: [...selected] });
    if (ok) {
      addToast({ type: "success", title: "Freigegebene Dokumente gespeichert" });
      await load();
    }
  }

  async function invite() {
    const result = await call("POST", `/api/data-rooms/${id}/members`, {
      email,
      ...(until ? { expires_at: new Date(`${until}T23:59:59`).toISOString() } : {}),
    });
    if (!result) return;
    setEmail("");
    setUntil("");
    if (typeof result.link === "string") {
      setLink(result.link);
      addToast({ type: "success", title: "Einladung angelegt – Link bitte selbst weitergeben" });
    } else {
      addToast({ type: "success", title: "Einladung per E-Mail verschickt" });
    }
    await load();
  }

  async function revoke(memberId: string, memberEmail: string) {
    const confirmed = await confirm({
      title: "Zugang entziehen?",
      message: `${memberEmail} verliert sofort den Zugriff auf diesen Datenraum.`,
      confirmLabel: "Entziehen",
      variant: "danger",
    });
    if (!confirmed) return;
    const ok = await call("DELETE", `/api/data-rooms/${id}/members`, { member_id: memberId });
    if (ok) {
      addToast({ type: "success", title: "Zugang entzogen" });
      await load();
    }
  }

  async function showText(slug: string) {
    const res = await fetch(
      `/api/data-rooms/${id}/document?slug=${encodeURIComponent(slug)}&format=text`
    );
    if (res.ok) setOpenText(await res.json());
    else addToast({ type: "error", title: "Dokument konnte nicht geladen werden" });
  }

  if (error) {
    return <p className="p-6 text-sm text-[color:var(--ds-danger-text)]">{error}</p>;
  }
  if (!room) {
    return (
      <div className="ds-page ds-page-medium space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isHost = room.role === "host";
  const manage = isHost && room.can_manage;
  const fileHref = (slug: string) =>
    `/api/data-rooms/${id}/document?slug=${encodeURIComponent(slug)}&inline=1`;

  return (
    <div className="ds-page ds-page-medium space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={room.title}
        description={
          isHost
            ? "Datenraum Ihrer Kanzlei. Andere Kanzleien sehen nur die hier freigegebenen Dokumente."
            : `Von ${room.host_firm} mit Ihnen geteilt${room.expires_at ? ` – Zugang bis ${formatDate(room.expires_at)}` : ""}. Jeder Abruf wird bei der Kanzlei protokolliert.`
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Datenräume", href: "/dashboard/shared-spaces" },
          { label: room.title },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Freigegebene Dokumente</CardTitle>
          {manage && (
            <CardDescription>
              Wählen Sie aus den Dokumenten der Akte, was die eingeladenen Kanzleien sehen.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {manage ? (
            <>
              {(room.matter_documents ?? []).length === 0 ? (
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Die Akte hat noch keine Dokumente.
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--ds-border)]">
                  {room.matter_documents!.map((d) => (
                    <li key={d.slug} className="flex items-center gap-3 py-2">
                      <Checkbox
                        id={`doc-${d.slug}`}
                        checked={selected.has(d.slug)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v) next.add(d.slug);
                          else next.delete(d.slug);
                          setSelected(next);
                        }}
                      />
                      <Label htmlFor={`doc-${d.slug}`} className="flex-1 cursor-pointer text-sm">
                        {d.title}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <Button onClick={() => void saveDocuments()} disabled={busy}>
                  {busy && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />}
                  Freigabe speichern
                </Button>
              </div>
            </>
          ) : room.documents.length === 0 ? (
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              Noch keine Dokumente freigegeben.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--ds-border)]">
              {room.documents.map((d) => (
                <li key={d.slug} className="flex flex-wrap items-center gap-3 py-2.5">
                  <FileText
                    size={14}
                    aria-hidden="true"
                    className="text-[color:var(--ds-text-muted)]"
                  />
                  <span className="flex-1 text-sm text-[color:var(--ds-text)]">{d.title}</span>
                  <Button variant="ghost" size="sm" onClick={() => void showText(d.slug)}>
                    Text anzeigen
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={fileHref(d.slug)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} className="mr-1.5" aria-hidden="true" />
                      Original
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {openText && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{openText.title}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setOpenText(null)}>
              Schließen
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[60vh] overflow-auto text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
              {openText.content || "Kein Text vorhanden."}
            </pre>
          </CardContent>
        </Card>
      )}

      {isHost && (
        <Card>
          <CardHeader>
            <CardTitle>Andere Kanzleien</CardTitle>
            <CardDescription>
              Die Einladung gilt nur für die angegebene E-Mail-Adresse und nur für ein Konto einer
              anderen Kanzlei. Sie können sie befristen und jederzeit entziehen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(room.members ?? []).length === 0 ? (
              <p className="text-sm text-[color:var(--ds-text-muted)]">Noch niemand eingeladen.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--ds-border)]">
                {room.members!.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <Building2
                      size={14}
                      aria-hidden="true"
                      className="text-[color:var(--ds-text-muted)]"
                    />
                    <span className="text-[color:var(--ds-text)]">{m.firm ?? m.email}</span>
                    {m.firm && (
                      <span className="text-xs text-[color:var(--ds-text-muted)]">{m.email}</span>
                    )}
                    <Badge variant="default" className="text-xs">
                      {STATUS_LABEL[m.status]}
                    </Badge>
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      {m.expires_at ? `bis ${formatDate(m.expires_at)}` : "unbefristet"}
                    </span>
                    {manage && m.status !== "revoked" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        disabled={busy}
                        onClick={() => void revoke(m.id, m.email)}
                      >
                        <UserX size={12} className="mr-1.5" aria-hidden="true" />
                        Entziehen
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {manage && (
              <form
                className="grid gap-3 rounded-lg border border-dashed border-[color:var(--ds-border)] p-4 md:grid-cols-[1fr_auto_auto] md:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void invite();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">E-Mail der Person</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="kollegin@andere-kanzlei.at"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-until">Zugang bis (optional)</Label>
                  <Input
                    id="invite-until"
                    type="date"
                    value={until}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={busy || !email}>
                  <Mail size={14} className="mr-2" aria-hidden="true" />
                  Einladen
                </Button>
              </form>
            )}

            {link && (
              <div className="flex items-center gap-2 rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-xs">
                <span className="flex-1 truncate">{link}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(link)}
                  aria-label="Link kopieren"
                >
                  <Copy size={12} aria-hidden="true" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
