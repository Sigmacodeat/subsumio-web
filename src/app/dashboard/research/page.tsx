"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  Search,
  Loader2,
  Landmark,
  Save,
  Trash2,
  Scale,
  Clock,
  ChevronRight,
  X,
  FolderOpen,
  BookOpen,
  Brain,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import type { BrainPage } from "@/lib/types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useLang } from "@/lib/use-lang";
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

import dynamic from "next/dynamic";

const RechtsprechungTab = dynamic(() => import("@/components/research/rechtsprechung-tab"), {
  loading: () => (
    <div className="flex items-center justify-center py-20 text-sm text-[color:var(--ds-text-muted)]">
      Laden…
    </div>
  ),
});
const NormsTab = dynamic(() => import("@/components/research/norms-tab"), {
  loading: () => (
    <div className="flex items-center justify-center py-20 text-sm text-[color:var(--ds-text-muted)]">
      Laden…
    </div>
  ),
});
const JudgementsDbTab = dynamic(() => import("@/components/research/judgements-db-tab"), {
  loading: () => (
    <div className="flex items-center justify-center py-20 text-sm text-[color:var(--ds-text-muted)]">
      Laden…
    </div>
  ),
});
const PrecedentSearchTab = dynamic(() => import("@/components/research/precedent-search-tab"), {
  loading: () => (
    <div className="flex items-center justify-center py-20 text-sm text-[color:var(--ds-text-muted)]">
      Laden…
    </div>
  ),
});
const CommentariesTab = dynamic(() => import("@/components/research/commentaries-tab"), {
  loading: () => (
    <div className="flex items-center justify-center py-20 text-sm text-[color:var(--ds-text-muted)]">
      Laden…
    </div>
  ),
});

type ResearchTab =
  | "recherche"
  | "rechtsprechung"
  | "normen"
  | "judgements-db"
  | "precedent-search"
  | "commentaries";

const TABS: Array<{ id: ResearchTab; icon: typeof Search; labelDe: string; labelEn: string }> = [
  { id: "recherche", icon: Brain, labelDe: "Recherche", labelEn: "Research" },
  { id: "rechtsprechung", icon: Landmark, labelDe: "Rechtsprechung", labelEn: "Case Law" },
  { id: "normen", icon: BookOpen, labelDe: "Normen", labelEn: "Statutes" },
  { id: "judgements-db", icon: Scale, labelDe: "Urteils-DB", labelEn: "Judgements DB" },
  { id: "precedent-search", icon: Search, labelDe: "Präzedenzfälle", labelEn: "Precedent Search" },
  {
    id: "commentaries",
    icon: MessageSquareText,
    labelDe: "Kommentierungen",
    labelEn: "Commentaries",
  },
];

