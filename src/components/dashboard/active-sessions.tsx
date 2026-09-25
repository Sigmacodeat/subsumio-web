"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone, Tablet, LogOut, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { currentPushEndpoint } from "@/lib/push-client";

interface SessionRow {
  sid: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

function deviceFromUa(ua: string | null): { icon: typeof Monitor; label: string } {
  if (!ua) return { icon: Monitor, label: "Unbekanntes Gerät" };
  const s = ua.toLowerCase();
  const icon = /mobile|iphone|android.*mobile/.test(s)
    ? Smartphone
    : /ipad|tablet|android(?!.*mobile)/.test(s)
      ? Tablet
      : Monitor;
  const browser = /edg\//.test(s)
    ? "Edge"
    : /chrome\//.test(s)
      ? "Chrome"
      : /firefox\//.test(s)
        ? "Firefox"
        : /safari\//.test(s) && !/chrome/.test(s)
          ? "Safari"
          : "Browser";
  const os = /windows/.test(s)
    ? "Windows"
    : /mac os|macos|macintosh/.test(s)
      ? "macOS"
      : /iphone|ipad/.test(s)
        ? "iOS"
        : /android/.test(s)
          ? "Android"
          : /linux/.test(s)
            ? "Linux"
            : "";
  return { icon, label: os ? `${browser} · ${os}` : browser };
}

function relativeTime(iso: string, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return lang === "en" ? "Just now" : "Gerade eben";
  if (min < 60) return lang === "en" ? `${min} min ago` : `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return lang === "en" ? `${h} h ago` : `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return lang === "en" ? `${d} d ago` : `vor ${d} Tagen`;
}

/**
 * "Aktive Sitzungen" — the signed-in user's device list backed by the
 * session registry. Current session is badged; every other row can be
 * revoked individually, or all at once via "Alle anderen abmelden".
 */
export function ActiveSessions() {
  const { lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOthers, setConfirmOthers] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: async (): Promise<SessionRow[]> => {
      const res = await fetch("/api/auth/sessions");
      if (!res.ok) throw new Error("sessions_load_failed");
      const data = await res.json();
      return (data.sessions ?? data.data?.sessions ?? []) as SessionRow[];
    },
    staleTime: 30_000,
  });

  const revokeMutation = useMutation({
    mutationFn: async (body: { sid?: string; allOthers?: boolean }) => {
      // "Sign out others" also ends the other devices' push registrations;
      // this browser keeps its own.
      const keepPushEndpoint = body.allOthers ? await currentPushEndpoint() : undefined;
      const res = await csrfFetch("/api/auth/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keepPushEndpoint ? { ...body, keepPushEndpoint } : body),
      });
      if (!res.ok) throw new Error("revoke_failed");
      return res.json();
    },
    onSuccess: (_data, body) => {
      setConfirmOthers(false);
      void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
      addToast({
        type: "success",
        title: body.allOthers
          ? L("Alle anderen Sitzungen abgemeldet", "All other sessions signed out")
          : L("Sitzung abgemeldet", "Session signed out"),
      });
    },
    onError: () => {
      addToast({
        type: "error",
        title: L("Abmeldung fehlgeschlagen", "Sign-out failed"),
        description: L(
          "Die Sitzung konnte nicht abgemeldet werden. Bitte versuchen Sie es erneut.",
          "The session could not be revoked. Please try again."
        ),
      });
    },
  });

  const sessions = sessionsQuery.data ?? [];
  const otherSessions = sessions.filter((s) => !s.current);

  return (
    <section
      aria-labelledby="active-sessions-heading"
      className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-[color:var(--ds-text-muted)]" />
          <h2
            id="active-sessions-heading"
            className="text-sm font-semibold text-[color:var(--ds-text)]"
          >
            {L("Aktive Sitzungen", "Active sessions")}
          </h2>
        </div>
        {otherSessions.length > 0 &&
          (confirmOthers ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => setConfirmOthers(false)}
                disabled={revokeMutation.isPending}
              >
                {L("Abbrechen", "Cancel")}
              </Button>
              <Button
                variant="ghost"
                className="gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
                onClick={() => revokeMutation.mutate({ allOthers: true })}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <LogOut size={13} />
                )}
                {L("Bestätigen", "Confirm")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
              onClick={() => setConfirmOthers(true)}
            >
              <LogOut size={13} />
              {L("Alle anderen abmelden", "Sign out all others")}
            </Button>
          ))}
      </div>

      {sessionsQuery.isLoading ? (
        <div role="status" aria-label={L("Wird geladen", "Loading")} className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : sessionsQuery.isError ? (
        <p className="text-xs text-[color:var(--ds-danger-text)]">
          {L("Die Sitzungen konnten nicht geladen werden.", "The sessions could not be loaded.")}
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          {L("Keine weiteren aktiven Sitzungen gefunden.", "No active sessions found.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const device = deviceFromUa(s.userAgent);
            const Icon = device.icon;
            return (
              <li
                key={s.sid}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-2.5"
              >
                <Icon size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-[color:var(--ds-text)]">{device.label}</p>
                    {s.current && (
                      <Badge variant="default" className="text-xs">
                        {L("Diese Sitzung", "This session")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {s.current
                      ? L("Aktiv", "Active now")
                      : `${L("Zuletzt aktiv", "Last active")} ${relativeTime(s.lastSeenAt, lang)}`}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
                    onClick={() => revokeMutation.mutate({ sid: s.sid })}
                    disabled={revokeMutation.isPending}
                    aria-label={L("Sitzung abmelden", "Sign out session")}
                  >
                    <LogOut size={13} />
                    {L("Abmelden", "Sign out")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
