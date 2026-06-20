
import { ENGINE_URL } from "@/lib/engine";
import { validateUpload, sanitizeFilename } from "@/lib/upload-validation";
import { scanFile } from "@/lib/virus-scan";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { env } from "@/lib/env";

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    audit: (ctx, _body, _query) => ({
      action: "document.upload" as const,
      entityType: "document",
      details: { userId: ctx.user.id },
    }),
  },
  async (ctx, _body, _query, req) => {
    try {
      const formData = await req.formData();
      const file = formData.get("file");

      const check = validateUpload(file);
      if (!check.ok) {
        const status = check.error === "file_required" ? 400 : check.error === "file_too_large" ? 413 : 415;
        return Response.json(check, { status });
      }

      const cleanForm = new FormData();
      cleanForm.append("file", new File([check.file], sanitizeFilename(check.file.name), { type: check.file.type }));
      const title = formData.get("title");
      if (typeof title === "string") cleanForm.append("title", title);
      const source = formData.get("source");
      if (typeof source === "string") cleanForm.append("source", source);
      const tags = formData.get("tags");
      if (typeof tags === "string") cleanForm.append("tags", tags);

      const fileBuffer = await check.file.arrayBuffer();
      const scanResult = await scanFile(fileBuffer, check.file.type);
      if (!scanResult.ok) {
        let message: string;
        switch (scanResult.reason) {
          case "executable_detected":
            message = `Datei enthält ausführbaren Code (${scanResult.label}) — Upload abgelehnt.`;
            break;
          case "mime_mismatch":
            message = `Dateiinhalt stimmt nicht mit deklariertem Typ überein — Upload abgelehnt.`;
            break;
          case "clamav_infected":
            message = `Datei ist infiziert (${scanResult.signature}) — Upload abgelehnt.`;
            break;
          case "clamav_unreachable":
            message = `Virenscanner nicht erreichbar — bitte erneut versuchen.`;
            break;
        }
        return Response.json(
          { error: scanResult.reason, message },
          { status: 422 },
        );
      }

      cleanForm.delete("file");
      cleanForm.append("file", new File([fileBuffer], sanitizeFilename(check.file.name), { type: check.file.type }));

      const upstream = await fetch(`${ENGINE_URL}/api/upload`, {
        method: "POST",
        headers: ctx.headers,
        body: cleanForm,
      });

      const text = await upstream.text();
      if (upstream.ok) {
        void recordQuota(ctx, "uploads");
        const internalSecret = env("SIGMABRAIN_INTERNAL_SECRET");
        if (internalSecret) {
          try {
            const uploadResult = JSON.parse(text) as { slug?: string; title?: string };
            if (uploadResult.slug) {
              void fetch(`${req.nextUrl.origin}/api/legal/analyze`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                },
                body: JSON.stringify({
                  document_slug: uploadResult.slug,
                  brain_id: ctx.brainId,
                }),
              }).catch(() => {/* silent: analysis is best-effort */});
            }
          } catch {
            // JSON parse failed or no slug — skip auto-analysis
          }
        }
      }
      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[upload] failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Upload fehlgeschlagen", 503);
    }
  },
);
