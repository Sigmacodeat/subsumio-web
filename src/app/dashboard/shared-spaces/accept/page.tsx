"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderLock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unwrapApiBody } from "@/lib/api-body";
import { csrfFetch } from "@/lib/csrf";

/** Accept a data-room invitation from another firm (lib/data-rooms.ts). */
function AcceptInvitation() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/data-rooms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(json?.error?.message ?? "Die Einladung konnte nicht angenommen werden.");
      const { room_id } = unwrapApiBody<{ room_id: string }>(json);
      router.push(`/dashboard/shared-spaces/${room_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderLock
              size={18}
              aria-hidden="true"
              className="text-[color:var(--brand-primary)]"
            />
            Einladung in einen Datenraum
          </CardTitle>
          <CardDescription>
            Eine andere Kanzlei teilt Unterlagen einer Akte mit Ihnen. Sie sehen nur, was dort
            freigegeben ist; jeder Abruf wird bei der Kanzlei protokolliert.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!token ? (
            <p className="text-sm text-[color:var(--ds-danger-text)]">
              Der Link ist unvollständig.
            </p>
          ) : (
            <Button onClick={() => void accept()} disabled={busy} className="w-full">
              {busy && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />}
              Einladung annehmen
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitation />
    </Suspense>
  );
}
