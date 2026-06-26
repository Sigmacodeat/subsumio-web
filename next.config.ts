import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      // Fix double-locale prefix bug: /de/de -> /de
      { source: "/de/de/:path*", destination: "/de/:path*", permanent: true },
      { source: "/de/de", destination: "/de", permanent: true },
      // Deduplicate: canonical product page is /subsumio
      { source: "/produkt", destination: "/subsumio", permanent: true },
      { source: "/de/produkt", destination: "/de/subsumio", permanent: true },
      // Deduplicate: canonical security page is /security
      { source: "/sicherheit", destination: "/security", permanent: true },
      { source: "/de/sicherheit", destination: "/de/security", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              process.env.NODE_ENV === "production"
                ? "script-src 'self' 'unsafe-inline' https://js.stripe.com"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://api.stripe.com https://*.sentry.io https://app.posthog.com https://api.subsum.io",
              "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.stripe.com",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
  experimental: {
    reactCompiler: false,
    serverActions: {
      bodySizeLimit: "1gb",
    },
  },
  serverExternalPackages: ["pg", "isomorphic-dompurify"],
};

export default withBundleAnalyzer(nextConfig);