function ResearchPageInner() {
  const { t, lang } = useLang();
  const confirm = useConfirm();
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [jurisdiction, setJurisdiction] = useState("de");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentCitations, setCurrentCitations] = useState<Array<{ slug: string; title: string }>>(
    []
  );
  const [currentGaps, setCurrentGaps] = useState<string[]>([]);
  const [currentGrounding, setCurrentGrounding] = useState<CitationPanelData["grounding"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPages, setSavedPages] = useState<BrainPage[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const tabFromUrl = searchParams.get("tab") as ResearchTab | null;
  const [activeTab, setActiveTabState] = useState<ResearchTab>(
    tabFromUrl && TABS.some((tab) => tab.id === tabFromUrl) ? tabFromUrl : "recherche"
  );

  const setActiveTab = (tab: ResearchTab) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/dashboard/research?${params.toString()}`, { scroll: false });
  };
  const [subTab, setSubTab] = useState<"new" | "saved">("new");
  const [savedSearch, setSavedSearch] = useState("");
  // Supervisor job tracking
  const [researchJobId, setResearchJobId] = useState<number | null>(null);
  const [researchPhase, setResearchPhase] = useState<string>("");
  const [savedJurisdiction, setSavedJurisdiction] = useState<"all" | "at" | "de" | "ch" | "eu">(
    "all"
  );
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  useEffect(() => {
    loadSavedResearch();
  }, []);

  async function loadSavedResearch() {
    setSavedLoading(true);
    try {
      const pages = await api.brain.listPages({ type: "legal_research", limit: 200 });
      setSavedPages(pages);
      await setCache(OFFLINE_KEYS.research, pages);
    } catch {
      const cached = await getCache<BrainPage[]>(OFFLINE_KEYS.research);
      if (cached) {
        setSavedPages(cached);
        setError(
          "Cloud-Brain gerade nicht erreichbar. Es werden zwischengespeicherte Recherchen angezeigt."
        );
      }
    } finally {
      setSavedLoading(false);
    }
  }

  async function runResearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setCurrentAnswer("");
    setCurrentCitations([]);
    setCurrentGaps([]);
    setCurrentGrounding(null);
    setResearchJobId(null);
    setResearchPhase(t("research.phase_preparing"));

    try {
      // Submit to Supervisor agent pipeline for deep, multi-step research.
      // Falls back to one-shot think if the supervisor endpoint is unavailable.
      const submitRes = await fetch("/api/legal/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, jurisdiction, budget_cents: 200 }),
      });

      if (!submitRes.ok) throw new Error(`submit failed: ${submitRes.status}`);
      const submitData = (await submitRes.json()) as { jobId: number };
      const jobId = submitData.jobId;
      setResearchJobId(jobId);
      setResearchPhase(t("research.phase_planning"));

      // Variables to capture results from the polling closure
      let answerText = "";
      let citations: Array<{ slug: string; title: string }> = [];
      let gaps: string[] = [];

      // Poll until done
      const POLL_INTERVAL = 3000;
      const MAX_WAIT_MS = 5 * 60 * 1000; // 5 min
      const started = Date.now();

      await new Promise<void>((resolve, reject) => {
        const poll = async () => {
          if (Date.now() - started > MAX_WAIT_MS) {
            reject(new Error(t("research.error_timeout")));
            return;
          }
          try {
            const statusRes = await fetch(`/api/agents/${jobId}`);
            if (!statusRes.ok) {
              setTimeout(poll, POLL_INTERVAL);
              return;
            }
            const job = (await statusRes.json()) as {
              status: string;
              result?: { answer?: string; output?: string; text?: string };
              progress?: { phase?: string; step?: string; message?: string };
              error_text?: string;
            };

            // Update phase label from progress
            const phase = job.progress?.phase ?? job.progress?.message ?? job.progress?.step;
            if (phase) setResearchPhase(phase);

            if (job.status === "completed") {
              // Extract answer from result
              const raw = job.result?.answer ?? job.result?.output ?? job.result?.text ?? "";
              answerText = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
              setCurrentAnswer(answerText);
              setResearchPhase("");

              // Extract citations and grounding from the answer text
              try {
                const grounding = await api.legal.ground(answerText);
                setCurrentGrounding(grounding);
                // Extract structured citations from grounded citations
                citations = grounding.grounded_citations
                  .filter((gc) => gc.verified)
                  .map((gc) => ({
                    slug: `legal/norms/${gc.code.toLowerCase()}/${gc.paragraph.replace(/[^0-9a-z]/gi, "")}`,
                    title: `${gc.paragraph} ${gc.code}`,
                  }));
                setCurrentCitations(citations);
                // Extract gaps from answer text (look for "Offene Fragen" / "Widersprüche" sections)
                const gapMatch = answerText.match(
                  /(?:Offene Fragen|Widersprüche|Lücken)[:\s]*\n([\s\S]*?)(?=\n###|\n##|$)/i
                );
                if (gapMatch) {
                  gaps = gapMatch[1]
                    .split("\n")
                    .map((l) => l.replace(/^[-*]\s*/, "").trim())
                    .filter((l) => l.length > 5);
                  setCurrentGaps(gaps);
                }
              } catch (groundErr) {
                console.error(
                  "[research] grounding failed:",
                  groundErr instanceof Error ? groundErr.message : String(groundErr)
                );
              }

              resolve();
            } else if (job.status === "failed" || job.status === "dead") {
              reject(new Error(job.error_text ?? t("research.error_failed")));
            } else {
              setTimeout(poll, POLL_INTERVAL);
            }
          } catch {
            setTimeout(poll, POLL_INTERVAL);
          }
        };
        setTimeout(poll, POLL_INTERVAL);
      });

      const session: ResearchSession = {
        id: crypto.randomUUID(),
        query,
        answer: answerText,
        citations,
        gaps,
        jurisdiction,
        createdAt: new Date().toISOString(),
      };
      setSessions((s) => [session, ...s]);
    } catch (err) {
      setResearchPhase("");
      setError(err instanceof Error ? err.message : t("research.error_failed"));
    } finally {
      setLoading(false);
    }
  }

  async function saveResearch() {
    if (!currentAnswer) return;
    try {
      const slug = `legal/research/${query
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)}-${Date.now()}`;
      const payload = {
        slug,
        title: `${t("research.title_prefix")}: ${query.slice(0, 80)}`,
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
      addToast({ type: "success", description: "Recherche gespeichert" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("research.error_save"));
      addToast({ type: "error", description: t("research.error_save") });
    }
  }

  async function syncJudgements() {
    setLoading(true);
    setError(null);
    try {
      await api.legal.judgementsSync({ jurisdiction: jurisdiction as "at" | "de" | "all", query });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("research.error_sync"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteResearch(slug: string) {
    const ok = await confirm({
      title: t("research.confirm_delete_title"),
      message: t("research.confirm_delete_msg"),
      confirmLabel: t("research.btn_delete"),
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
      addToast({ type: "success", description: "Recherche gelöscht" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("research.error_delete"));
      addToast({ type: "error", description: t("research.error_delete") });
    }
  }

  // Non-recherche tabs: render embedded page content
  if (activeTab === "rechtsprechung") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("research.title")}
          description={t("research.description")}
          breadcrumbs={[
            { label: t("nav.overview"), href: "/dashboard" },
            { label: t("research.title") },
          ]}
        />
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "brand-solid text-white"
                    : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                }`}
              >
                <Icon size={14} />
                {lang === "en" ? tab.labelEn : tab.labelDe}
              </button>
            );
          })}
        </div>
        <RechtsprechungTab />
      </div>
    );
  }

  if (activeTab === "normen") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("research.title")}
          description={t("research.description")}
          breadcrumbs={[
            { label: t("nav.overview"), href: "/dashboard" },
            { label: t("research.title") },
          ]}
        />
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "brand-solid text-white"
                    : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                }`}
              >
                <Icon size={14} />
                {lang === "en" ? tab.labelEn : tab.labelDe}
              </button>
            );
          })}
        </div>
        <NormsTab />
      </div>
    );
  }

  if (activeTab === "judgements-db") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("research.title")}
          description={t("research.description")}
          breadcrumbs={[
            { label: t("nav.overview"), href: "/dashboard" },
            { label: t("research.title") },
          ]}
        />
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "brand-solid text-white"
                    : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                }`}
              >
                <Icon size={14} />
                {lang === "en" ? tab.labelEn : tab.labelDe}
              </button>
            );
          })}
        </div>
        <JudgementsDbTab />
      </div>
    );
  }

  if (activeTab === "precedent-search") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("research.title")}
          description={t("research.description")}
          breadcrumbs={[
            { label: t("nav.overview"), href: "/dashboard" },
            { label: t("research.title") },
          ]}
        />
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "brand-solid text-white"
                    : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                }`}
              >
                <Icon size={14} />
                {lang === "en" ? tab.labelEn : tab.labelDe}
              </button>
            );
          })}
        </div>
        <PrecedentSearchTab />
      </div>
    );
  }

  if (activeTab === "commentaries") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("research.title")}
          description={t("research.description")}
          breadcrumbs={[
            { label: t("nav.overview"), href: "/dashboard" },
            { label: t("research.title") },
          ]}
        />
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "brand-solid text-white"
                    : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                }`}
              >
                <Icon size={14} />
                {lang === "en" ? tab.labelEn : tab.labelDe}
              </button>
            );
          })}
        </div>
        <CommentariesTab />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("research.title")}
        description={t("research.description")}
        breadcrumbs={[
          { label: t("nav.overview"), href: "/dashboard" },
          { label: t("research.title") },
        ]}
      />

      {/* Tab Bar — 5 Screens als eine Route */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "brand-solid text-white"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              }`}
            >
              <Icon size={14} />
              {lang === "en" ? tab.labelEn : tab.labelDe}
            </button>
          );
        })}
      </div>

      {/* Research Input */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="flex items-center gap-3">
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            aria-label="Rechtsordnung"
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="de">🇩🇪 Deutschland</option>
            <option value="at">🇦🇹 Österreich</option>
            <option value="ch">🇨🇭 Schweiz</option>
            <option value="eu">🇪🇺 EU-Recht</option>
          </select>
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runResearch()}
              placeholder="Rechtsfrage eingeben… (z.B. 'Wann ist eine AGB-Klausel nach § 307 BGB unwirksam?')"
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
          </div>
          <Button
            onClick={runResearch}
            disabled={loading || !query.trim()}
            className="brand-bg brand-bg gap-2 text-white"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? t("research.btn_searching") : t("research.btn_search")}
          </Button>
          <Button
            variant="secondary"
            onClick={syncJudgements}
            disabled={loading}
            className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          >
            <Landmark size={14} /> {t("research.btn_judgements_sync")}
          </Button>
        </div>
        {loading && researchPhase && (
          <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-4 py-3 text-sm text-[color:var(--ds-muted)]">
            <Loader2 size={13} className="shrink-0 animate-spin text-[color:var(--brand)]" />
            <span>{researchPhase}</span>
            {researchJobId && (
              <span className="ml-auto font-mono text-xs opacity-50">Job #{researchJobId}</span>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
            {error}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[color:var(--ds-border)]">
        <button
          onClick={() => setSubTab("new")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            subTab === "new"
              ? "brand-border brand-text"
              : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Search size={14} /> Neue Recherche
          </span>
        </button>
        <button
          onClick={() => setSubTab("saved")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            subTab === "saved"
              ? "brand-border brand-text"
              : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <FolderOpen size={14} /> Gespeicherte Recherchen{" "}
            {savedPages.length > 0 && (
              <span className="rounded bg-[color:var(--ds-border)] px-1.5 py-0.5 text-xs">
                {savedPages.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {subTab === "new" && (
        <div className="space-y-4">
          {/* Current Result */}
          {currentAnswer && (
            <div className="brand-border space-y-4 rounded-xl border bg-[color:var(--ds-surface)] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale size={16} className="brand-text" />
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("research.result_title")}
                  </h3>
                  <Badge
                    variant="default"
                    className="brand-border brand-soft brand-text border text-xs"
                  >
                    {jurisdiction.toUpperCase()}
                  </Badge>
                </div>
                <Button
                  onClick={saveResearch}
                  className="gap-2 bg-[color:var(--ds-success-solid)] text-xs text-white hover:bg-[color:var(--ds-success-solid)]"
                >
                  <Save size={14} /> {t("research.btn_save_brain")}
                </Button>
              </div>
              <div
                className="prose prose-invert prose-sm max-w-none leading-relaxed text-[color:var(--ds-text-muted)]"
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
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                <Clock size={16} className="brand-text" />
                {t("research.session_history")}
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                        {s.query}
                      </span>
                      <Badge
                        variant="default"
                        className="brand-border brand-soft brand-text border text-xs"
                      >
                        {s.jurisdiction.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                      {s.answer.slice(0, 150)}…
                    </div>
                    <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                      <span>
                        {new Date(s.createdAt).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
                      </span>
                      {s.citations.length > 0 && <span>{s.citations.length} Quellen</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === "saved" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search
                size={14}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
              />
              <label htmlFor="saved-research-search" className="sr-only">
                {t("research.placeholder_search").replace("…", "")}
              </label>
              <input
                id="saved-research-search"
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder={t("research.placeholder_search")}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "at", "de", "ch", "eu"] as const).map((j) => (
                <button
                  key={j}
                  onClick={() => setSavedJurisdiction(j)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    savedJurisdiction === j
                      ? "brand-soft brand-border brand-text"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                  }`}
                >
                  {j === "all"
                    ? "Alle"
                    : j === "at"
                      ? "🇦🇹 AT"
                      : j === "de"
                        ? "🇩🇪 DE"
                        : j === "ch"
                          ? "🇨🇭 CH"
                          : "🇪🇺 EU"}
                </button>
              ))}
            </div>
          </div>

          {savedLoading ? (
            <div className="py-8 text-center text-[color:var(--ds-text-muted)]">
              {t("research.saved_loading")}
            </div>
          ) : savedPages.length === 0 ? (
            <div className="space-y-3 py-16 text-center">
              <FolderOpen size={40} className="mx-auto text-[color:var(--ds-border)]" />
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {t("research.saved_empty_title")}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("research.saved_empty_desc")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                let filtered = savedPages;
                if (savedJurisdiction !== "all") {
                  filtered = filtered.filter(
                    (p) => (p.frontmatter?.jurisdiction as string) === savedJurisdiction
                  );
                }
                if (savedSearch.trim()) {
                  const q = savedSearch.toLowerCase();
                  filtered = filtered.filter(
                    (p) =>
                      p.title.toLowerCase().includes(q) ||
                      ((p.frontmatter?.query as string) || "").toLowerCase().includes(q) ||
                      (p.content || "").toLowerCase().includes(q)
                  );
                }
                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-sm text-[color:var(--ds-text-muted)]">
                      {t("research.saved_no_match")}
                    </div>
                  );
                }
                return filtered.map((page) => {
                  const fm = page.frontmatter ?? {};
                  const j = (fm.jurisdiction as string) || "";
                  const q = (fm.query as string) || "";
                  const isExpanded = expandedSlug === page.slug;
                  return (
                    <div
                      key={page.slug}
                      className="group space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                              {page.title}
                            </span>
                            {j && (
                              <Badge
                                variant="default"
                                className={`border text-xs ${
                                  j === "at"
                                    ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                                    : j === "ch"
                                      ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                                      : j === "eu"
                                        ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                                        : "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                                }`}
                              >
                                {j.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          {q && (
                            <p className="mt-1 truncate text-xs text-[color:var(--ds-text-muted)]">
                              {q}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => setExpandedSlug(isExpanded ? null : page.slug)}
                            className="hover:brand-text brand-bg/10 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                            title={isExpanded ? "Zuklappen" : "Aufklappen"}
                            aria-label={isExpanded ? "Zuklappen" : "Aufklappen"}
                          >
                            {isExpanded ? <X size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <button
                            onClick={() => deleteResearch(page.slug)}
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] opacity-0 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:opacity-100 hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
                            title={t("research.btn_delete")}
                            aria-label={t("research.btn_delete")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {isExpanded ? (
                        <div
                          className="prose prose-invert prose-sm max-w-none leading-relaxed text-[color:var(--ds-text-muted)]"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content || "") }}
                        />
                      ) : (
                        <div className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                          {page.content?.slice(0, 200)}…
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
                          {new Date(
                            ((page as unknown as Record<string, unknown>).createdAt as string) ||
                              ((page as unknown as Record<string, unknown>).created_at as string) ||
                              page.created_at ||
                              new Date().toISOString()
                          ).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                        </span>
                        <div className="flex items-center gap-2">
                          {Array.isArray(fm.citations) && fm.citations.length > 0 && (
                            <span>{fm.citations.length} Quellen</span>
                          )}
                          {Array.isArray(fm.gaps) && fm.gaps.length > 0 && (
                            <span className="text-[color:var(--ds-warning-text)]">{fm.gaps.length} Lücken</span>
                          )}
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

export default function ResearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-sm text-[color:var(--ds-text-muted)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <ResearchPageInner />
    </Suspense>
  );
}
