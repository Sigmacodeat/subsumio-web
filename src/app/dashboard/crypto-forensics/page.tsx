"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Radar,
  Plus,
  Search,
  Trash2,
  ChevronRight,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Bitcoin,
  TrendingUp,
  Clock,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  RCIID_STATUS_ORDER,
  RCIID_STATUS_LABELS_DE,
  RCIID_STATUS_LABELS_EN,
  RCIID_STATUS_COLORS,
  getRciidStatusProgress,
  isRciidCaseActive,
  isRciidCaseDone,
  type RciidCaseStatus,
  type BlockchainType,
} from "@/lib/rciid";
import { BLOCKCHAIN_LABELS, BLOCKCHAIN_COLORS } from "@/lib/crypto-wallet-detector";

interface RciidCaseRow {
  case_id: string;
  status: RciidCaseStatus;
  progress_percent: number;
  current_phase: string;
  estimated_completion_days?: number;
  pricing?: { amount: number; currency: string; type: "flat" | "hourly" };
  timeline?: Array<{ phase: string; timestamp: string; description: string }>;
  updated_at?: string;
}

interface DetectedWallet {
  address: string;
  blockchain: BlockchainType;
  confidence: number;
  context?: string;
  isKnownFraud: boolean;
}

const STATUS_ICONS: Record<RciidCaseStatus, React.ReactNode> = {
  none: <Clock size={14} />,
  submitted: <RefreshCw size={14} />,
  received: <CheckCircle2 size={14} />,
  investigating: <Search size={14} />,
  tracing: <Radar size={14} />,
  analyzing: <TrendingUp size={14} />,
  reporting: <FileText size={14} />,
  completed: <CheckCircle2 size={14} />,
  rejected: <XCircle size={14} />,
};

