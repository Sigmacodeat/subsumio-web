"use client";

import { Button } from "@/components/ui/button";

export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Seite konnte nicht geladen werden</h2>
      <p className="max-w-sm text-sm text-[color:var(--ds-text-muted)]">
        Ihre Daten sind nicht betroffen. Laden Sie die Seite erneut; besteht das Problem weiter,
        wenden Sie sich an den Support.
      </p>
      <Button onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}
