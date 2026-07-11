"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
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
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Clock,
  TrendingUp,
  FileText,
} from "lucide-react";
import {
  RCIID_STATUS_LABELS_DE,
  RCIID_STATUS_LABELS_EN,
  RCIID_STATUS_COLORS,
  getRciidStatusProgress,
  isRciidCaseActive,
  isRciidCaseDone,
  type RciidCaseStatus,
  type BlockchainType,
} from "@/lib/rciid-client";
import { BLOCKCHAIN_LABELS, BLOCKCHAIN_COLORS } from "@/lib/crypto-wallet-detector";

interface CryptoForensicsPanelProps {
  caseSlug: string;
  caseTitle?: string;
  clientName?: string;
  initialData?: {
    rciid_case_id?: string;
    status?: RciidCaseStatus;
    wallets?: Array<{
      address: string;
      blockchain: string;
      label?: string;
      detected_at?: string;
      detected_by?: "ai" | "manual";
    }>;
    progress_percent?: number;
    current_phase?: string;
  };
}

interface DetectedWallet {
  address: string;
  blockchain: BlockchainType;
  confidence: number;
  context?: string;
  isKnownFraud: boolean;
}

export function CryptoForensicsPanel({
  caseSlug,
  caseTitle,
  clientName,
  initialData,
}: CryptoForensicsPanelProps) {
  const { t, lang } = useLang();

  const [rciidCaseId, setRciidCaseId] = useState(initialData?.rciid_case_id ?? "");
  const [status, setStatus] = useState<RciidCaseStatus>(initialData?.status ?? "none");
  const [progress, setProgress] = useState(initialData?.progress_percent ?? 0);
  const [currentPhase, setCurrentPhase] = useState(initialData?.current_phase ?? "");
  const [wallets, setWallets] = useState(initialData?.wallets ?? []);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showDetect, setShowDetect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Submit form
  const [newWalletAddress, setNewWalletAddress] = useState("");
  const [newWalletBlockchain, setNewWalletBlockchain] = useState<BlockchainType>("BTC");
  const [newWalletLabel, setNewWalletLabel] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("high");

  // Detect
  const [detectText, setDetectText] = useState("");
  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Auto-poll status when case is active
  useEffect(() => {
    if (!rciidCaseId || !isRciidCaseActive(status)) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.rciid.getStatus(rciidCaseId);
        setStatus(res.status as RciidCaseStatus);
        setProgress(res.progressPercent);
        setCurrentPhase(res.currentPhase);
      } catch {
        // Silent fail on poll
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [rciidCaseId, status]);

  async function handleRefresh() {
    if (!rciidCaseId) return;
    setRefreshing(true);
    try {
      const res = await api.rciid.getStatus(rciidCaseId);
      setStatus(res.status as RciidCaseStatus);
      setProgress(res.progressPercent);
      setCurrentPhase(res.currentPhase);
      showToast("Status aktualisiert");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status-Abfrage fehlgeschlagen.");
    } finally {
      setRefreshing(false);
    }
  }

  function addWallet() {
    if (!newWalletAddress.trim()) return;
    setWallets([
      ...wallets,
      {
        address: newWalletAddress.trim(),
        blockchain: newWalletBlockchain,
        label: newWalletLabel.trim(),
        detected_at: new Date().toISOString(),
        detected_by: "manual",
      },
    ]);
    setNewWalletAddress("");
    setNewWalletLabel("");
  }

  function removeWallet(idx: number) {
    setWallets(wallets.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (wallets.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.rciid.submit({
        caseSlug,
        caseTitle,
        clientReference: clientName,
        description: description.trim() || undefined,
        priority,
        wallets: wallets.map((w) => ({
          address: w.address,
          blockchain: w.blockchain as BlockchainType,
          label: w.label || undefined,
        })),
      });
      setRciidCaseId(res.caseId);
      setStatus(res.status as RciidCaseStatus);
      setShowSubmit(false);
      showToast(`An RCIID übermittelt — Case ID: ${res.caseId}`);
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
      {
        address: w.address,
        blockchain: w.blockchain,
        label: w.isKnownFraud ? "Known Fraud" : "",
        detected_at: new Date().toISOString(),
        detected_by: "ai",
      },
    ]);
  }

  const statusLabel = (s: RciidCaseStatus) =>
    lang === "en" ? RCIID_STATUS_LABELS_EN[s] : RCIID_STATUS_LABELS_DE[s];
  const color = RCIID_STATUS_COLORS[status];
  const progressVal = progress || getRciidStatusProgress(status);

  return (
    <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar size={16} className="brand-text" />
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("crypto_forensics.title" as DashboardKey)}
          </h3>
        </div>
        <div className="flex gap-2">
          {rciidCaseId && (
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowDetect(true)}>
            <Search size={12} className="mr-1" />
            {t("crypto_forensics.detect_wallets" as DashboardKey)}
          </Button>
          {!rciidCaseId && (
            <Button size="sm" onClick={() => setShowSubmit(true)}>
              <Plus size={12} className="mr-1" />
              {t("crypto_forensics.new_case" as DashboardKey)}
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]">
          <AlertCircle size={12} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-3 py-2 text-xs text-[color:var(--ds-success-text)]">
          <CheckCircle2 size={12} className="shrink-0" />
          {toast}
        </div>
      )}

      {/* Status Display */}
      {rciidCaseId && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="default"
              className="text-xs"
              style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
            >
              {statusLabel(status)}
            </Badge>
            <span className="text-xs text-[color:var(--ds-text-muted)]">{rciidCaseId}</span>
            {isRciidCaseActive(status) && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                <Clock size={10} />
                {currentPhase}
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ds-hover)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressVal}%`, backgroundColor: color }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
            <span>{progressVal}%</span>
            {isRciidCaseDone(status) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={async () => {
                  try {
                    await api.rciid.getReport(rciidCaseId, "json");
                    showToast("Bericht heruntergeladen");
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Bericht-Download fehlgeschlagen."
                    );
                  }
                }}
              >
                <Download size={10} className="mr-1" />
                {t("crypto_forensics.report" as DashboardKey)}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Wallets List */}
      {wallets.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
            {t("crypto_forensics.wallets" as DashboardKey)} ({wallets.length})
          </label>
          {wallets.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2"
            >
              <Badge
                variant="default"
                className="text-xs"
                style={{
                  backgroundColor: `${BLOCKCHAIN_COLORS[w.blockchain as BlockchainType] ?? "var(--graph-fallback)"}20`,
                  color:
                    BLOCKCHAIN_COLORS[w.blockchain as BlockchainType] ?? "var(--graph-fallback)",
                }}
              >
                {BLOCKCHAIN_LABELS[w.blockchain as BlockchainType] ?? w.blockchain}
              </Badge>
              <span className="flex-1 truncate font-mono text-xs text-[color:var(--ds-text)]">
                {w.address}
              </span>
              {w.label && (
                <span className="text-xs text-[color:var(--ds-text-muted)]">{w.label}</span>
              )}
              {w.detected_by === "ai" && (
                <Badge variant="default" className="text-xs text-[color:var(--ds-text-muted)]">
                  AI
                </Badge>
              )}
              {!rciidCaseId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeWallet(i)}
                  className="h-6 w-6 p-0"
                >
                  <Trash2 size={10} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!rciidCaseId && wallets.length === 0 && (
        <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] p-6 text-center">
          <Radar className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Keine Krypto-Wallets erfasst. Wallets erkennen oder manuell hinzufügen.
          </p>
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
                placeholder="Verdacht auf Krypto-Betrug..."
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                rows={3}
              />
            </div>

            {/* Existing wallets */}
            {wallets.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("crypto_forensics.wallets" as DashboardKey)} ({wallets.length})
                </label>
                {wallets.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2"
                  >
                    <Badge variant="default" className="text-xs">
                      {BLOCKCHAIN_LABELS[w.blockchain as BlockchainType] ?? w.blockchain}
                    </Badge>
                    <span className="flex-1 truncate font-mono text-xs">{w.address}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeWallet(i)}
                      className="h-6 w-6 p-0"
                    >
                      <Trash2 size={10} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add wallet */}
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

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSubmit(false)}>
              {t("crypto_forensics.cancel" as DashboardKey)}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || wallets.length === 0}>
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
                placeholder="Dokumenttext hier einfügen..."
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
                    className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2"
                  >
                    <Badge
                      variant="default"
                      className="text-xs"
                      style={{
                        backgroundColor: `${BLOCKCHAIN_COLORS[w.blockchain as BlockchainType] ?? "var(--graph-fallback)"}20`,
                        color:
                          BLOCKCHAIN_COLORS[w.blockchain as BlockchainType] ??
                          "var(--graph-fallback)",
                      }}
                    >
                      {BLOCKCHAIN_LABELS[w.blockchain as BlockchainType] ?? w.blockchain}
                    </Badge>
                    <span className="flex-1 truncate font-mono text-xs">{w.address}</span>
                    {w.isKnownFraud && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                      >
                        <AlertCircle size={10} className="mr-1" />
                        Fraud
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
                      <Plus size={10} />
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
