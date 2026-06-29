"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Calendar, User, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

export default function TaxReturnDetailPage() {
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
          href="/dashboard/tax-returns"
          className="inline-flex items-center gap-1 text-sm text-[color:var(--mk-text-muted)] hover:text-[color:var(--brand-primary)]"
        >
          <ArrowLeft size={14} /> Zurück
        </Link>
        <p className="text-sm text-[color:var(--mk-text-subtle)]">
          Steuererklärung nicht gefunden.
        </p>
      </div>
    );
  }

  const fm = (data.frontmatter ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/dashboard/tax-returns"
        className="inline-flex items-center gap-1 text-sm text-[color:var(--mk-text-muted)] hover:text-[color:var(--brand-primary)]"
      >
        <ArrowLeft size={14} /> Zurück zur Übersicht
      </Link>

      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <FileText size={24} className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[color:var(--mk-text)]">{data.title}</h1>
          <p className="text-sm text-[color:var(--mk-text-subtle)]">Steuererklärung</p>
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
              {String(fm.tax_type ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Jahr</p>
            <p className="text-sm font-medium text-[color:var(--mk-text)]">
              {String(fm.year ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Status</p>
            <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
              {String(fm.status ?? "draft")}
            </span>
          </div>
          {Boolean(fm.due_date) && (
            <div>
              <p className="text-xs text-[color:var(--mk-text-subtle)]">Fälligkeit</p>
              <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--mk-text)]">
                <Calendar size={14} /> {String(fm.due_date).slice(0, 10)}
              </p>
            </div>
          )}
        </div>

        {Boolean(fm.notes) && (
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Notizen</p>
            <p className="text-sm text-[color:var(--mk-text)]">{String(fm.notes)}</p>
          </div>
        )}

        {data.content && (
          <div>
            <p className="text-xs text-[color:var(--mk-text-subtle)]">Beschreibung</p>
            <div className="rounded-lg border border-[color:var(--mk-border)] bg-[color:var(--mk-surface-2)] p-4 text-sm text-[color:var(--mk-text-muted)]">
              {data.content}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
