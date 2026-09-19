"use client";

import { useEffect, useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { linkCitationsInHtml } from "@/lib/citation-gate-client";
import type { BrainPage } from "@/lib/types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { CitationPanel } from "@/components/legal/CitationPanel";

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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { formatDate, formatDateTime } from "@/lib/utils";

function TabSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-10 w-full rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Research failures in plain language — never the job's raw error text. */
const RESEARCH_UNAVAILABLE =
  "Die Recherche ist gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut.";

const RechtsprechungTab = dynamic(() => import("@/components/research/rechtsprechung-tab"), {
  loading: () => <TabSkeleton />,
});
const NormsTab = dynamic(() => import("@/components/research/norms-tab"), {
  loading: () => <TabSkeleton />,
});
const JudgementsDbTab = dynamic(() => import("@/components/research/judgements-db-tab"), {
  loading: () => <TabSkeleton />,
});
const PrecedentSearchTab = dynamic(() => import("@/components/research/precedent-search-tab"), {
  loading: () => <TabSkeleton />,
});
const CommentariesTab = dynamic(() => import("@/components/research/commentaries-tab"), {
  loading: () => <TabSkeleton />,
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
  { id: "judgements-db", icon: Scale, labelDe: "Urteilsdatenbank", labelEn: "Judgements DB" },
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
  // Austria-only pilot: Austrian law is the default, EU law stays selectable.
  const [jurisdiction, setJurisdiction] = useState("at");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentCitations, setCurrentCitations] = useState<Array<{ slug: string; title: string }>>(
    []
  );
  const [currentGaps, setCurrentGaps] = useState<string[]>([]);
  // Every AI text surface verifies its statute citations (CLAUDE.md invariant).
  const {
    grounding: currentGrounding,
    groundAnswer,
    reset: resetGrounding,
  } = useGroundedAnswer();
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
  const [researchPhase, setResearchPhase] = useState<string>("");
  const [savedJurisdiction, setSavedJurisdiction] = useState<"all" | "at" | "de" | "ch" | "eu">(
    "all"
  );
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachCase, setAttachCase] = useState("");
  const [attachSaving, setAttachSaving] = useState(false);

  const { data: cases = [] } = useQuery({
    queryKey: ["research-cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
  });

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
          "Das Kanzleiwissen ist gerade nicht erreichbar. Es werden zwischengespeicherte Recherchen angezeigt."
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
    resetGrounding();
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

            if (job.status === "completed") {
              // Extract answer from result
              const raw = job.result?.answer ?? job.result?.output ?? job.result?.text ?? "";
              answerText = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
              setCurrentAnswer(answerText);
              setResearchPhase("");

              // Extract citations and grounding from the answer text
              const grounding = await groundAnswer(answerText);
              if (grounding) {
                // Extract structured citations from grounded citations
                citations = grounding.grounded_citations
                  .filter((gc) => gc.verified)
                  .map((gc) => ({
                    slug: `legal/norms/${gc.code.toLowerCase()}/${gc.paragraph.replace(/[^0-9a-z]/gi, "")}`,
                    title: `${gc.paragraph} ${gc.code}`,
                  }));
                setCurrentCitations(citations);
              }
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

              resolve();
            } else if (job.status === "failed" || job.status === "dead") {
              reject(new Error(RESEARCH_UNAVAILABLE));
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
      // Only our own timeout message is shown verbatim; anything else is a raw
      // HTTP/engine text and gets the plain-language fallback.
      setError(
        err instanceof Error && err.message === t("research.error_timeout")
          ? err.message
          : RESEARCH_UNAVAILABLE
      );
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
    } catch {
      addToast({ type: "error", description: t("research.error_save") });
    }
  }

  async function attachToCase() {
    if (!currentAnswer || !attachCase) return;
    setAttachSaving(true);
    try {
      const slug = `cases/${attachCase}/research/${Date.now()}`;
      const payload = {
        slug,
        title: `${t("research.title_prefix")}: ${query.slice(0, 80)}`,
        type: "legal_note",
        content: currentAnswer,
        frontmatter: {
          case_slug: attachCase,
          query,
          jurisdiction,
          citations: currentCitations.map((c) => c.title),
          gaps: currentGaps,
          research_date: new Date().toISOString(),
          source: "research",
        },
      };
      if (isOnline()) {
        await api.brain.createPage(payload);
      } else {
        await enqueueMutation({ type: "createPage", payload });
      }
      addToast({ type: "success", description: "Recherche an Akte angehängt" });
      setAttachOpen(false);
      setAttachCase("");
    } catch {
      addToast({
        type: "error",
        description: "Die Recherche konnte nicht an die Akte angehängt werden.",
      });
    } finally {
      setAttachSaving(false);
    }
  }

  async function syncJudgements() {
    setLoading(true);
    setError(null);
    try {
      await api.legal.judgementsSync({ jurisdiction: jurisdiction as "at" | "de" | "all", query });
      setError(null);
    } catch {
      setError(t("research.error_sync"));
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
    } catch {
      addToast({ type: "error", description: t("research.error_delete") });
    }
  }

  const header = (
    <PageHeader
      title={t("research.title")}
      description={t("research.description")}
      breadcrumbs={[{ label: t("nav.overview"), href: "/dashboard" }, { label: t("research.title") }]}
    />
  );

  const tabBar = (
    <div
      role="tablist"
      aria-label={t("research.title")}
      className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-[background-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none ${
              isActive
                ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)] shadow-sm"
                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {lang === "en" ? tab.labelEn : tab.labelDe}
          </button>
        );
      })}
    </div>
  );

  // Non-recherche tabs: render embedded page content under the same header.
  const embeddedTab =
    activeTab === "rechtsprechung" ? (
      <RechtsprechungTab />
    ) : activeTab === "normen" ? (
      <NormsTab />
    ) : activeTab === "judgements-db" ? (
      <JudgementsDbTab />
    ) : activeTab === "precedent-search" ? (
      <PrecedentSearchTab />
    ) : activeTab === "commentaries" ? (
      <CommentariesTab />
    ) : null;

  if (embeddedTab) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        {header}
        {tabBar}
        {embeddedTab}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      {header}
      {tabBar}

      {/* Research Input */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            aria-label="Rechtsordnung"
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          >
            <option value="at">Österreich</option>
            <option value="eu">EU-Recht</option>
          </select>
          <div className="relative min-w-[12rem] flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
            />
            <input
              value={query}
              aria-label={t("research.ph_query")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runResearch()}
              placeholder={t("research.ph_query")}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
          </div>
          <Button
            onClick={runResearch}
            disabled={loading || !query.trim()}
            className="gap-2 whitespace-nowrap"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? t("research.btn_searching") : t("research.btn_search")}
          </Button>
          <Button
            variant="secondary"
            onClick={syncJudgements}
            disabled={loading}
            className="gap-2 whitespace-nowrap"
          >
            <Landmark size={14} /> {t("research.btn_judgements_sync")}
          </Button>
        </div>
        {loading && researchPhase && (
          <div
            className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-4 py-3 text-sm text-[color:var(--ds-text-muted)]"
            role="status"
            aria-live="polite"
          >
            <Loader2 size={13} className="shrink-0 animate-spin text-[color:var(--brand-primary)]" />
            <span>{researchPhase}</span>
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
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none ${
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
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none ${
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
            <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale size={16} className="text-[color:var(--ds-text-muted)]" />
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("research.result_title")}
                  </h2>
                  <Badge variant="default" className="text-xs">
                    {jurisdiction.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setAttachOpen(true)}
                    variant="secondary"
                    size="sm"
                    className="gap-2 whitespace-nowrap"
                  >
                    <FolderOpen size={14} /> An Akte anhängen
                  </Button>
                  <Button
                    onClick={saveResearch}
                    variant="secondary"
                    size="sm"
                    className="gap-2 whitespace-nowrap"
                  >
                    <Save size={14} /> {t("research.btn_save_brain")}
                  </Button>
                </div>
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-[color:var(--ds-text-muted)]"
                dangerouslySetInnerHTML={{
                  __html: linkCitationsInHtml(
                    renderMarkdown(currentAnswer),
                    currentGrounding?.grounded_citations ?? []
                  ),
                }}
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

          {/* Attach to Case Dialog */}
          <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Recherche an Akte anhängen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Akte auswählen</Label>
                  <Select value={attachCase} onValueChange={setAttachCase}>
                    <SelectTrigger>
                      <SelectValue placeholder="Akte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {cases.map((c: { slug: string; title: string }) => (
                        <SelectItem key={c.slug} value={c.slug}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAttachOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={attachToCase} disabled={attachSaving || !attachCase}>
                  {attachSaving ? "Wird gespeichert…" : "Anhängen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                        className="text-xs"
                      >
                        {s.jurisdiction.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                      {s.answer.slice(0, 150)}
                      {s.answer.length > 150 ? "…" : ""}
                    </div>
                    <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                      <span>
                        {formatDateTime(s.createdAt)}
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "at", "eu"] as const).map((j) => (
                <button
                  key={j}
                  onClick={() => setSavedJurisdiction(j)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.95] motion-reduce:transition-none ${
                    savedJurisdiction === j
                      ? "brand-soft brand-border brand-text"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                  }`}
                >
                  {j === "all" ? "Alle" : j === "at" ? "Österreich" : "EU-Recht"}
                </button>
              ))}
            </div>
          </div>

          {savedLoading ? (
            <TabSkeleton />
          ) : savedPages.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={t("research.saved_empty_title")}
              description={t("research.saved_empty_desc")}
              actionLabel="Neue Recherche"
              onAction={() => setSubTab("new")}
            />
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
                              <Badge variant="default" className="text-xs">
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
                            className="rounded-lg p-1.5 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.9] motion-reduce:transition-none"
                            title={isExpanded ? "Zuklappen" : "Aufklappen"}
                            aria-label={isExpanded ? "Zuklappen" : "Aufklappen"}
                          >
                            {isExpanded ? <X size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <button
                            onClick={() => deleteResearch(page.slug)}
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-danger-border)] focus-visible:outline-none active:scale-[0.9] motion-reduce:transition-none"
                            title={t("research.btn_delete")}
                            aria-label={t("research.btn_delete")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {isExpanded ? (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-[color:var(--ds-text-muted)]"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content || "") }}
                        />
                      ) : (
                        <div className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                          {page.content?.slice(0, 200)}
                          {(page.content?.length ?? 0) > 200 ? "…" : ""}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
                          {formatDate(
                            ((page as unknown as Record<string, unknown>).createdAt as string) ||
                              page.created_at
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          {Array.isArray(fm.citations) && fm.citations.length > 0 && (
                            <span>{fm.citations.length} Quellen</span>
                          )}
                          {Array.isArray(fm.gaps) && fm.gaps.length > 0 && (
                            <span className="text-[color:var(--ds-warning-text)]">
                              {fm.gaps.length} Lücken
                            </span>
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
        <div className="mx-auto max-w-[1200px] p-4 md:p-6 lg:p-8">
          <TabSkeleton />
        </div>
      }
    >
      <ResearchPageInner />
    </Suspense>
  );
}
