"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Loader2,
  Landmark,
  Save,
  Trash2,
  Sparkles,
  Scale,
  Clock,
  ChevronRight,
  X,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import type { BrainPage } from "@/lib/types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";

interface ResearchSession {
  id: string;
  query: string;
  answer: string;
  citations: Array<{ slug: string; title: string }>;
  gaps: string[];
  jurisdiction: string;
  createdAt: string;
}

export default function ResearchPage() {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [jurisdiction, setJurisdiction] = useState("de");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentCitations, setCurrentCitations] = useState<Array<{ slug: string; title: string }>>([]);
  const [currentGaps, setCurrentGaps] = useState<string[]>([]);
  const [currentGrounding, setCurrentGrounding] = useState<CitationPanelData["grounding"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPages, setSavedPages] = useState<BrainPage[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"new" | "saved">("new");
  const [savedSearch, setSavedSearch] = useState("");
  const [savedJurisdiction, setSavedJurisdiction] = useState<"all" | "at" | "de" | "ch" | "eu">("all");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  useEffect(() => { loadSavedResearch(); }, []);

  async function loadSavedResearch() {
    setSavedLoading(true);
    try {
      const pages = await api.brain.listPages({ type: "legal_research", limit: 50 });
      setSavedPages(pages);
      await setCache(OFFLINE_KEYS.research, pages);
    } catch {
      const cached = await getCache<BrainPage[]>(OFFLINE_KEYS.research);
      if (cached) {
        setSavedPages(cached);
        setError("Cloud-Brain gerade nicht erreichbar. Es werden zwischengespeicherte Recherchen angezeigt.");
      }
    } finally { setSavedLoading(false); }
  }

  async function runResearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setCurrentAnswer("");
    setCurrentCitations([]);
    setCurrentGaps([]);
    setCurrentGrounding(null);

    try {
      const prompt = `Recherchiere präzise zur folgenden Rechtsfrage unter Berücksichtigung des ${jurisdiction.toUpperCase()}-Rechts (Gesetze, Rechtsprechung, Literatur). Zitiere immer mit §, Absatz und Gesetzesabkürzung. Gib am Ende an: "Diese Information ersetzt keine anwaltliche Prüfung."\n\nRECHTSFRAGE: ${query}`;
      const result = await api.query.think(prompt, "balanced", (chunk) => {
        setCurrentAnswer((prev) => prev + chunk);
      });
      setCurrentAnswer(result.answer);
      setCurrentCitations(result.citations || []);
      setCurrentGaps(result.gaps || []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (result as any)._grounding || (result as any).grounding;
      if (g) setCurrentGrounding(g);

      const session: ResearchSession = {
        id: crypto.randomUUID(),
        query,
        answer: result.answer,
        citations: result.citations || [],
        gaps: result.gaps || [],
        jurisdiction,
        createdAt: new Date().toISOString(),
      };
      setSessions((s) => [session, ...s]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recherche fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function saveResearch() {
    if (!currentAnswer) return;
    try {
      const slug = `legal/research/${query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now()}`;
      const payload = {
        slug,
        title: `Recherche: ${query.slice(0, 80)}`,
        type: "legal_research",
        content: currentAnswer,
        frontmatter: {
          jurisdiction,
          query,
          citations: currentCitations.map((c) => c.title),
          gaps: currentGaps,
          research_date: new Date().toISOString(),
        },
      };
      if (isOnline()) {
        await api.brain.createPage(payload);
      } else {
        await enqueueMutation({ type: "createPage", payload });
      }
      const page = {
        ...payload,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as BrainPage;
      const nextPages = [page, ...savedPages];
      setSavedPages(nextPages);
      await setCache(OFFLINE_KEYS.research, nextPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
  }

  async function syncJudgements() {
    setLoading(true); setError(null);
    try {
      await api.legal.judgementsSync({ jurisdiction: jurisdiction as "at" | "de" | "all", query });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync fehlgeschlagen.");
    } finally { setLoading(false); }
  }

  async function deleteResearch(slug: string) {
    const ok = await confirm({
      title: "Recherche löschen",
      message: "Möchten Sie diese Recherche wirklich löschen?",
      confirmLabel: "Löschen",
      variant: "danger",
    });
    if (!ok) return;
    try {
      if (isOnline()) {
        await api.brain.deletePage(slug);
      } else {
        await enqueueMutation({ type: "deletePage", payload: { slug } });
      }
      const nextPages = savedPages.filter((page) => page.slug !== slug);
      setSavedPages(nextPages);
      await setCache(OFFLINE_KEYS.research, nextPages);
    }
    catch (err) { setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen."); }
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Legal Research"
        description="KI-gestützte Rechtsrecherche mit Zitation und Quellenangabe"
      />

      {/* Research Input */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className="bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]">
            <option value="de">🇩🇪 Deutschland</option>
            <option value="at">🇦🇹 Österreich</option>
            <option value="ch">🇨🇭 Schweiz</option>
            <option value="eu">🇪🇺 EU-Recht</option>
          </select>
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runResearch()}
              placeholder="Rechtsfrage eingeben… (z.B. 'Wann ist eine AGB-Klausel nach § 307 BGB unwirksam?')"
              className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-[color:var(--brand-primary)]"
            />
          </div>
          <Button onClick={runResearch} disabled={loading || !query.trim()} className="brand-bg brand-bg text-white gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? "Recherchiert…" : "Recherchieren"}
          </Button>
          <Button variant="secondary" onClick={syncJudgements} disabled={loading} className="bg-[color:var(--ds-hover)] border border-[color:var(--ds-border)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] gap-2">
            <Landmark size={14} /> Urteile-Sync
          </Button>
        </div>
        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>

      {/* Current Result */}
      {currentAnswer && (
        <div className="rounded-xl border brand-border bg-[color:var(--ds-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale size={16} className="brand-text" />
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Ergebnis</h3>
              <Badge variant="default" className="text-[10px] border brand-border brand-soft brand-text">{jurisdiction.toUpperCase()}</Badge>
            </div>
            <Button onClick={saveResearch} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-xs">
              <Save size={14} /> Als Brain-Page speichern
            </Button>
          </div>
          <div className="prose prose-invert prose-sm max-w-none text-[color:var(--ds-text-muted)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(currentAnswer) }}
          />
          <CitationPanel
            data={{
              citations: currentCitations,
              gaps: currentGaps,
              grounding: currentGrounding,
              isStreaming: loading,
              jurisdiction,
            }}
            className="mt-3"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[color:var(--ds-border)]">
        <button
          onClick={() => setActiveTab("new")}
          className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${
            activeTab === "new"
              ? "brand-border brand-text"
              : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          }`}
        >
          <span className="flex items-center gap-1.5"><Sparkles size={14} /> Neue Recherche</span>
        </button>
        <button
          onClick={() => setActiveTab("saved")}
          className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${
            activeTab === "saved"
              ? "brand-border brand-text"
              : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          }`}
        >
          <span className="flex items-center gap-1.5"><FolderOpen size={14} /> Gespeicherte Recherchen {savedPages.length > 0 && <span className="text-[10px] bg-[color:var(--ds-border)] px-1.5 py-0.5 rounded">{savedPages.length}</span>}</span>
        </button>
      </div>

      {activeTab === "new" && (
        <>
          {/* Current Result */}
          {currentAnswer && (
            <div className="rounded-xl border brand-border bg-[color:var(--ds-surface)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale size={16} className="brand-text" />
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Ergebnis</h3>
                  <Badge variant="default" className="text-[10px] border brand-border brand-soft brand-text">{jurisdiction.toUpperCase()}</Badge>
                </div>
                <Button onClick={saveResearch} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-xs">
                  <Save size={14} /> Als Brain-Page speichern
                </Button>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-[color:var(--ds-text-muted)] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(currentAnswer) }}
              />
          <CitationPanel
            data={{
              citations: currentCitations,
              gaps: currentGaps,
              grounding: currentGrounding,
              isStreaming: loading,
              jurisdiction,
            }}
            className="mt-3"
          />
        </div>
          )}

          {/* Recent Sessions */}
          {sessions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)] flex items-center gap-2">
                <Clock size={16} className="brand-text" />
                Sitzungs-Verlauf
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessions.map((s) => (
                  <div key={s.id} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[color:var(--ds-text)] truncate">{s.query}</span>
                      <Badge variant="default" className="text-[10px] border brand-border brand-soft brand-text">{s.jurisdiction.toUpperCase()}</Badge>
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)] line-clamp-2">{s.answer.slice(0, 150)}…</div>
                    <div className="flex items-center justify-between text-[10px] text-[color:var(--ds-text-muted)]">
                      <span>{new Date(s.createdAt).toLocaleString("de-DE")}</span>
                      {s.citations.length > 0 && <span>{s.citations.length} Quellen</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "saved" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
              <input
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder="Gespeicherte Recherchen durchsuchen…"
                className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "at", "de", "ch", "eu"] as const).map((j) => (
                <button
                  key={j}
                  onClick={() => setSavedJurisdiction(j)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                    savedJurisdiction === j
                      ? "brand-soft brand-border brand-text"
                      : "bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                  }`}
                >
                  {j === "all" ? "Alle" : j === "at" ? "🇦🇹 AT" : j === "de" ? "🇩🇪 DE" : j === "ch" ? "🇨🇭 CH" : "🇪🇺 EU"}
                </button>
              ))}
            </div>
          </div>

          {savedLoading ? (
            <div className="text-center py-8 text-[color:var(--ds-text-muted)]">Lade…</div>
          ) : savedPages.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <FolderOpen size={40} className="mx-auto text-[color:var(--ds-border)]" />
              <p className="text-sm text-[color:var(--ds-text-muted)]">Noch keine Recherchen gespeichert.</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Starte eine neue Recherche und speichere das Ergebnis.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                let filtered = savedPages;
                if (savedJurisdiction !== "all") {
                  filtered = filtered.filter((p) => (p.frontmatter?.jurisdiction as string) === savedJurisdiction);
                }
                if (savedSearch.trim()) {
                  const q = savedSearch.toLowerCase();
                  filtered = filtered.filter((p) =>
                    p.title.toLowerCase().includes(q) ||
                    ((p.frontmatter?.query as string) || "").toLowerCase().includes(q) ||
                    (p.content || "").toLowerCase().includes(q)
                  );
                }
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-[color:var(--ds-text-muted)] text-sm">Keine Recherchen passen zu den Filtern.</div>
                  );
                }
                return filtered.map((page) => {
                  const fm = page.frontmatter ?? {};
                  const j = (fm.jurisdiction as string) || "";
                  const q = (fm.query as string) || "";
                  const isExpanded = expandedSlug === page.slug;
                  return (
                    <div key={page.slug} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[color:var(--ds-text)] truncate">{page.title}</span>
                            {j && (
                              <Badge variant="default" className={`text-[10px] border ${
                                j === "at" ? "bg-red-500/10 border-red-500/20 text-red-600" :
                                j === "ch" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" :
                                j === "eu" ? "bg-amber-500/10 border-amber-500/20 text-amber-600" :
                                "bg-blue-500/10 border-blue-500/20 text-blue-600"
                              }`}>{j.toUpperCase()}</Badge>
                            )}
                          </div>
                          {q && <p className="text-xs text-[color:var(--ds-text-muted)] mt-1 truncate">{q}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setExpandedSlug(isExpanded ? null : page.slug)}
                            className="p-1.5 rounded-lg text-[color:var(--ds-text-muted)] hover:brand-text brand-bg/10 transition-all"
                            title={isExpanded ? "Zuklappen" : "Aufklappen"}
                          >
                            {isExpanded ? <X size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <button onClick={() => deleteResearch(page.slug)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[color:var(--ds-text-muted)] hover:text-red-600 hover:bg-red-500/10 transition-all" title="Löschen">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {isExpanded ? (
                        <div className="prose prose-invert prose-sm max-w-none text-[color:var(--ds-text-muted)] leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content || "") }}
                        />
                      ) : (
                        <div className="text-xs text-[color:var(--ds-text-muted)] line-clamp-2">{page.content?.slice(0, 200)}…</div>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-[color:var(--ds-text-muted)]">
                        <span className="flex items-center gap-1"><Clock size={9} />{new Date((page as unknown as Record<string, unknown>).createdAt as string || (page as unknown as Record<string, unknown>).created_at as string || page.created_at || new Date().toISOString()).toLocaleDateString("de-DE")}</span>
                        <div className="flex items-center gap-2">
                          {Array.isArray(fm.citations) && fm.citations.length > 0 && <span>{fm.citations.length} Quellen</span>}
                          {Array.isArray(fm.gaps) && fm.gaps.length > 0 && <span className="text-amber-600">{fm.gaps.length} Lücken</span>}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
