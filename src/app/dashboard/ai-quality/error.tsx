"use client";

import { AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/use-lang";

export default function Error() {
  const { t } = useLang();
  return (
    <div className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm text-[color:var(--ds-danger-text)]">
      <AlertTriangle className="mr-2 inline h-4 w-4" />
      {t("error.ai_quality_title") || "KI-Qualitätsmonitoring konnte nicht geladen werden"}
    </div>
  );
}
