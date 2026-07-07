"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  TrendingUp,
  Scale,
  BookOpen,
  Calendar,
  RefreshCw,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { frontmatterOf, type DecisionFrontmatter } from "@/lib/legal-types";

// ── Types ─────────────────────────────────────────────────────────────

interface StoredDecision {
  slug: string;
  title: string;
  created_at: string;
  snippet?: string;
  [key: string]: unknown;
}

interface NormalizedDecision {
  id: string;
  title: string;
  court: string;
  date: string;
  year: number;
  legalArea: string;
  jurisdiction: string;
  outcome?: string;
  keywords: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function parseDecisions(pages: StoredDecision[]): NormalizedDecision[] {
  return pages.map((p) => {
    const fm = frontmatterOf<DecisionFrontmatter>(p);
    const raw = p as {
      court?: string;
      date?: string;
      legal_area?: string;
      jurisdiction?: string;
      outcome?: string;
      keywords?: string[];
    };
    const date = fm.date || raw.date || p.created_at || "";
    const year = date ? new Date(date).getFullYear() : new Date().getFullYear();
    return {
      id: p.slug,
      title: p.title,
      court: fm.court || raw.court || "Unbekannt",
      date,
      year: isNaN(year) ? new Date().getFullYear() : year,
      legalArea: fm.legal_area || raw.legal_area || "Allgemein",
      jurisdiction: fm.jurisdiction || raw.jurisdiction || "at",
      outcome: fm.outcome || raw.outcome,
      keywords: fm.keywords || raw.keywords || [],
    };
  });
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  return arr.reduce(
    (acc, item) => {
      const k = key(item);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

function topN(record: Record<string, number>, n: number): [string, number][] {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ── Bar Component ─────────────────────────────────────────────────────

function HBar({
  label,
  value,
  max,
  color = "var(--accent-premium)",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 3,
          color: "var(--ds-text)",
        }}
      >
        <span
          style={{
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span style={{ fontWeight: 600, color: "var(--ds-text)" }}>{value}</span>
      </div>
      <div style={{ height: 6, background: "var(--ds-border)", borderRadius: 3 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div
      style={{
        background: "var(--ds-surface)",
        border: "1px solid var(--ds-border)",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: "var(--accent-premium)" }}>{icon}</span>
        <span
          style={{
            fontSize: 11,
            color: "var(--ds-text-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ds-text)", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color:
              trend === "up"
                ? "var(--ds-success-text)"
                : trend === "down"
                  ? "var(--ds-danger-text)"
                  : "var(--ds-text-subtle)",
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {trend === "up" ? (
            <ArrowUpRight size={11} />
          ) : trend === "down" ? (
            <ArrowDownRight size={11} />
          ) : null}
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

export default function LitigationAnalyticsPage() {
  const { t } = useLang();
  const [decisions, setDecisions] = useState<NormalizedDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [jurisdiction, setJurisdiction] = useState<"all" | "at" | "de" | "ch">("all");
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setLoading(true);
      try {
        const pages = await api.brain.search("court_decision Urteil Beschluss Entscheidung", 200);
        if (cancelled) return;
        const all = parseDecisions(pages as unknown as StoredDecision[]).filter(
          (d) => d.court !== "Unbekannt" || d.legalArea !== "Allgemein"
        );
        setDecisions(all);
      } catch (err) {
        console.error("[analytics] load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Filtered set ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return decisions.filter((d) => {
      if (jurisdiction !== "all" && d.jurisdiction !== jurisdiction) return false;
      if (yearFilter && d.year !== yearFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !d.title.toLowerCase().includes(q) &&
          !d.court.toLowerCase().includes(q) &&
          !d.legalArea.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [decisions, jurisdiction, yearFilter, searchQuery]);

  // ── Derived Stats ─────────────────────────────────────────────────

  const byCourt = useMemo(() => countBy(filtered, (d) => d.court), [filtered]);
  const byArea = useMemo(() => countBy(filtered, (d) => d.legalArea), [filtered]);
  const byYear = useMemo(() => countBy(filtered, (d) => String(d.year)), [filtered]);
  const byJurisdiction = useMemo(() => countBy(filtered, (d) => d.jurisdiction), [filtered]);

  const years = useMemo(
    () =>
      Object.keys(byYear)
        .map(Number)
        .sort((a, b) => b - a),
    [byYear]
  );

  const topCourts = topN(byCourt, 8);
  const topAreas = topN(byArea, 8);
  const maxCourt = topCourts[0]?.[1] ?? 1;
  const maxArea = topAreas[0]?.[1] ?? 1;

  const currentYear = new Date().getFullYear();
  const thisYearCount = byYear[String(currentYear)] ?? 0;
  const lastYearCount = byYear[String(currentYear - 1)] ?? 0;
  const yoyPct =
    lastYearCount > 0 ? Math.round(((thisYearCount - lastYearCount) / lastYearCount) * 100) : 0;

  const areaColors: Record<string, string> = {
    Arbeitsrecht: "var(--accent-premium)",
    Mietrecht: "var(--accent-premium)",
    Vertragsrecht: "var(--ds-info-text)",
    Gesellschaftsrecht: "var(--ds-success-text)",
    Steuerrecht: "var(--ds-warning-text)",
    Familienrecht: "var(--ds-danger-text)",
    Strafrecht: "var(--ds-danger-text)",
    Verwaltungsrecht: "var(--ds-warning-text)",
    Allgemein: "var(--ds-text-subtle)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--ds-bg)",
        color: "var(--ds-text)",
        padding: "0 0 40px",
      }}
    >
      <PageHeader title={t("rs_analytics.title")} description={t("rs_analytics.description")} />

      <div style={{ padding: "0 24px" }}>
        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Input
            placeholder="Gericht, Rechtsgebiet, Stichwort…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 260, fontSize: 13 }}
          />
          {(["all", "at", "de", "ch"] as const).map((j) => (
            <button
              key={j}
              onClick={() => setJurisdiction(j)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                background: jurisdiction === j ? "var(--accent-premium)" : "var(--ds-surface)",
                border: `1px solid ${jurisdiction === j ? "var(--accent-premium)" : "var(--ds-border)"}`,
                color: jurisdiction === j ? "var(--ds-surface)" : "var(--ds-text-subtle)",
              }}
            >
              {j === "all" ? "Alle" : j.toUpperCase()}
            </button>
          ))}
          {yearFilter && (
            <button
              onClick={() => setYearFilter(null)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                background: "var(--ds-border)",
                border: "1px solid var(--ds-border-strong)",
                color: "var(--ds-text)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {yearFilter} ×
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--ds-text-subtle)" }}>
            <RefreshCw
              size={24}
              style={{ margin: "0 auto 12px", animation: "spin 1s linear infinite" }}
            />
            <div style={{ fontSize: 13 }}>Lädt Judikatur-Daten…</div>
          </div>
        ) : (
          <>
            {/* Stats Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <StatCard
                icon={<Scale size={16} />}
                label="Entscheidungen gesamt"
                value={filtered.length}
                sub={`${decisions.length} in der Brain`}
              />
              <StatCard
                icon={<Landmark size={16} />}
                label="Gerichte"
                value={Object.keys(byCourt).length}
              />
              <StatCard
                icon={<BookOpen size={16} />}
                label="Rechtsgebiete"
                value={Object.keys(byArea).length}
              />
              <StatCard
                icon={<TrendingUp size={16} />}
                label={`${currentYear} (YoY)`}
                value={thisYearCount}
                sub={
                  yoyPct !== 0
                    ? `${yoyPct > 0 ? "+" : ""}${yoyPct}% vs. Vorjahr`
                    : "Kein Vorjahresvergleich"
                }
                trend={yoyPct > 0 ? "up" : yoyPct < 0 ? "down" : "neutral"}
              />
            </div>

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
            >
              {/* By Court */}
              <div
                style={{
                  background: "var(--ds-surface)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ds-text)",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Landmark size={14} style={{ color: "var(--accent-premium)" }} /> Top Gerichte
                </div>
                {topCourts.length === 0 ? (
                  <div style={{ color: "var(--ds-text-subtle)", fontSize: 12 }}>Keine Daten</div>
                ) : (
                  topCourts.map(([court, count]) => (
                    <HBar
                      key={court}
                      label={court}
                      value={count}
                      max={maxCourt}
                      color="var(--accent-premium)"
                    />
                  ))
                )}
              </div>

              {/* By Legal Area */}
              <div
                style={{
                  background: "var(--ds-surface)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ds-text)",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Scale size={14} style={{ color: "var(--accent-premium)" }} /> Rechtsgebiete
                </div>
                {topAreas.length === 0 ? (
                  <div style={{ color: "var(--ds-text-subtle)", fontSize: 12 }}>Keine Daten</div>
                ) : (
                  topAreas.map(([area, count]) => (
                    <HBar
                      key={area}
                      label={area}
                      value={count}
                      max={maxArea}
                      color={areaColors[area] ?? "var(--accent-premium)"}
                    />
                  ))
                )}
              </div>
            </div>

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
            >
              {/* Timeline */}
              <div
                style={{
                  background: "var(--ds-surface)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ds-text)",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Calendar size={14} style={{ color: "var(--ds-info-text)" }} /> Zeitverlauf
                </div>
                {years.length === 0 ? (
                  <div style={{ color: "var(--ds-text-subtle)", fontSize: 12 }}>Keine Daten</div>
                ) : (
                  years.slice(0, 10).map((year) => (
                    <button
                      key={year}
                      onClick={() => setYearFilter(yearFilter === year ? null : year)}
                      style={{
                        width: "100%",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 0,
                        marginBottom: 8,
                      }}
                    >
                      <HBar
                        label={String(year)}
                        value={byYear[String(year)] ?? 0}
                        max={Math.max(...years.map((y) => byYear[String(y)] ?? 0))}
                        color={
                          yearFilter === year ? "var(--ds-info-text)" : "var(--ds-border-strong)"
                        }
                      />
                    </button>
                  ))
                )}
              </div>

              {/* Jurisdiction Breakdown */}
              <div
                style={{
                  background: "var(--ds-surface)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ds-text)",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <BarChart3 size={14} style={{ color: "var(--ds-success-text)" }} /> Jurisdiktion
                </div>
                {(["at", "de", "ch"] as const).map((j) => {
                  const cnt = byJurisdiction[j] ?? 0;
                  const total = filtered.length || 1;
                  const pct = Math.round((cnt / total) * 100);
                  return (
                    <div key={j} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ color: "var(--ds-text)" }}>{j.toUpperCase()}</span>
                        <span style={{ color: "var(--ds-text-subtle)" }}>
                          {cnt} ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: 8, background: "var(--ds-border)", borderRadius: 4 }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background:
                              j === "at"
                                ? "var(--accent-premium)"
                                : j === "de"
                                  ? "var(--accent-premium)"
                                  : "var(--ds-info-text)",
                            borderRadius: 4,
                            transition: "width 0.4s",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--ds-border)" }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ds-text-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      marginBottom: 10,
                    }}
                  >
                    Häufige Schlagwörter
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Array.from(
                      filtered
                        .flatMap((d) => d.keywords)
                        .reduce((m, kw) => {
                          m.set(kw, (m.get(kw) ?? 0) + 1);
                          return m;
                        }, new Map<string, number>())
                        .entries()
                    )
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 15)
                      .map(([kw, count]) => (
                        <Badge
                          key={kw}
                          variant="default"
                          style={{ fontSize: 11, cursor: "pointer" }}
                        >
                          {kw} {count > 1 && <span style={{ opacity: 0.6 }}>×{count}</span>}
                        </Badge>
                      ))}
                    {filtered.flatMap((d) => d.keywords).length === 0 && (
                      <span style={{ fontSize: 12, color: "var(--ds-text-subtle)" }}>
                        Keine Schlagwörter
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Decisions Table */}
            <div
              style={{
                background: "var(--ds-surface)",
                border: "1px solid var(--ds-border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--ds-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ds-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <BookOpen size={14} style={{ color: "var(--ds-warning-text)" }} /> Letzte
                  Entscheidungen ({filtered.length})
                </span>
              </div>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "var(--ds-text-subtle)",
                    fontSize: 13,
                  }}
                >
                  Noch keine Entscheidungen im Brain. Über Rechtsprechung → Judikatur-Sync
                  importieren.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--ds-bg)" }}>
                      {["Titel", "Gericht", "Datum", "Rechtsgebiet", "Jurisdiktion"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            color: "var(--ds-text-subtle)",
                            fontWeight: 500,
                            borderBottom: "1px solid var(--ds-border)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map((d) => (
                      <tr
                        key={d.id}
                        style={{ borderBottom: "1px solid var(--ds-border)" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--ds-surface-2)")
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td
                          style={{
                            padding: "8px 12px",
                            maxWidth: 300,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "var(--ds-text)",
                          }}
                        >
                          {d.title}
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--ds-text-subtle)" }}>
                          {d.court}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            color: "var(--ds-text-subtle)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {d.date ? new Date(d.date).toLocaleDateString("de-AT") : "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Badge
                            variant="default"
                            style={{
                              fontSize: 10,
                              background: `${areaColors[d.legalArea] ?? "var(--ds-border)"}20`,
                              color: areaColors[d.legalArea] ?? "var(--ds-text-subtle)",
                              border: "none",
                            }}
                          >
                            {d.legalArea}
                          </Badge>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Badge variant="default" style={{ fontSize: 10 }}>
                            {d.jurisdiction.toUpperCase()}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