export default function CryptoForensicsPage() {
  const { t, lang } = useLang();

  const [cases, setCases] = useState<RciidCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RciidCaseStatus | "all" | "active">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showDetect, setShowDetect] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Submit form state
  const [caseSlug, setCaseSlug] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [clientRef, setClientRef] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("high");
  const [wallets, setWallets] = useState<
    Array<{ address: string; blockchain: BlockchainType; label: string }>
  >([]);
  const [newWalletAddress, setNewWalletAddress] = useState("");
  const [newWalletBlockchain, setNewWalletBlockchain] = useState<BlockchainType>("BTC");
  const [newWalletLabel, setNewWalletLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Detect form state
  const [detectText, setDetectText] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.rciid.listCases({ limit: 100 });
      setCases(res.cases as RciidCaseRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "RCIID Cases konnten nicht geladen werden.");
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (statusFilter === "active" && !isRciidCaseActive(c.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "active" && c.status !== statusFilter)
        return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.case_id.toLowerCase().includes(q) && !c.current_phase.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [cases, search, statusFilter]);

  const stats = useMemo(() => {
    const active = cases.filter((c) => isRciidCaseActive(c.status)).length;
    const completed = cases.filter((c) => c.status === "completed").length;
    const totalCost = cases.reduce((sum, c) => sum + (c.pricing?.amount ?? 0), 0);
    return { total: cases.length, active, completed, totalCost };
  }, [cases]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadCases();
    setRefreshing(false);
    showToast("Status aktualisiert");
  }

  function addWallet() {
    if (!newWalletAddress.trim()) return;
    setWallets([
      ...wallets,
      {
        address: newWalletAddress.trim(),
        blockchain: newWalletBlockchain,
        label: newWalletLabel.trim(),
      },
    ]);
    setNewWalletAddress("");
    setNewWalletLabel("");
  }

  function removeWallet(idx: number) {
    setWallets(wallets.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!caseSlug.trim() || wallets.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.rciid.submit({
        caseSlug: caseSlug.trim(),
        caseTitle: caseTitle.trim() || undefined,
        clientReference: clientRef.trim() || undefined,
        description: description.trim() || undefined,
        priority,
        wallets: wallets.map((w) => ({
          address: w.address,
          blockchain: w.blockchain,
          label: w.label || undefined,
        })),
      });
      showToast(`Fall an RCIID übermittelt — Case ID: ${res.caseId}`);
      setShowSubmit(false);
      setCaseSlug("");
      setCaseTitle("");
      setClientRef("");
      setDescription("");
      setWallets([]);
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Übermittlung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDetect() {
    if (!detectText.trim()) return;
    setDetecting(true);
    setError(null);
    try {
      const res = await api.rciid.detectWallets({ text: detectText });
      setDetectedWallets(res.wallets as DetectedWallet[]);
      if (res.count > 0) {
        showToast(`${res.count} Wallet(s) erkannt!`);
      } else {
        showToast("Keine Wallet-Adressen gefunden.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection fehlgeschlagen.");
    } finally {
      setDetecting(false);
    }
  }

  function addDetectedToSubmit(w: DetectedWallet) {
    const exists = wallets.find((x) => x.address === w.address);
    if (exists) return;
    setWallets([
      ...wallets,
      { address: w.address, blockchain: w.blockchain, label: w.isKnownFraud ? "Known Fraud" : "" },
    ]);
  }

  const statusLabel = (s: RciidCaseStatus) =>
    lang === "en" ? RCIID_STATUS_LABELS_EN[s] : RCIID_STATUS_LABELS_DE[s];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("crypto_forensics.title" as DashboardKey)}
        description={t("crypto_forensics.description" as DashboardKey)}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("crypto_forensics.breadcrumb" as DashboardKey) },
        ]}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {t("crypto_forensics.refresh" as DashboardKey)}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDetect(true)}>
              <Search size={14} />
              {t("crypto_forensics.detect_wallets" as DashboardKey)}
            </Button>
            <Button size="sm" onClick={() => setShowSubmit(true)}>
              <Plus size={14} />
              {t("crypto_forensics.new_case" as DashboardKey)}
            </Button>
          </>
        }
      />

      {/* Toast */}
      {toast && (
        <div className="brand-border brand-soft/5 brand-text flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          {toast}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label={t("crypto_forensics.stat_total" as DashboardKey)}
          value={stats.total}
          icon={<Radar size={18} />}
        />
        <StatCard
          label={t("crypto_forensics.stat_active" as DashboardKey)}
          value={stats.active}
          icon={<Clock size={18} />}
          color="text-amber-600"
        />
        <StatCard
          label={t("crypto_forensics.stat_completed" as DashboardKey)}
          value={stats.completed}
          icon={<CheckCircle2 size={18} />}
          color="text-emerald-600"
        />
        <StatCard
          label={t("crypto_forensics.stat_total_cost" as DashboardKey)}
          value={`${stats.totalCost.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`}
          icon={<TrendingUp size={18} />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("crypto_forensics.search_placeholder" as DashboardKey)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "completed", "rejected"] as const).map((f) => (
            <Button
              key={f}
              variant={statusFilter === f ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter(f)}
            >
              {t(`crypto_forensics.filter_${f}` as DashboardKey)}
            </Button>
          ))}
        </div>
      </div>

      {/* Cases Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20" role="status">
          <Loader2 size={24} className="brand-text animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center">
          <Radar className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p className="text-[color:var(--ds-text-muted)]">
            {t("crypto_forensics.empty" as DashboardKey)}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const progress = c.progress_percent ?? getRciidStatusProgress(c.status);
            const color = RCIID_STATUS_COLORS[c.status];
            return (
              <div
                key={c.case_id}
                className="flex items-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)]"
                  style={{ color }}
                >
                  {STATUS_ICONS[c.status]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[color:var(--ds-text)]">{c.case_id}</span>
                    <Badge
                      variant="default"
                      className="text-xs"
                      style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
                    >
                      {statusLabel(c.status)}
                    </Badge>
                    {c.pricing && (
                      <Badge
                        variant="default"
                        className="text-xs text-[color:var(--ds-text-muted)]"
                      >
                        {c.pricing.amount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")}{" "}
                        {c.pricing.currency}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                    <span>{c.current_phase}</span>
                    {c.estimated_completion_days && isRciidCaseActive(c.status) && (
                      <span>~{c.estimated_completion_days} Tage</span>
                    )}
                    {c.updated_at && (
                      <span>
                        {new Date(c.updated_at).toLocaleDateString(
                          lang === "en" ? "en-GB" : "de-DE"
                        )}
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ds-hover)]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isRciidCaseDone(c.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await api.rciid.getReport(c.case_id, "json");
                          showToast("Bericht heruntergeladen");
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : "Bericht-Download fehlgeschlagen."
                          );
                        }
                      }}
                      className="gap-1.5 text-xs"
                    >
                      <Download size={12} />
                      {t("crypto_forensics.report" as DashboardKey)}
                    </Button>
                  )}
                  <a
                    href={`https://rciid.at/cases/${c.case_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Dialog */}
      <Dialog open={showSubmit} onOpenChange={setShowSubmit}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("crypto_forensics.submit_title" as DashboardKey)}</DialogTitle>
            <DialogDescription>
              {t("crypto_forensics.submit_description" as DashboardKey)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("crypto_forensics.case_slug" as DashboardKey)} *
                </label>
                <Input
                  value={caseSlug}
                  onChange={(e) => setCaseSlug(e.target.value)}
                  placeholder="case-2026-001"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("crypto_forensics.case_title" as DashboardKey)}
                </label>
                <Input
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  placeholder="Mustermann vs. Betrüger"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("crypto_forensics.client_ref" as DashboardKey)}
                </label>
                <Input
                  value={clientRef}
                  onChange={(e) => setClientRef(e.target.value)}
                  placeholder="Mandant Mustermann"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("crypto_forensics.priority" as DashboardKey)}
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("crypto_forensics.description" as DashboardKey)}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Verdacht auf Krypto-Betrug via Phishing..."
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                rows={3}
              />
            </div>

            {/* Wallets */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("crypto_forensics.wallets" as DashboardKey)} *
              </label>
              {wallets.length > 0 && (
                <div className="space-y-1">
                  {wallets.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                    >
                      <Badge
                        variant="default"
                        className="text-xs"
                        style={{
                          backgroundColor: `${BLOCKCHAIN_COLORS[w.blockchain]}20`,
                          color: BLOCKCHAIN_COLORS[w.blockchain],
                        }}
                      >
                        {BLOCKCHAIN_LABELS[w.blockchain]}
                      </Badge>
                      <span className="flex-1 truncate font-mono text-xs text-[color:var(--ds-text)]">
                        {w.address}
                      </span>
                      {w.label && (
                        <span className="text-xs text-[color:var(--ds-text-muted)]">{w.label}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWallet(i)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={newWalletBlockchain}
                  onChange={(e) => setNewWalletBlockchain(e.target.value as BlockchainType)}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-sm"
                >
                  {Object.entries(BLOCKCHAIN_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <Input
                  value={newWalletAddress}
                  onChange={(e) => setNewWalletAddress(e.target.value)}
                  placeholder="bc1q... oder 0x..."
                  className="flex-1 font-mono text-xs"
                />
                <Input
                  value={newWalletLabel}
                  onChange={(e) => setNewWalletLabel(e.target.value)}
                  placeholder="Label"
                  className="w-32"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addWallet}
                  disabled={!newWalletAddress.trim()}
                >
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSubmit(false)}>
              {t("crypto_forensics.cancel" as DashboardKey)}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !caseSlug.trim() || wallets.length === 0}
            >
              {submitting ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Radar size={14} className="mr-2" />
              )}
              {t("crypto_forensics.submit_to_rciid" as DashboardKey)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detect Dialog */}
      <Dialog open={showDetect} onOpenChange={setShowDetect}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("crypto_forensics.detect_title" as DashboardKey)}</DialogTitle>
            <DialogDescription>
              {t("crypto_forensics.detect_description" as DashboardKey)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("crypto_forensics.detect_text_label" as DashboardKey)}
              </label>
              <textarea
                value={detectText}
                onChange={(e) => setDetectText(e.target.value)}
                placeholder="Fügen Sie hier den Text aus Fall-Dokumenten ein..."
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 font-mono text-sm"
                rows={8}
              />
            </div>

            {detectedWallets.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {detectedWallets.length} {t("crypto_forensics.wallets_found" as DashboardKey)}
                </label>
                {detectedWallets.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                  >
                    <Badge
                      variant="default"
                      className="text-xs"
                      style={{
                        backgroundColor: `${BLOCKCHAIN_COLORS[w.blockchain as BlockchainType]}20`,
                        color: BLOCKCHAIN_COLORS[w.blockchain as BlockchainType],
                      }}
                    >
                      {BLOCKCHAIN_LABELS[w.blockchain as BlockchainType] ?? w.blockchain}
                    </Badge>
                    <span className="flex-1 truncate font-mono text-xs text-[color:var(--ds-text)]">
                      {w.address}
                    </span>
                    {w.isKnownFraud && (
                      <Badge
                        variant="default"
                        className="border-red-500/30 bg-red-500/10 text-xs text-red-600"
                      >
                        <AlertCircle size={10} className="mr-1" />
                        Known Fraud
                      </Badge>
                    )}
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      {Math.round(w.confidence * 100)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addDetectedToSubmit(w)}
                      className="h-6 px-2"
                    >
                      <Plus size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDetect(false)}>
              {t("crypto_forensics.close" as DashboardKey)}
            </Button>
            <Button onClick={handleDetect} disabled={detecting || !detectText.trim()}>
              {detecting ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Search size={14} className="mr-2" />
              )}
              {t("crypto_forensics.scan" as DashboardKey)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = "text-[color:var(--ds-text)]",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[color:var(--ds-text-muted)]">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-[color:var(--ds-text)]">{value}</p>
    </div>
  );
}
