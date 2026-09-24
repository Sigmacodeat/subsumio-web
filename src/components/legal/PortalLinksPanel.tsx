"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, ShieldOff } from "lucide-react";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { cn, formatDate } from "@/lib/utils";

interface PortalLink {
  token_hash: string;
  created_at: string;
  created_by?: string;
  expires_at: string;
  purpose?: string;
  status: "active" | "expired" | "revoked";
}

const STATUS_STYLE: Record<PortalLink["status"], string> = {
  active:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  expired:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  revoked:
    "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-muted)] text-[color:var(--ds-text-muted)]",
};

/**
 * Issued portal links of a matter, with per-link and revoke-all controls.
 * Links are stateless tokens — the registry (hash only) is what makes a
 * single leaked link revocable without disabling the whole portal.
 */
export function PortalLinksPanel({ caseSlug }: { caseSlug: string }) {
  const { t } = useLang();
  const [links, setLinks] = useState<PortalLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // token_hash or "all"

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/portal/links?case_slug=${encodeURIComponent(caseSlug)}`);
      if (!res.ok) throw new Error(`status_${res.status}`);
      const data = (await res.json()) as { links?: PortalLink[] };
      setLinks(data.links ?? []);
    } catch {
      setError(t("cases.detail_portal_links_error"));
      setLinks(null);
    }
  }, [caseSlug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (payload: { token_hash: string } | { all: true }) => {
      const key = "all" in payload ? "all" : payload.token_hash;
      setBusy(key);
      setError(null);
      try {
        const res = await csrfFetch("/api/portal/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case_slug: caseSlug, ...payload }),
        });
        if (!res.ok) throw new Error(`status_${res.status}`);
        await load();
      } catch {
        setError(t("cases.detail_portal_revoke_error"));
      } finally {
        setBusy(null);
      }
    },
    [caseSlug, load, t]
  );

  const activeCount = links?.filter((l) => l.status === "active").length ?? 0;

  return (
    <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ds-text)]">
          <Link2 size={14} className="text-[color:var(--ds-text-muted)]" aria-hidden />
          {t("cases.detail_portal_links_title")}
        </h3>
        {activeCount > 1 && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void revoke({ all: true })}
            className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-danger-text)] hover:underline disabled:opacity-50"
          >
            {busy === "all" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <ShieldOff size={12} aria-hidden />
            )}
            {t("cases.detail_portal_links_revoke_all")}
          </button>
        )}
      </div>
      <p className="text-xs text-[color:var(--ds-text-muted)]">
        {t("cases.detail_portal_links_hint")}
      </p>

      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      )}

      {links === null && !error ? (
        <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          {t("cases.detail_portal_links_loading")}
        </p>
      ) : links && links.length === 0 ? (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          {t("cases.detail_portal_links_empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {links?.map((link) => (
            <li
              key={link.token_hash}
              className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-2.5 py-1.5 text-xs"
            >
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  STATUS_STYLE[link.status]
                )}
              >
                {t(`cases.detail_portal_link_status_${link.status}`)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text)]">
                <span className="tabular-nums">{formatDate(link.created_at)}</span>
                {link.created_by ? ` · ${link.created_by}` : ""}
                {link.purpose?.startsWith("sign:")
                  ? ` · ${t("cases.detail_portal_link_purpose_sign")}`
                  : ""}
              </span>
              <span className="shrink-0 text-[color:var(--ds-text-muted)] tabular-nums">
                {t("cases.detail_portal_link_until")} {formatDate(link.expires_at)}
              </span>
              {link.status === "active" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void revoke({ token_hash: link.token_hash })}
                  className="shrink-0 text-[color:var(--ds-danger-text)] hover:underline disabled:opacity-50"
                >
                  {busy === link.token_hash ? (
                    <Loader2 size={11} className="inline animate-spin" aria-hidden />
                  ) : (
                    t("cases.detail_portal_revoke")
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
