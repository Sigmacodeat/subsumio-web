"use client";

import { useState } from "react";
import { Plus, Trash2, Copy, CheckCircle2, AlertTriangle, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useFirmApiKeys,
  type ApiKey,
} from "@/lib/queries/settings";
import { useMe } from "@/lib/queries/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import { formatDate } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { McpTokensSection } from "@/components/dashboard/McpTokensSection";

/** Berechtigungsstufen eines Schlüssels in Kanzleisprache. */
const SCOPE_LABELS: Record<string, string> = {
  read: "Lesen",
  write: "Schreiben",
  admin: "Verwalten",
};

/** Übersetzt Server-Fehlercodes in Klartext — nie rohe Codes anzeigen. */
function createErrorText(code: unknown): string {
  if (code === "name_required_or_too_long") {
    return "Bitte geben Sie eine Bezeichnung mit höchstens 80 Zeichen ein.";
  }
  if (code === "rate_limited") return "Zu viele Versuche — bitte warten Sie einen Moment.";
  if (code === "invalid_expiry") return "Bitte wählen Sie eine gültige Laufzeit.";
  return "Der Schlüssel konnte nicht erstellt werden. Bitte versuchen Sie es erneut.";
}

/** Laufzeiten neuer Schlüssel; Standard ein Jahr. */
const EXPIRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "30", label: "30 Tage" },
  { value: "90", label: "90 Tage" },
  { value: "180", label: "180 Tage" },
  { value: "365", label: "1 Jahr" },
  { value: "730", label: "2 Jahre" },
  { value: "never", label: "Kein Ablauf" },
];

function keyStatus(k: ApiKey): { label: string; tone: "ok" | "muted" } {
  if (!k.active) return { label: "Widerrufen", tone: "muted" };
  if (k.expired) return { label: "Abgelaufen", tone: "muted" };
  return { label: "Aktiv", tone: "ok" };
}

