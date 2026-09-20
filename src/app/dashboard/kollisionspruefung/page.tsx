"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Copy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ConflictCheckResponse, ConflictMatch } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

/**
 * Fields the engine returns beyond the shared ConflictMatch type
 * (server/src/core/legal/conflict-check.ts).
 */
type EngineMatch = ConflictMatch & {
  quelle?: "case" | "contact" | "entity";
  entity_role?: string;
  case_ref?: string;
};
type EngineResult = ConflictCheckResponse & { checked_rows?: number };

const SEVERITY_CONFIG: Record<
  ConflictCheckResponse["severity"],
  {
    labelKey: DashboardKey;
    icon: React.ElementType;
    tone: string;
    iconClass: string;
  }
> = {
  none: {
    labelKey: "conflict.severity_none",
    icon: CheckCircle2,
    tone: "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]",
    iconClass: "text-[color:var(--ds-success-text)]",
  },
  low: {
    labelKey: "conflict.severity_low",
    icon: AlertTriangle,
    tone: "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]",
    iconClass: "text-[color:var(--ds-warning-text)]",
  },
  critical: {
    labelKey: "conflict.severity_critical",
    icon: ShieldAlert,
    tone: "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]",
    iconClass: "text-[color:var(--ds-danger-text)]",
  },
};

const ROLE_LABEL: Record<ConflictMatch["role"], string> = {
  client: "Mandantenseite",
  opponent: "Gegnerseite",
  contact: "Beteiligter",
};

const ROLE_TONE: Record<ConflictMatch["role"], string> = {
  client:
    "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  opponent:
    "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  contact:
    "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
};

const ENTITY_ROLE_LABEL: Record<string, string> = {
  opfer: "Opfer",
  privatbeteiligter: "Privatbeteiligter",
  kläger: "Kläger",
  klaeger: "Kläger",
  antragsteller: "Antragsteller",
  beschuldigter: "Beschuldigter",
  beklagter: "Beklagter",
  angeklagter: "Angeklagter",
  antragsgegner: "Antragsgegner",
  zeuge: "Zeuge",
  sachverstaendiger: "Sachverständiger",
  sachverständiger: "Sachverständiger",
  dritt_partei: "Dritter",
};

const STATUS_LABEL: Record<string, string> = {
  open: "offen",
  active: "offen",
  in_progress: "offen",
  pending: "offen",
  closed: "abgeschlossen",
  done: "abgeschlossen",
  settled: "verglichen",
  won: "abgeschlossen",
  lost: "abgeschlossen",
  archived: "archiviert",
};

/** Where a hit lives: the Akte for case/entity hits, the contact list otherwise. */
function matchHref(m: EngineMatch): string | null {
  if (m.quelle === "entity") return m.case_ref ? `/dashboard/cases/${m.case_ref}` : null;
  if (m.quelle === "contact" || m.role === "contact") return "/dashboard/contacts";
  return `/dashboard/cases/${m.slug}`;
}

function matchKind(m: EngineMatch): { label: string; strong: boolean } {
  if (m.exact || m.match_type === "exact") return { label: "Treffer", strong: true };
  const pct = typeof m.similarity === "number" ? Math.round(m.similarity * 100) : null;
  if (m.match_type === "fuzzy")
    return { label: pct ? `Ähnlicher Name · ${pct} %` : "Ähnlicher Name", strong: false };
  return { label: "Teiltreffer", strong: false };
}

function sourceLabel(m: EngineMatch): string {
  if (m.quelle === "contact") return "Kontakt";
  if (m.quelle === "entity") return "Beteiligter in Akte";
  return "Akte";
}

/** Server wording still says "Brain" in one branch; lawyers see "Kanzleiwissen". */
function cleanExplanation(text: string): string {
  return text.replace(/\bim Brain\b/g, "im Kanzleiwissen");
}

