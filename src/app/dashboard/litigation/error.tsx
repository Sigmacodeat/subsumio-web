"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
      <p className="text-sm text-[color:var(--ds-text-muted)]">
        Fehler beim Laden der Prozessführung.
      </p>
      <Button variant="ghost" onClick={reset} className="gap-2 text-sm">
        <RefreshCw size={14} />
        Erneut versuchen
      </Button>
    </div>
  );
}