export default function ApiKeysPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const keysQuery = useApiKeys();
  const createMutation = useCreateApiKey();
  const deleteMutation = useDeleteApiKey();
  const [newKeyName, setNewKeyName] = useState("");
  const [expiry, setExpiry] = useState("365");
  const meQuery = useMe();
  const isAdmin = meQuery.data?.user?.role === "admin" && !meQuery.data?.demo;
  const firmKeysQuery = useFirmApiKeys(isAdmin);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys: ApiKey[] = keysQuery.data?.keys || [];
  const loading = keysQuery.isLoading;

  async function createKey() {
    if (!newKeyName.trim()) return;
    setError(null);
    try {
      const data = (await createMutation.mutateAsync({
        name: newKeyName.trim(),
        expiresInDays: expiry === "never" ? null : Number(expiry),
      })) as {
        plaintextKey?: string;
        error?: string;
        code?: string;
      };
      if (!data?.plaintextKey) {
        setError(createErrorText(data?.code ?? data?.error));
        return;
      }
      setNewKeyPlaintext(data.plaintextKey);
      setNewKeyName("");
    } catch {
      setError(createErrorText(null));
    }
  }

  async function deleteKey(k: ApiKey) {
    const ok = await confirm({
      title: "Schlüssel widerrufen",
      message: `„${k.name}“ wird sofort ungültig. Programme, die diesen Schlüssel verwenden, verlieren den Zugriff auf Ihre Kanzleidaten.`,
      confirmLabel: "Widerrufen",
      variant: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      const data = (await deleteMutation.mutateAsync(k.id)) as { ok?: boolean };
      if (!data?.ok) throw new Error("delete_failed");
    } catch {
      setError("Der Schlüssel konnte nicht widerrufen werden. Bitte versuchen Sie es erneut.");
    }
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopieren nicht möglich — bitte markieren und kopieren Sie den Schlüssel manuell.");
    }
  }

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("apikeys.title")}
        description="Zugangsschlüssel erlauben anderen Programmen (etwa einem Add-in oder einer Automatisierung), im Namen Ihres Kontos auf Ihre Kanzleidaten zuzugreifen."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("apikeys.breadcrumb") },
        ]}
      />

      {/* Neuen Schlüssel erstellen */}
      <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            Neuen Schlüssel erstellen
          </h2>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Vergeben Sie eine Bezeichnung, an der Sie später erkennen, welches Programm den
            Schlüssel nutzt. Neue Schlüssel erhalten Lesezugriff und laufen standardmäßig nach einem
            Jahr ab; abgelaufene Schlüssel werden abgewiesen.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Bezeichnung des Schlüssels</span>
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t("apikeys.placeholder_name")}
              maxLength={80}
              onKeyDown={(e) => e.key === "Enter" && createKey()}
            />
          </label>
          <label className="sm:w-40">
            <span className="sr-only">Laufzeit des Schlüssels</span>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              aria-label="Laufzeit des Schlüssels"
              className="h-full w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-sm text-[color:var(--ds-text)]"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            className="gap-2 whitespace-nowrap"
            onClick={createKey}
            disabled={createMutation.isPending || !newKeyName.trim()}
          >
            {createMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Plus size={14} aria-hidden />
            )}
            Schlüssel erstellen
          </Button>
        </div>

        {newKeyPlaintext && (
          <div
            role="status"
            className="space-y-2 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                aria-hidden
                className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
              />
              <span className="text-sm font-medium text-[color:var(--ds-warning-text)]">
                Der Schlüssel wird nur jetzt angezeigt — bitte kopieren und sicher verwahren.
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
              <code className="flex-1 font-mono text-sm break-all text-[color:var(--ds-text)]">
                {newKeyPlaintext}
              </code>
              <button
                type="button"
                onClick={() => copyKey(newKeyPlaintext)}
                aria-label={copied ? "Kopiert" : "Schlüssel kopieren"}
                className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                {copied ? (
                  <CheckCircle2
                    size={14}
                    aria-hidden
                    className="text-[color:var(--ds-success-text)]"
                  />
                ) : (
                  <Copy size={14} aria-hidden />
                )}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
          >
            {error}
          </div>
        )}
      </section>

      {/* Vorhandene Schlüssel */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
          Vorhandene Schlüssel
        </h2>
        {loading ? (
          <div
            role="status"
            aria-label="Schlüssel werden geladen"
            className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6">
                <Skeleton className="h-3.5 w-40 rounded" />
                <Skeleton className="h-3.5 w-16 rounded" />
                <Skeleton className="hidden h-3.5 w-24 rounded sm:block" />
              </div>
            ))}
          </div>
        ) : keysQuery.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
          >
            Die Schlüssel konnten nicht geladen werden. Bitte laden Sie die Seite neu.
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Noch keine Schlüssel"
            description="Solange kein Schlüssel existiert, kann kein anderes Programm auf Ihre Kanzleidaten zugreifen."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                  <th className="px-4 py-3 font-medium">Bezeichnung</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Berechtigung</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Zuletzt genutzt</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-[color:var(--ds-border)] last:border-0">
                    <td className="px-4 py-3">
                      <div className="text-[color:var(--ds-text)]">{k.name}</div>
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)]">
                        <span className="font-mono">{k.prefix}…</span> · erstellt{" "}
                        <span className="tabular-nums">{formatDate(k.createdAt)}</span> ·{" "}
                        {k.expiresAt ? (
                          <>
                            läuft ab <span className="tabular-nums">{formatDate(k.expiresAt)}</span>
                          </>
                        ) : (
                          "kein Ablauf"
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-[color:var(--ds-text-muted)] sm:table-cell">
                      {k.scopes.map((s) => SCOPE_LABELS[s] ?? s).join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          keyStatus(k).tone === "ok"
                            ? "text-xs text-[color:var(--ds-success-text)]"
                            : "text-xs text-[color:var(--ds-text-muted)]"
                        }
                      >
                        {keyStatus(k).label}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-[color:var(--ds-text-muted)] tabular-nums md:table-cell">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : "Noch nie"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteKey(k)}
                        disabled={deleteMutation.isPending}
                        aria-label={`Schlüssel „${k.name}“ widerrufen`}
                        title="Widerrufen"
                        className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-3" aria-labelledby="firm-keys-title">
          <h2
            id="firm-keys-title"
            className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase"
          >
            Alle Schlüssel der Kanzlei
          </h2>
          {firmKeysQuery.isLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : firmKeysQuery.isError ? (
            <div
              role="alert"
              className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
            >
              Die Übersicht konnte nicht geladen werden.
            </div>
          ) : (firmKeysQuery.data?.keys ?? []).length === 0 ? (
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              In Ihrer Kanzlei gibt es keine Schlüssel.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                    <th className="px-4 py-3 font-medium">Besitzer</th>
                    <th className="px-4 py-3 font-medium">Bezeichnung</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Zuletzt genutzt</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Ablauf</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(firmKeysQuery.data?.keys ?? []).map((k) => (
                    <tr
                      key={k.id}
                      className="border-b border-[color:var(--ds-border)] last:border-0"
                    >
                      <td className="px-4 py-3 text-xs text-[color:var(--ds-text)]">
                        {k.owner.name || k.owner.email}
                        <div className="text-[color:var(--ds-text-subtle)]">{k.owner.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[color:var(--ds-text)]">
                        {k.name}
                        {k.kind === "addin" ? " (Add-in)" : ""}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-[color:var(--ds-text-muted)] tabular-nums md:table-cell">
                        {k.lastUsedAt ? formatDate(k.lastUsedAt) : "Noch nie"}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-[color:var(--ds-text-muted)] tabular-nums md:table-cell">
                        {k.expiresAt ? formatDate(k.expiresAt) : "Kein Ablauf"}
                      </td>
                      <td className="px-4 py-3 text-xs">{keyStatus(k).label}</td>
                      <td className="px-4 py-3 text-right">
                        {k.active && (
                          <button
                            type="button"
                            onClick={() => deleteKey(k)}
                            disabled={deleteMutation.isPending}
                            aria-label={`Schlüssel „${k.name}“ von ${k.owner.email} widerrufen`}
                            title="Widerrufen"
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <McpTokensSection />

      {/* Verwendung — technische Angaben für die IT, mit Erklärung */}
      <section className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          Hinweis für Ihre IT-Betreuung
        </h2>
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          Das andere Programm sendet den Schlüssel bei jeder Anfrage im Kopfeintrag{" "}
          <code className="font-mono text-[color:var(--ds-text)]">
            Authorization: Bearer sk_live_…
          </code>{" "}
          mit. Es erhält damit dieselben Rechte wie Ihr Benutzerkonto, begrenzt auf die Berechtigung
          des Schlüssels. Widerrufen Sie Schlüssel, die nicht mehr gebraucht werden.
        </p>
      </section>
    </div>
  );
}
