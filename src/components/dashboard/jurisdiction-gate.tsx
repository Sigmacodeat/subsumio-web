"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import { Card } from "@/components/ui/card";

interface JurisdictionGateProps {
  /** Jurisdictions for which the wrapped feature is available (e.g. ["DE"]). */
  allowed: string[];
  children: React.ReactNode;
}

/**
 * Route-level guard for jurisdiction-bound features (beA, DATEV are DE-only).
 * Navigation already hides the links, but direct URLs stay reachable — this
 * gate renders an "unavailable in your market" panel for other tenants.
 */
export function JurisdictionGate({ allowed, children }: JurisdictionGateProps) {
  const { t } = useLang();
  const meQuery = useMe();
  const jurisdiction = meQuery.data?.user?.jurisdiction;

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  if (!jurisdiction || !allowed.includes(jurisdiction)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
            <MapPin size={22} className="text-[color:var(--ds-text-muted)]" />
          </div>
          <h1 className="text-lg font-semibold text-[color:var(--ds-text)]">
            {t("feature.not_available_title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            {t("feature.not_available_desc")}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-4 py-2 text-sm font-medium text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-hover)]"
          >
            <ArrowLeft size={14} />
            {t("feature.not_available_back")}
          </Link>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
