import type { MetadataRoute } from "next";

// PWA manifest — makes Sigmabrain installable on iOS, Android and iPadOS
// ("Add to Home Screen" / Chrome install prompt). Native store apps come
// later via Capacitor on top of this same codebase.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sigmabrain — the brain your firm never had",
    short_name: "Sigmabrain",
    description:
      "Every meeting, deal, email and document — turned into one answer instead of ten search results.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    // No orientation lock: phones use portrait naturally, but iPad with a
    // keyboard, Android tablets and installed desktop windows work in
    // landscape — locking portrait would break exactly the on-the-go work
    // the app exists for.
    orientation: "any",
    background_color: "#06060f",
    theme_color: "#06060f",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
