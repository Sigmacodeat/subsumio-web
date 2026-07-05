"use client";

import { Button } from "@/components/ui/button";

export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Seite konnte nicht geladen werden</h2>
      <p className="text-sm text-[color:var(--ds-text-muted)]">
        Page could not be loaded. Please try again.
      </p>
      <Button onClick={reset}>Erneut versuchen / Try again</Button>
    </div>
  );
}
