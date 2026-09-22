"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, FileText, FolderLock, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { unwrapApiBody } from "@/lib/api-body";
import { formatDate } from "@/lib/utils";

interface HostedRoom {
  id: string;
  title: string;
  case_slug: string;
  documents: number;
  members: number;
  created_at: string;
}

interface GuestRoom {
  id: string;
  title: string;
  host_firm: string;
  documents: number;
  expires_at?: string;
}

/**
 * Data rooms (lib/data-rooms.ts): matters this firm shares with other firms,
 * and matters other firms shared with it. A room is opened from the matter's
 * "Zugriff & Freigaben" page.
 */
export default function DataRoomsPage() {
  const [hosted, setHosted] = useState<HostedRoom[] | null>(null);
  const [guest, setGuest] = useState<GuestRoom[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/data-rooms")
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = unwrapApiBody<{ hosted: HostedRoom[]; shared_with_us: GuestRoom[] }>(
          await res.json()
        );
        setHosted(body.hosted ?? []);
        setGuest(body.shared_with_us ?? []);
      })
      .catch(() => {
        setError(true);
        setHosted([]);
      });
  }, []);

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Datenräume"
        description="Unterlagen einer Akte gezielt mit anderen Kanzleien teilen – Korrespondenzanwalt, Mitverteidigung, Gegenseite. Nur freigegebene Dokumente, befristbar, jeder Abruf protokolliert."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Datenräume" }]}
      />

      {error && (
        <p className="text-sm text-[color:var(--ds-danger-text)]">
          Die Datenräume konnten nicht geladen werden.
        </p>
      )}

      <section aria-labelledby="shared-with-us" className="space-y-3">
        <h2 id="shared-with-us" className="text-sm font-semibold text-[color:var(--ds-text)]">
          Mit uns geteilt
        </h2>
        {hosted === null ? (
          <Skeleton className="h-20 w-full" />
        ) : guest.length === 0 ? (
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Keine andere Kanzlei hat Ihnen derzeit Unterlagen freigegeben.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {guest.map((r) => (
              <RoomCard
                key={r.id}
                href={`/dashboard/shared-spaces/${r.id}`}
                title={r.title}
                subtitle={r.host_firm}
                icon={Building2}
                facts={[
                  `${r.documents} Dokument${r.documents === 1 ? "" : "e"}`,
                  r.expires_at ? `bis ${formatDate(r.expires_at)}` : "unbefristet",
                ]}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="hosted" className="space-y-3">
        <h2 id="hosted" className="text-sm font-semibold text-[color:var(--ds-text)]">
          Von uns geteilt
        </h2>
        {hosted === null ? (
          <Skeleton className="h-20 w-full" />
        ) : hosted.length === 0 ? (
          <EmptyState
            icon={FolderLock}
            title="Noch kein Datenraum"
            description="Öffnen Sie eine Akte, dann „Zugriff & Freigaben“ (Schild-Symbol im Aktenkopf) und legen Sie dort den Datenraum an."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {hosted.map((r) => (
              <RoomCard
                key={r.id}
                href={`/dashboard/shared-spaces/${r.id}`}
                title={r.title}
                subtitle={`angelegt ${formatDate(r.created_at)}`}
                icon={FolderLock}
                facts={[
                  `${r.documents} Dokument${r.documents === 1 ? "" : "e"}`,
                  `${r.members} Person${r.members === 1 ? "" : "en"}`,
                ]}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RoomCard({
  href,
  title,
  subtitle,
  icon: Icon,
  facts,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  facts: string[];
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Icon size={16} aria-hidden="true" className="text-[color:var(--brand-primary)]" />
            <span className="truncate">{title}</span>
            <ArrowRight
              size={14}
              aria-hidden="true"
              className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
            />
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 pt-0 text-xs text-[color:var(--ds-text-muted)]">
          {facts.map((f, i) => (
            <span key={f} className="inline-flex items-center gap-1">
              {i === 0 ? (
                <FileText size={12} aria-hidden="true" />
              ) : (
                <Users size={12} aria-hidden="true" />
              )}
              {f}
            </span>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