export default function KollisionspruefungPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [searchName, setSearchName] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Die eigentliche Prüfung läuft SERVERSEITIG über alle Akten der Kanzlei
  // (kein 200-Zeilen-Limit, kein Frontmatter-Roundtrip). Siehe
  // POST /api/legal/conflict-check.
  async function performCheck(name: string) {
    if (!name.trim()) return;
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const res = (await api.legal.conflictCheck(name.trim())) as EngineResult;
      setResult(res);
      setCheckedAt(new Date());
    } catch {
      // Never surface raw proxy/engine messages to the lawyer.
      setError(t("conflict.error_default"));
    } finally {
      setChecking(false);
    }
  }

  // Deep link: /dashboard/kollisionspruefung?name=… prefills and runs the check.
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get("name")?.trim();
    if (name) {
      setSearchName(name);
      void performCheck(name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const cfg = result ? SEVERITY_CONFIG[result.severity] : null;
  const Icon = cfg?.icon ?? CheckCircle2;
  const matches = (result?.matches ?? []) as EngineMatch[];
  const exactCount = matches.filter((m) => m.exact || m.match_type === "exact").length;
  const partialCount = matches.length - exactCount;
  const clientCount = matches.filter((m) => m.role === "client").length;
  const opponentCount = matches.filter((m) => m.role === "opponent").length;
  // Direct hits first, then by similarity.
  const sorted = [...matches].sort((a, b) => {
    const ea = a.exact ? 1 : 0;
    const eb = b.exact ? 1 : 0;
    if (ea !== eb) return eb - ea;
    return (b.similarity ?? 0) - (a.similarity ?? 0);
  });

  function copyProtocol() {
    if (!result || !cfg) return;
    const lines = [
      `Kollisionsprüfung: ${result.name}`,
      `Geprüft am: ${formatDateTime(checkedAt)}`,
      `Ergebnis: ${t(cfg.labelKey)}`,
      cleanExplanation(result.explanation),
      "",
      ...(sorted.length
        ? sorted.map(
            (m) =>
              `- ${m.title} — ${ROLE_LABEL[m.role]}${
                m.entity_role ? ` (${ENTITY_ROLE_LABEL[m.entity_role] ?? m.entity_role})` : ""
              } — ${matchKind(m).label}${m.exact ? "" : ` (${m.matched_name})`}`
          )
        : ["Keine Treffer."]),
      "",
      t("conflict.disclaimer"),
    ];
    void navigator.clipboard.writeText(lines.join("\n")).then(
      () => addToast({ type: "success", title: "Prüfprotokoll kopiert" }),
      () => addToast({ type: "error", title: "Kopieren nicht möglich" })
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("conflict.title")}
        description={t("conflict.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("conflict.breadcrumb") },
        ]}
      />

      {/* Search */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">{t("conflict.intro")}</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
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
            className="gap-2 whitespace-nowrap"
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
      <div aria-live="polite" className="space-y-4">
        {error && (
          <div
            className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
            role="alert"
          >
            <AlertTriangle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {result && cfg && (
          <>
            {/* Verdict */}
            <section
              aria-label="Ergebnis der Kollisionsprüfung"
              className={cn("rounded-xl border p-4", cfg.tone)}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <Icon
                  size={22}
                  className={cn("mt-0.5 shrink-0", cfg.iconClass)}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-base font-semibold", cfg.iconClass)}>{t(cfg.labelKey)}</p>
                  <p className="mt-0.5 text-sm text-[color:var(--ds-text)]">
                    {cleanExplanation(result.explanation)}
                  </p>
                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[color:var(--ds-text-muted)]">
                    <div className="flex gap-1">
                      <dt>Geprüfter Name:</dt>
                      <dd className="font-medium text-[color:var(--ds-text)]">{result.name}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Treffer:</dt>
                      <dd className="font-medium text-[color:var(--ds-text)] tabular-nums">
                        {matches.length}
                        {matches.length > 0 &&
                          ` (${exactCount} exakt${partialCount > 0 ? `, ${partialCount} Teiltreffer` : ""})`}
                      </dd>
                    </div>
                    {clientCount > 0 && (
                      <div className="flex gap-1">
                        <dt>Mandantenseite:</dt>
                        <dd className="font-medium text-[color:var(--ds-text)] tabular-nums">
                          {clientCount}
                        </dd>
                      </div>
                    )}
                    {opponentCount > 0 && (
                      <div className="flex gap-1">
                        <dt>Gegnerseite:</dt>
                        <dd className="font-medium text-[color:var(--ds-text)] tabular-nums">
                          {opponentCount}
                        </dd>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <dt>Geprüft am:</dt>
                      <dd className="text-[color:var(--ds-text)] tabular-nums">
                        {formatDateTime(checkedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 whitespace-nowrap"
                    onClick={copyProtocol}
                  >
                    <Copy size={14} aria-hidden="true" />
                    Protokoll kopieren
                  </Button>
                  {result.severity === "none" && searchName.trim() && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 whitespace-nowrap"
                      asChild
                    >
                      <Link
                        href={`/dashboard/intake?new=1&name=${encodeURIComponent(searchName.trim())}`}
                      >
                        Mandatsannahme starten
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </section>

            {/* Matches */}
            {sorted.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                  {t("conflict.matches_title").replace("{{count}}", String(sorted.length))}
                </h2>
                <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                  {sorted.map((m) => {
                    const href = matchHref(m);
                    const kind = matchKind(m);
                    const status =
                      m.quelle === "entity" || m.quelle === "contact" || m.role === "contact"
                        ? null
                        : STATUS_LABEL[m.status?.toLowerCase()];
                    return (
                      <li
                        key={`${m.slug}-${m.role}`}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {href ? (
                              <Link
                                href={href}
                                className="inline-flex items-center gap-1 truncate text-sm font-medium text-[color:var(--ds-text)] hover:text-[color:var(--brand-primary)] hover:underline"
                              >
                                {m.title}
                                <ArrowUpRight size={12} aria-hidden="true" />
                              </Link>
                            ) : (
                              <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                                {m.title}
                              </span>
                            )}
                            {status && (
                              <span className="text-xs text-[color:var(--ds-text-subtle)]">
                                {status}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                            {sourceLabel(m)}
                            {m.entity_role &&
                              ` · ${ENTITY_ROLE_LABEL[m.entity_role.toLowerCase()] ?? m.entity_role}`}
                            {!kind.strong && (
                              <>
                                {" · erfasst als "}
                                <span className="font-medium text-[color:var(--ds-text)]">
                                  {m.matched_name}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                              ROLE_TONE[m.role]
                            )}
                          >
                            {ROLE_LABEL[m.role]}
                          </span>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
                              kind.strong
                                ? "border-[color:var(--ds-border-strong)] font-medium text-[color:var(--ds-text)]"
                                : "border-dashed border-[color:var(--ds-border-strong)] text-[color:var(--ds-text-muted)]"
                            )}
                          >
                            {kind.label}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {/* Disclaimer */}
      <div className="border-t border-[color:var(--ds-border)] pt-4 text-xs text-[color:var(--ds-text-muted)]">
        <p>{t("conflict.disclaimer")}</p>
      </div>
    </div>
  );
}
