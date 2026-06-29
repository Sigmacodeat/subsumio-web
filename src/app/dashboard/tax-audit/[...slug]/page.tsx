"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, User, Calendar, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

export default function TaxAuditDetailPage() {
  const params = useParams<{ slug: string[] }>();
  const slug = params.slug?.join("/") ?? "";
  const [data, setData] = useState<BrainPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    api.brain
      .getPage(slug)
      .then((p) => setData(p))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[color:var(--mk-text-subtle)]" size={24} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Link
          href="/dashboard/tax-audit"
          className="inline-flex items-center gap-1 text-sm text-[color:var(--mk-text-muted)] hover:text-[color:var(--brand-primary)]"
        >
          <ArrowLeft size={14} /> Zurück
        </Link>
        <p className="text-sm text-[color:var(--mk-text-subtle)]">
          Betriebsprüfung nicht gefunden.
        </p>
      </div>
    );
  }

  const fm = (data.frontmatter ?? {}) as Record<string, unknown>;
  const findings = Array.isArray(fm.findings)
    ? (fm.findings as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/dashboard/tax-audit"
        className="inline-flex items-center gap-1 text-sm text-[color:var(--mk-text-muted)] hover:text-[color:var(--brand-primary)]"
      >
        <ArrowLeft size={14} /> Zurück zur Übersicht
      </Link>

      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
          <Search size={24} className="text-rose-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[color:var(--mk-text)]">{data.title}</h1>
          <p className="text-sm text-[color:var(--mk-text-subtle)]">Betriebsprüfung</p>
        </div>
      </div>

      <Card className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Mandant</p>
            <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--mk-text)]">
              <User size={14} /> {String(fm.client_name ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Art</p>
            <p className="text-sm font-medium text-[color:var(--mk-text)]">
              {String(fm.audit_type ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Prüfer</p>
            <p className="text-sm font-medium text-[color:var(--mk-text)]">
              {String(fm.auditor ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Phase</p>
            <span className="inline-flex items-center rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400">
              {String(fm.phase ?? "vorbereitung")}
            </span>
          </div>
          {Boolean(fm.start_date) && (
            <div>
              <p className="text-xs text-[color:var(--mk-text-subtle)]">Beginn</p>
              <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--mk-text)]">
                <Calendar size={14} /> {String(fm.start_date).slice(0, 10)}
              </p>
            </div>
          )}
          {Boolean(fm.end_date) && (
            <div>
              <p className="text-xs text-[color:var(--mk-text-subtle)]">Ende</p>
              <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--mk-text)]">
                <Calendar size={14} /> {String(fm.end_date).slice(0, 10)}
              </p>
            </div>
          )}
        </div>

        {fm.total_additional_tax != null && Number(fm.total_additional_tax) > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-400">
            <AlertTriangle size={16} />
            Nachzahlung:{" "}
            {Number(fm.total_additional_tax).toLocaleString("de-DE", {
              style: "currency",
              currency: "EUR",
            })}
          </div>
        )}

        {findings.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-[color:var(--mk-text-subtle)]">
              Feststellungen ({findings.length})
            </p>
            <div className="space-y-2">
              {findings.map((f, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[color:var(--mk-border)] bg-[color:var(--mk-surface-2)] p-3 text-sm text-[color:var(--mk-text-muted)]"
                >
                  <p className="font-medium text-[color:var(--mk-text)]">
                    {String(f.title ?? `Feststellung ${i + 1}`)}
                  </p>
                  {Boolean(f.description) && (
                    <p className="mt-1 text-xs">{String(f.description)}</p>
                  )}
                  {f.amount != null && (
                    <p className="mt-1 text-xs font-medium text-rose-400">
                      +
                      {Number(f.amount).toLocaleString("de-DE", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {Boolean(fm.notes) && (
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Notizen</p>
            <p className="text-sm text-[color:var(--mk-text)]">{String(fm.notes)}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
