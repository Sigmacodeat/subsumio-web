"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <AlertTriangle size={32} className="text-red-500" />
      <p className="text-sm text-[color:var(--ds-text-muted)]">
        Vorlagen konnten nicht geladen werden.
      </p>
      <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
        Erneut versuchen
      </Button>
    </div>
  );
}
