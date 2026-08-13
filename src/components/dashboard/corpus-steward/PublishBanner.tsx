"use client";

/**
 * Banner: „N Änderungen sind noch nicht im KI-Gehirn."
 *
 * WARUM DAS SICHTBAR SEIN MUSS: Der Corpus Steward bearbeitet Dateien unter
 * `law-corpus/_normalized/`. Die Suche, die Zitate und jede KI-Antwort lesen
 * dagegen die Datenbank. Zwischen Speichern und Import zeigt das Dashboard
 * also den korrigierten und die KI den alten Text.
 *
 * Ein Anwalt, der eine Norm richtigstellt und danach eine Auskunft mit der
 * alten Fassung bekommt, hat keinen Weg zu erkennen, woran das liegt. Dieses
 * Banner ist der Weg: es benennt den Zwischenzustand und bietet den Knopf,
 * der ihn beendet.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface WarteEintrag {
  pfad: string;
  benutzer: string;
  seit: string;
  art: "edit" | "create" | "delete";
}

interface PublishStatus {
  laeuft: boolean;
  gestartet: string | null;
  beendet?: string;
  dateien: number;
  quellen: string[];
  ergebnis?: "ok" | "fehler";
  meldung?: string;
}

interface Antwort {
  offen: number;
  eintraege: WarteEintrag[];
  status: PublishStatus | null;
}

export function PublishBanner() {
  const q = useQuery<Antwort>({
    queryKey: ["corpus-publish-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/corpus-files/publish");
      if (!res.ok) throw new Error("Status nicht abrufbar");
      const json = await res.json();
      return json.data ?? json;
    },
    // Während ein Import läuft, häufiger nachsehen — sonst wirkt das Banner
    // eingefroren, obwohl im Hintergrund gearbeitet wird.
    refetchInterval: (query) => (query.state.data?.status?.laeuft ? 5_000 : 30_000),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/corpus-files/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Veröffentlichen fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: () => void q.refetch(),
  });

  const daten = q.data;
  if (!daten) return null;

  const laeuft = daten.status?.laeuft === true;
  // Kein offener Posten und kein laufender Import: nichts zu melden. Das
  // Banner soll nur erscheinen, wenn Datei und Datenbank auseinanderliegen.
  if (daten.offen === 0 && !laeuft) {
    if (daten.status?.ergebnis === "fehler") {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm"
        >
          <strong className="text-[color:var(--ds-danger-text)]">
            Letzter Import fehlgeschlagen.
          </strong>{" "}
          {daten.status.meldung ?? "Kein Grund übermittelt."} Die Datenbank kann von den
          bearbeiteten Dateien abweichen.
        </div>
      );
    }
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${daten.offen} ausstehende Corpus-Änderungen`}
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {laeuft ? (
            <>
              <strong>Import läuft.</strong> {daten.status?.dateien.toLocaleString("de-AT")} Dateien
              werden in die Datenbank übertragen ({daten.status?.quellen.join(", ")}).
            </>
          ) : (
            <>
              <strong>
                {daten.offen.toLocaleString("de-AT")}{" "}
                {daten.offen === 1 ? "Änderung ist" : "Änderungen sind"} noch nicht im KI-Gehirn.
              </strong>{" "}
              Bis zum Import zeigt das Dashboard den neuen und die Suche den alten Text.
            </>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => publish.mutate()}
          disabled={laeuft || publish.isPending || daten.offen === 0}
          aria-label="Corpus-Import anstoßen"
        >
          {laeuft ? "läuft …" : publish.isPending ? "wird angestoßen …" : "Import anstoßen"}
        </Button>
      </div>

      {publish.isError && (
        <p className="mt-2 text-sm text-[color:var(--ds-danger-text)]">
          {(publish.error as Error).message}
        </p>
      )}

      {!laeuft && daten.eintraege.length > 0 && (
        <>
          <ul className="mt-3 space-y-1 text-xs text-[color:var(--ds-text-muted)]">
            {daten.eintraege.slice(0, 5).map((e) => (
              <li key={e.pfad} className="font-mono">
                {e.art === "delete" ? "gelöscht" : "geändert"} · {e.pfad}
              </li>
            ))}
            {daten.offen > 5 && <li>… und {(daten.offen - 5).toLocaleString("de-AT")} weitere</li>}
          </ul>
          <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
            Die Pipeline übernimmt den Import automatisch (alle ~10 Min) und leert die Warteschlange
            nach erfolgreichem Import. &bdquo;Import anstoßen&ldquo; startet einen sofortigen
            Zyklus.
          </p>
        </>
      )}
    </div>
  );
}
