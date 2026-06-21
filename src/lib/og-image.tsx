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
        background: "linear-gradient(135deg, #0a0e1a 0%, #131a2e 100%)",
        color: "#f5f7fb",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#7c9cff",
          marginBottom: 28,
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
        subsum.eu
      </div>
    </div>,
    { ...ogImageSize }
  );
}
