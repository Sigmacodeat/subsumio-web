"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radar,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  FileText,
  Sparkles,
} from "lucide-react";
import { BLOCKCHAIN_LABELS, BLOCKCHAIN_COLORS } from "@/lib/crypto-wallet-detector";
import type { BlockchainType } from "@/lib/rciid-client";

interface DetectedWalletSuggestion {
  address: string;
  blockchain: BlockchainType;
  confidence: number;
  context?: string;
  checksumValid?: boolean;
  checksumError?: string;
  isKnownFraud?: boolean;
  documentSlug?: string;
  documentTitle?: string;
}

interface RciidWalletSuggestionProps {
  caseSlug: string;
  onAcceptWallets?: (wallets: DetectedWalletSuggestion[]) => void;
}

export function RciidWalletSuggestion({ caseSlug, onAcceptWallets }: RciidWalletSuggestionProps) {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [results, setResults] = useState<DetectedWalletSuggestion[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setResults([]);
    setSelected(new Set());
    setScanned(false);

    try {
      const res = await api.rciid.scanCase(caseSlug);
      const wallets = (res.wallets as DetectedWalletSuggestion[]) ?? [];
      setResults(wallets);
      setSummary(res.summary ?? `${wallets.length} Adresse(n) gefunden`);
      setScanned(true);

      // Auto-select all valid wallets
      const validAddresses = new Set(wallets.filter((w) => w.checksumValid).map((w) => w.address));
      setSelected(validAddresses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan fehlgeschlagen.");
    } finally {
      setScanning(false);
    }
  }, [caseSlug]);

  function toggleSelect(address: string) {
    const next = new Set(selected);
    if (next.has(address)) {
      next.delete(address);
    } else {
      next.add(address);
    }
    setSelected(next);
  }

  function handleAccept() {
    const accepted = results.filter((w) => selected.has(w.address));
    if (accepted.length > 0 && onAcceptWallets) {
      onAcceptWallets(accepted);
    }
  }

  const _validCount = results.filter((w) => w.checksumValid).length;
  const selectedCount = selected.size;

  return (
    <div className="space-y-3">
      {/* Scan Button */}
      {!scanned && !scanning && (
        <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] p-6 text-center">
          <Radar className="mx-auto mb-2 h-8 w-8 text-[color:var(--ds-text-muted)]" />
          <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
            Alle Fall-Dokumente nach Krypto-Wallet-Adressen scannen
          </p>
          <Button onClick={handleScan} size="sm">
            <Search size={14} className="mr-2" />
            Fall scannen
          </Button>
        </div>
      )}

      {/* Scanning */}
      {scanning && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
          <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
          <span className="text-sm text-[color:var(--ds-text-muted)]">
            Scanne Fall-Dokumente...
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {scanned && !scanning && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
            <Sparkles size={16} className="text-[color:var(--ds-text-muted)]" />
            <span className="flex-1 text-sm text-[color:var(--ds-text)]">{summary}</span>
            <Button variant="ghost" size="sm" onClick={handleScan}>
              <Search size={12} className="mr-1" />
              Neu scannen
            </Button>
          </div>

          {/* Wallet List */}
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((w, i) => {
                const isSelected = selected.has(w.address);
                const color = BLOCKCHAIN_COLORS[w.blockchain] ?? "#6a6a8a";
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      isSelected
                        ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-hover)]"
                    }`}
                    onClick={() => toggleSelect(w.address)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelect(w.address);
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(w.address)}
                      className="h-4 w-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Badge
                      variant="default"
                      className="text-xs"
                      style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
                    >
                      {BLOCKCHAIN_LABELS[w.blockchain] ?? w.blockchain}
                    </Badge>
                    <span className="flex-1 truncate font-mono text-xs text-[color:var(--ds-text)]">
                      {w.address}
                    </span>
                    {w.checksumValid ? (
                      <CheckCircle2 size={12} className="text-[color:var(--ds-success-text)]" />
                    ) : (
                      <AlertCircle size={12} className="text-[color:var(--ds-danger-text)]" />
                    )}
                    {w.isKnownFraud && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                      >
                        Known Fraud
                      </Badge>
                    )}
                    {w.documentTitle && (
                      <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                        <FileText size={10} />
                        {w.documentTitle}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Accept Button */}
              {selectedCount > 0 && onAcceptWallets && (
                <Button onClick={handleAccept} size="sm" className="w-full">
                  <Plus size={14} className="mr-2" />
                  {selectedCount} Adresse(n) für forensische Analyse übernehmen
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] p-6 text-center">
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                Keine Krypto-Adressen in den Fall-Dokumenten gefunden.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
