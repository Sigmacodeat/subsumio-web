import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";

const qrcodeSchema = z.object({
  data: z.string().min(1, "data_required"),
  size: z.number().optional(),
});

export const POST = createHandler(
  {
    // Part of every user's own 2FA enrolment (settings/security), so every
    // role may call it — "settings.write" is admin-only and hid the QR code
    // from lawyers and assistants, who then could not set up 2FA at all.
    action: "auth.2fa",
    rateTier: "standard",
    body: qrcodeSchema,
    audit: (_ctx, body) => ({
      action: "security.2fa_qrcode" as const,
      entityType: "user",
      details: { size: body.size },
    }),
  },
  async (_ctx, body, _query, _req) => {
    const size = Math.min(Math.max(body.size ?? 200, 100), 400);

    try {
      const QRCode = (await import("qrcode")).default;
      const svg = await QRCode.toString(body.data, {
        type: "svg",
        width: size,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      return new Response(svg, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
      });
    } catch {
      // Never a look-alike pattern: an unscannable "QR" would let the setup
      // fail silently. The page shows the error and the manual key instead.
      return apiError("qrcode_failed", "QR-Code konnte nicht erzeugt werden", 500);
    }
  }
);
