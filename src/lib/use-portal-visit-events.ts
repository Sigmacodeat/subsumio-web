"use client";

import { useRealtime, ensureRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";

interface PortalVisitPayload {
  caseSlug: string;
  documentSlug?: string;
  action?: "view" | "sign" | "upload";
  visitedAt: string;
}

/**
 * Listens for `portal.visit` realtime events and shows a toast
 * when a client opens the portal or signs a document.
 *
 * @param caseSlug — only react to events for this case (optional, all if omitted)
 */
export function usePortalVisitEvents(caseSlug?: string) {
  const { addToast } = useToast();
  const { t } = useLang();

  useRealtime("portal.visit", (payload) => {
    const data = payload as PortalVisitPayload;
    if (caseSlug && data.caseSlug !== caseSlug) return;

    const time = new Date(data.visitedAt).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (data.action === "sign") {
      addToast({
        type: "success",
        title: t("portal_event.signed_title"),
        description: t("portal_event.signed_desc").replace("{time}", time),
      });
    } else if (data.action === "upload") {
      addToast({
        type: "info",
        title: t("portal_event.upload_title"),
        description: t("portal_event.upload_desc").replace("{time}", time),
      });
    } else {
      addToast({
        type: "info",
        title: t("portal_event.view_title"),
        description: t("portal_event.view_desc").replace("{time}", time),
      });
    }
  });

  ensureRealtime();
}
