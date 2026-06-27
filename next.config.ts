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
          // CSP is set per-request in middleware with a cryptographic nonce
          // to eliminate 'unsafe-inline' from script-src.
        ],
      },
    ];
  },
  serverActions: {
    bodySizeLimit: "1gb",
  },
  experimental: {
    reactCompiler: false,
    // Next.js 15.5+ added an internal proxy layer with its own body size
    // limit, separate from serverActions.bodySizeLimit. Without this, large
    // uploads (e.g. 171 MB PDFs) have their binary data silently dropped —
    // file metadata is preserved but content becomes 0 bytes.
    // Both must be set to match serverActions.bodySizeLimit.
    proxyClientMaxBodySize: "1gb",
    // Middleware matches /api/upload, so its body size limit also applies.
    middlewareClientMaxBodySize: "1gb",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
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
