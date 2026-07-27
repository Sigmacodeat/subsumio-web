"use client";

import { AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/use-lang";

export default function Error() {
  const { t } = useLang();
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <AlertTriangle className="mr-2 inline h-4 w-4" />
      {t("error.ai_quality_title") || "KI-Qualitätsmonitoring konnte nicht geladen werden"}
    </div>
  );
}
