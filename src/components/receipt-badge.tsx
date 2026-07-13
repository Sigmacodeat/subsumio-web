"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, ShieldOff, Loader2 } from "lucide-react";
import type { WorkProductReceipt, VerificationState } from "@/lib/work-product-receipts";

const STATE_CONFIG: Record<
  VerificationState,
  { label: string; icon: typeof ShieldCheck; className: string }
> = {
  VERIFIED: {
    label: "Verifiziert",
    icon: ShieldCheck,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  },
  VERIFIED_WITH_WARNINGS: {
    label: "Verifiziert (mit Warnungen)",
    icon: ShieldAlert,
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  },
  NEEDS_HUMAN_REVIEW: {
    label: "Menschliche Prüfung erforderlich",
    icon: ShieldAlert,
    className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  },
  BLOCKED: {
    label: "Blockiert",
    icon: ShieldX,
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  },
  VERIFIER_ERROR: {
    label: "Verifizierungsfehler",
    icon: ShieldOff,
    className: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700",
  },
};

interface ReceiptBadgeProps {
  receipt?: WorkProductReceipt | null;
  /** If receipt is not provided, fetch by these params */
  productType?: string;
  productRef?: string;
  brainId?: string;
  /** Show version number */
  showVersion?: boolean;
  className?: string;
}

export function ReceiptBadge({
  receipt: initialReceipt,
  productType,
  productRef,
  brainId,
  showVersion = true,
  className = "",
}: ReceiptBadgeProps) {
  const [receipt, setReceipt] = useState<WorkProductReceipt | null | undefined>(initialReceipt);
  const [loading, setLoading] = useState(!initialReceipt && !!productType && !!productRef && !!brainId);

  useEffect(() => {
    if (initialReceipt) {
      setReceipt(initialReceipt);
      setLoading(false);
      return;
    }
    if (!productType || !productRef || !brainId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/legal/receipts/latest?product_type=${productType}&product_ref=${encodeURIComponent(productRef)}&brain_id=${encodeURIComponent(brainId)}`,
          { headers: { "Content-Type": "application/json" } }
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setReceipt(data.receipt as WorkProductReceipt);
        }
      } catch {
        // silent fail — badge just won't show
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialReceipt, productType, productRef, brainId]);

  if (loading) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground border-border ${className}`}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Prüfe Status…
      </span>
    );
  }

  if (!receipt) {
    return null;
  }

  const config = STATE_CONFIG[receipt.state] ?? STATE_CONFIG.VERIFIER_ERROR;
  const Icon = config.icon;
  const invalidated = !!receipt.invalidated_at;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${invalidated ? "opacity-50 line-through" : ""} ${config.className} ${className}`}
      title={`Receipt v${receipt.version}${invalidated ? " (invalidiert)" : ""} — ${receipt.receipt_id.slice(0, 8)}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
      {showVersion && (
        <span className="opacity-60">v{receipt.version}</span>
      )}
    </span>
  );
}
