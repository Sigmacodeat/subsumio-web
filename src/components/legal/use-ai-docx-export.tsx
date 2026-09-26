"use client";

import { useCallback, useState, type ReactNode } from "react";
import { csrfFetch } from "@/lib/csrf";
import { releaseRequiredMessage } from "@/lib/ai-release-client";
import { AiReleaseDialog } from "@/components/legal/AiReleasePanel";

export interface AiDocxPayload {
  title: string;
  markdown: string;
  formData?: Record<string, unknown>;
  letterhead?: unknown;
}

type Pending = { payload: AiDocxPayload; filename: string; reason: string };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Word export of AI text via /api/word-export. When the server answers
 * "release required", the release dialog opens (check citations, lawyer
 * release); after the release the export runs again with the signed token.
 * Render `dialog` somewhere in the calling component.
 */
export function useAiDocxExport(opts: { onError: (message: string) => void }): {
  exportDocx: (payload: AiDocxPayload, filename: string) => Promise<boolean>;
  dialog: ReactNode;
} {
  const { onError } = opts;
  const [pending, setPending] = useState<Pending | null>(null);

  const post = useCallback(async (payload: AiDocxPayload, release?: string) => {
    return csrfFetch("/api/word-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, release }),
    });
  }, []);

  const finish = useCallback(
    async (res: Response, filename: string): Promise<boolean> => {
      if (res.ok) {
        download(await res.blob(), filename);
        return true;
      }
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      onError(err.error || `Export fehlgeschlagen (HTTP ${res.status})`);
      return false;
    },
    [onError]
  );

  const exportDocx = useCallback(
    async (payload: AiDocxPayload, filename: string): Promise<boolean> => {
      let res: Response;
      try {
        res = await post(payload);
      } catch {
        onError("Keine Verbindung — bitte erneut versuchen.");
        return false;
      }
      const reason = await releaseRequiredMessage(res);
      if (reason) {
        setPending({ payload, filename, reason });
        return false;
      }
      return finish(res, filename);
    },
    [post, finish, onError]
  );

  const dialog = pending ? (
    <AiReleaseDialog
      open
      content={pending.payload.markdown}
      title={pending.payload.title}
      reason={pending.reason}
      onClose={() => setPending(null)}
      onReleased={async (token) => {
        const { payload, filename } = pending;
        setPending(null);
        try {
          await finish(await post(payload, token), filename);
        } catch {
          onError("Keine Verbindung — bitte erneut versuchen.");
        }
      }}
    />
  ) : null;

  return { exportDocx, dialog };
}
