"use client";

import { useState } from "react";
import {
  ShieldAlert,
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Users,
  Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { ConflictCheckResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

const SEVERITY_CONFIG: Record<
  ConflictCheckResponse["severity"],
  {
    labelKey: DashboardKey;
    iconClass: string;
    icon: React.ElementType;
  }
> = {
  none: { labelKey: "conflict.severity_none", iconClass: "text-emerald-600", icon: CheckCircle2 },
  low: { labelKey: "conflict.severity_low", iconClass: "text-amber-600", icon: AlertTriangle },
  critical: {
    labelKey: "conflict.severity_critical",
    iconClass: "text-red-600",
    icon: ShieldAlert,
  },
};

export default function KollisionspruefungPage() {
  const { t } = useLang();
  const [searchName, setSearchName] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ConflictCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Die eigentliche Prüfung läuft SERVERSEITIG über alle Akten des Brains
  // (kein 200-Zeilen-Limit, kein Frontmatter-Roundtrip). Siehe
  // POST /api/legal/conflict-check.
  async function performCheck(name: string) {
    if (!name.trim()) return;
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.legal.conflictCheck(name.trim());
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("conflict.error_default"));
    } finally {
      setChecking(false);
    }
  }

  const cfg = result ? SEVERITY_CONFIG[result.severity] : null;
  const Icon = cfg?.icon ?? CheckCircle2;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("conflict.title")}
        description={t("conflict.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("conflict.breadcrumb") },
        ]}
      />

      {/* Search */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">{t("conflict.intro")}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void performCheck(searchName);
          }}
        >
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
              aria-hidden="true"
            />
            <label htmlFor="conflict-name" className="sr-only">
              {t("conflict.label_name")}
            </label>
            <Input
              id="conflict-name"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder={t("conflict.placeholder_name")}
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
          <Button
            type="submit"
            disabled={checking || !searchName.trim()}
            variant="primary"
            className="brand-bg brand-bg gap-2 text-white"
          >
            {checking ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <ShieldAlert size={16} aria-hidden="true" />
            )}
            {t("conflict.btn_check")}
          </Button>
        </form>
      </div>

      {/* Results */}
      <div aria-live="polite">
        {error && (
          <div
            className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600"
            role="alert"
          >
            <AlertTriangle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {result && cfg && (
          <div
            className={cn(
              "rounded-xl border p-4",
              result.severity === "critical"
                ? "border-red-500/20 bg-red-500/5"
                : result.severity === "low"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            )}
          >
            <div className="mb-3 flex items-center gap-3">
              <Icon size={20} className={cn("shrink-0", cfg.iconClass)} aria-hidden="true" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[color:var(--ds-text)]">{result.name}</span>
                  <Badge
                    variant="default"
                    className={cn(
                      "border text-xs",
                      result.severity === "critical"
                        ? "border-red-500/20 bg-red-500/10 text-red-600"
                        : result.severity === "low"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                    )}
                  >
                    {t(cfg.labelKey)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                  {result.explanation}
                </p>
              </div>
            </div>

            {result.matches.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  {t("conflict.matches_title").replace("{{count}}", String(result.matches.length))}
                </p>
                {result.matches.map((m) => (
                  <div
                    key={`${m.slug}-${m.role}`}
                    className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                  >
                    {m.role === "client" ? (
                      <Users size={14} className="shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Building2 size={14} className="shrink-0 text-red-600" aria-hidden="true" />
                    )}
                    <span className="flex-1 text-sm text-[color:var(--ds-text)]">{m.title}</span>
                    {!m.exact && (
                      <Badge
                        variant="default"
                        className="border border-amber-500/20 bg-amber-500/10 text-xs text-amber-600"
                      >
                        {t("conflict.similar_name").replace("{{name}}", m.matched_name)}
                      </Badge>
                    )}
                    <Badge
                      variant="default"
                      className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {m.role === "client"
                        ? t("conflict.role_client")
                        : t("conflict.role_opponent")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="border-t border-[color:var(--ds-border)] pt-4 text-xs text-[color:var(--ds-text-muted)]">
        <p>{t("conflict.disclaimer")}</p>
      </div>
    </div>
  );
}
