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
      // German is the default locale at root (/); /de/* routes are not part of
      // the current App Router structure, so any double-locale cleanup that
      // targets /de would point to a non-existent route. The canonical German
      // URLs are the root paths below.
      // Deduplicate: canonical product page is the homepage
      { source: "/subsumio", destination: "/", permanent: true },
      { source: "/de/subsumio", destination: "/de", permanent: true },
      { source: "/en/subsumio", destination: "/en", permanent: true },
      { source: "/at/subsumio", destination: "/at", permanent: true },
      { source: "/ch/subsumio", destination: "/ch", permanent: true },
      { source: "/produkt", destination: "/", permanent: true },
      // Deduplicate: canonical security page is /security
      { source: "/sicherheit", destination: "/security", permanent: true },
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
          // CSP is set per-request in middleware with a cryptographic nonce
          // to eliminate 'unsafe-inline' from script-src.
        ],
      },
    ];
  },
  experimental: {
    reactCompiler: false,
    // In Next 15.5 these options both live under `experimental`. The web upload
    // route is matched by middleware, while Server Actions use their own limit.
    serverActions: {
      bodySizeLimit: "1gb",
    },
    middlewareClientMaxBodySize: "1gb",
  },
  serverExternalPackages: ["pg", "isomorphic-dompurify", "ioredis"],
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    // ioredis is an optional dynamic import for Redis presence.
    // Mark it as externals so webpack doesn't try to bundle it.
    config.externals = [...(config.externals || []), { ioredis: "ioredis" }];
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
