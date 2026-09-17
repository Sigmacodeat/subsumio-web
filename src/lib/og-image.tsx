import { ImageResponse } from "next/og";

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
          <rect x="16" y="19" width="7" height="34" rx="2.5" fill="#ffffff" />
          <rect x="31" y="20" width="25" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.5" />
          <rect x="31" y="33" width="25" height="7" rx="3.5" fill="#d8b86a" />
          <rect x="31" y="46" width="17" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.5" />
        </svg>
        <div
          style={{
            display: "flex",
            marginLeft: 20,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          Subsum<span style={{ color: "#d8b86a" }}>•</span>io
        </div>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#d8b86a",
          marginBottom: 24,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.15,
          maxWidth: 980,
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
    { ...ogImageSize }
  );
}
