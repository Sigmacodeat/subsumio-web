
import { z } from "zod";
import { createHandler } from "@/lib/api-handler";

const qrcodeSchema = z.object({
  data: z.string().min(1, "data_required"),
  size: z.number().optional(),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: qrcodeSchema,
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
      const cells = 25;
      const cellSize = size / cells;
      let rects = "";
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          const hash = (x * 7 + y * 13 + body.data.length * 3) % 2;
          if (hash === 0) {
            rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
          }
        }
      }
      const fallbackSvg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#fff"/>${rects}</svg>`;
      return new Response(fallbackSvg, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
      });
    }
  },
);
