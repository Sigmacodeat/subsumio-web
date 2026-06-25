"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  TrendingUp,
  Scale,
  BookOpen,
  Calendar,
  RefreshCw,
  Download,
  Filter,
  ChevronDown,
  Landmark,
  AlertTriangle,
  CheckCircle2,
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
  color = "#6366f1",
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
          color: "#c0c0d8",
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
        <span style={{ fontWeight: 600, color: "#e8e8f0" }}>{value}</span>
      </div>
      <div style={{ height: 6, background: "#1e1e3a", borderRadius: 3 }}>
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
        background: "#0d0d1a",
        border: "1px solid #1e1e3a",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: "#6366f1" }}>{icon}</span>
        <span
          style={{
            fontSize: 11,
            color: "#6a6a8a",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#e8e8f0", lineHeight: 1 }}>{value}</div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#8a8aa8",
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
  const [decisions, setDecisions] = useState<NormalizedDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [jurisdiction, setJurisdiction] = useState<"all" | "at" | "de" | "ch">("all");
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Pull all court decisions from the brain
        const pages = await api.brain.search("court_decision Urteil Beschluss Entscheidung", 200);
        const all = parseDecisions(pages as StoredDecision[]).filter(
          (d) => d.court !== "Unbekannt" || d.legalArea !== "Allgemein"
        );
        setDecisions(all);
      } catch (err) {
        console.error("[analytics] load error:", err);
      } finally {
        setLoading(false);
      }
    })();
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
    Arbeitsrecht: "#6366f1",
    Mietrecht: "#8b5cf6",
    Vertragsrecht: "#06b6d4",
    Gesellschaftsrecht: "#10b981",
    Steuerrecht: "#f59e0b",
    Familienrecht: "#ec4899",
    Strafrecht: "#ef4444",
    Verwaltungsrecht: "#f97316",
    Allgemein: "#6a6a8a",
  };

  return (
    <div
      style={{ minHeight: "100vh", background: "#0a0a18", color: "#e8e8f0", padding: "0 0 40px" }}
    >
      <PageHeader
        icon={<BarChart3 size={18} />}
        title="Judikatur-Analytics"
        description="Rechtsprechungsanalyse aus dem Kanzlei-Brain"
      />

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
                background: jurisdiction === j ? "#6366f1" : "#0d0d1a",
                border: `1px solid ${jurisdiction === j ? "#6366f1" : "#1e1e3a"}`,
                color: jurisdiction === j ? "#fff" : "#8a8aa8",
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
                background: "#1e1e3a",
                border: "1px solid #2e2e5a",
                color: "#c0c0d8",
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
          <div style={{ textAlign: "center", padding: 80, color: "#6a6a8a" }}>
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
                  background: "#0d0d1a",
                  border: "1px solid #1e1e3a",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#c0c0d8",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Landmark size={14} style={{ color: "#6366f1" }} /> Top Gerichte
                </div>
                {topCourts.length === 0 ? (
                  <div style={{ color: "#6a6a8a", fontSize: 12 }}>Keine Daten</div>
                ) : (
                  topCourts.map(([court, count]) => (
                    <HBar key={court} label={court} value={count} max={maxCourt} color="#6366f1" />
                  ))
                )}
              </div>

              {/* By Legal Area */}
              <div
                style={{
                  background: "#0d0d1a",
                  border: "1px solid #1e1e3a",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#c0c0d8",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Scale size={14} style={{ color: "#8b5cf6" }} /> Rechtsgebiete
                </div>
                {topAreas.length === 0 ? (
                  <div style={{ color: "#6a6a8a", fontSize: 12 }}>Keine Daten</div>
                ) : (
                  topAreas.map(([area, count]) => (
                    <HBar
                      key={area}
                      label={area}
                      value={count}
                      max={maxArea}
                      color={areaColors[area] ?? "#6366f1"}
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
                  background: "#0d0d1a",
                  border: "1px solid #1e1e3a",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#c0c0d8",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Calendar size={14} style={{ color: "#06b6d4" }} /> Zeitverlauf
                </div>
                {years.length === 0 ? (
                  <div style={{ color: "#6a6a8a", fontSize: 12 }}>Keine Daten</div>
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
                        color={yearFilter === year ? "#06b6d4" : "#1e4a5a"}
                      />
                    </button>
                  ))
                )}
              </div>

              {/* Jurisdiction Breakdown */}
              <div
                style={{
                  background: "#0d0d1a",
                  border: "1px solid #1e1e3a",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#c0c0d8",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <BarChart3 size={14} style={{ color: "#10b981" }} /> Jurisdiktion
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
                        <span style={{ color: "#c0c0d8" }}>{j.toUpperCase()}</span>
                        <span style={{ color: "#8a8aa8" }}>
                          {cnt} ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: 8, background: "#1e1e3a", borderRadius: 4 }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: j === "at" ? "#6366f1" : j === "de" ? "#8b5cf6" : "#06b6d4",
                            borderRadius: 4,
                            transition: "width 0.4s",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #1e1e3a" }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6a6a8a",
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
                          variant="secondary"
                          style={{ fontSize: 11, cursor: "pointer" }}
                        >
                          {kw} {count > 1 && <span style={{ opacity: 0.6 }}>×{count}</span>}
                        </Badge>
                      ))}
                    {filtered.flatMap((d) => d.keywords).length === 0 && (
                      <span style={{ fontSize: 12, color: "#6a6a8a" }}>Keine Schlagwörter</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Decisions Table */}
            <div
              style={{
                background: "#0d0d1a",
                border: "1px solid #1e1e3a",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #1e1e3a",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#c0c0d8",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <BookOpen size={14} style={{ color: "#f59e0b" }} /> Letzte Entscheidungen (
                  {filtered.length})
                </span>
              </div>
              {filtered.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#6a6a8a", fontSize: 13 }}>
                  Noch keine Entscheidungen im Brain. Über Rechtsprechung → Judikatur-Sync
                  importieren.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#0a0a18" }}>
                      {["Titel", "Gericht", "Datum", "Rechtsgebiet", "Jurisdiktion"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            color: "#6a6a8a",
                            fontWeight: 500,
                            borderBottom: "1px solid #1e1e3a",
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
                        style={{ borderBottom: "1px solid #1a1a30" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#12122a")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td
                          style={{
                            padding: "8px 12px",
                            maxWidth: 300,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#c0c0d8",
                          }}
                        >
                          {d.title}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#8a8aa8" }}>{d.court}</td>
                        <td style={{ padding: "8px 12px", color: "#8a8aa8", whiteSpace: "nowrap" }}>
                          {d.date ? new Date(d.date).toLocaleDateString("de-AT") : "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Badge
                            variant="secondary"
                            style={{
                              fontSize: 10,
                              background: `${areaColors[d.legalArea] ?? "#1e1e3a"}20`,
                              color: areaColors[d.legalArea] ?? "#8a8aa8",
                              border: "none",
                            }}
                          >
                            {d.legalArea}
                          </Badge>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <Badge variant="outline" style={{ fontSize: 10 }}>
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
