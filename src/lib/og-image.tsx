import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";

// The site's display serif (Newsreader, SIL OFL) as static TTFs — next/og
// cannot use next/font. Loaded once per process; if the files are missing the
// image still renders, in the default sans.
type OgFont = { name: string; data: Buffer; weight: 500 | 600; style: "normal" };
let cachedFonts: OgFont[] | null = null;
function serifFonts(): OgFont[] {
  if (cachedFonts) return cachedFonts;
  try {
    const dir = path.join(process.cwd(), "public", "fonts");
    cachedFonts = ([500, 600] as const).map((weight) => ({
      name: "Newsreader",
      data: readFileSync(path.join(dir, `newsreader-latin-${weight}-normal.ttf`)),
      weight,
      style: "normal" as const,
    }));
  } catch {
    cachedFonts = [];
  }
  return cachedFonts;
}
const SERIF = "Newsreader, Georgia, serif";

export const ogImageSize = { width: 1200, height: 630 };
export const ogImageContentType = "image/png";

/**
 * Shared OG-image template for marketing route segments. Each route's
 * `opengraph-image.tsx` calls this with its own title/eyebrow so social
 * shares show page-specific context instead of the generic homepage image.
 */
export function renderOgImage(title: string, eyebrow = "Subsumio") {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "linear-gradient(135deg, #0c1017 0%, #142448 100%)",
        color: "#f5f7fb",
        fontFamily: "sans-serif",
      }}
    >
      {/* Brand lockup: Fundstelle mark + wordmark with the domain dot */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
        <svg width="64" height="64" viewBox="0 0 72 72">
          <defs>
            <linearGradient id="t" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2a60df" />
              <stop offset="1" stopColor="#1a3470" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="68" height="68" rx="17" fill="url(#t)" />
          <rect x="16" y="20" width="7" height="33" rx="3.5" fill="#ffffff" />
          <rect x="31" y="20" width="25" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.56" />
          <rect x="31" y="33" width="25" height="7" rx="3.5" fill="#d8b86a" />
          <rect x="31" y="46" width="17" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.56" />
        </svg>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginLeft: 20,
            fontFamily: SERIF,
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: -0.6,
          }}
        >
          Subsum
          {/* Same drawn disc as the site wordmark (brand/subsumio-logo.tsx). */}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              margin: "0 5px 0",
              background: "#d8b86a",
            }}
          />
          io
        </div>
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: 3.5,
          textTransform: "uppercase",
          color: "#d8b86a",
          marginBottom: 24,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          // Same voice as the page headlines: the serif, medium weight.
          fontFamily: SERIF,
          fontSize: 68,
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing: -1.4,
          maxWidth: 1000,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 48,
          fontSize: 26,
          color: "#9aa6c4",
        }}
      >
        subsum.io
      </div>
    </div>,
    { ...ogImageSize, fonts: serifFonts() }
  );
}
