"use client";

import { useEffect } from "react";
import { useLang } from "@/lib/use-lang";
import { Button } from "@/components/ui/button";

export default function ElsterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLang();
  useEffect(() => {
    console.error("ELSTER page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-6 lg:p-8">
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-8 text-center">
        <h2 className="text-lg font-semibold text-rose-600">{t("elster.error_title")}</h2>
        <p className="mt-2 text-sm text-[color:var(--ds-text-subtle)]">{error.message}</p>
        <Button className="mt-4" onClick={() => reset()}>
          {t("elster.retry")}
        </Button>
      </div>
    </div>
  );
}
