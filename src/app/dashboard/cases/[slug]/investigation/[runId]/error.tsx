"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[800px] space-y-6 p-4 md:p-6 lg:p-8">
      <Card className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-[color:var(--ds-danger-text)]" />
          <div className="space-y-3">
            <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
              Sachverhaltsprüfung konnte nicht geladen werden
            </p>
            <p className="text-xs text-[color:var(--ds-danger-text)]/80">
              {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
            </p>
            <Button variant="secondary" size="sm" onClick={reset}>
              <RefreshCw className="h-3.5 w-3.5" /> Erneut versuchen
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
