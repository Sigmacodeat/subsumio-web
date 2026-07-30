import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Allows CI/verification jobs to build concurrently without corrupting .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // TODO: Re-enable lint during build once the 25k pre-existing ESLint issues
  // (mostly a11y and TypeScript) are resolved in a dedicated lint sprint.
  // TypeScript build errors remain enforced below.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [],
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
      // Removed dashboard routes (IA consolidation) — keep old bookmarks alive
      { source: "/dashboard/assistant", destination: "/dashboard/chat", permanent: true },
      { source: "/dashboard/query", destination: "/dashboard/brain", permanent: true },
      // TODO 11: Recherche-Hub — old routes redirect to unified hub with tab facet
      {
        source: "/dashboard/rechtsprechung",
        destination: "/dashboard/research?tab=rechtsprechung",
        permanent: true,
      },
      {
        source: "/dashboard/norms",
        destination: "/dashboard/research?tab=normen",
        permanent: true,
      },
      {
        source: "/dashboard/judgements-db",
        destination: "/dashboard/research?tab=judgements-db",
        permanent: true,
      },
      {
        source: "/dashboard/precedent-search",
        destination: "/dashboard/research?tab=precedent-search",
        permanent: true,
      },
      {
        source: "/dashboard/commentaries",
        destination: "/dashboard/research?tab=commentaries",
        permanent: true,
      },
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
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          // CSP is set per-request in middleware with a cryptographic nonce
          // to eliminate 'unsafe-inline' from script-src.
        ],
      },
    ];
  },
  experimental: {
    reactCompiler: false,
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns", "radash"],
    // In Next 15.5 these options both live under `experimental`. The web upload
    // route is matched by middleware, while Server Actions use their own limit.
    serverActions: {
      bodySizeLimit: "1gb",
    },
    middlewareClientMaxBodySize: "1gb",
  },
  serverExternalPackages: ["pg", "isomorphic-dompurify", "ioredis"],
  // The legal corpus lives in the repo but is only ever ingested into Postgres —
  // no route reads it from disk at runtime. File tracing is therefore disabled
  // to avoid scanning the ~772k files (18 GB) under law-corpus/ and server/,
  // which OOMs at 8 GB (node::fs::AfterScanDir). Re-enable with `output: 'standalone'`
  // and validated `outputFileTracingExcludes` once the deployment setup requires it.
  outputFileTracingExcludes: {
    "*": [
      "**/law-corpus/**",
      "**/server/**",
      "**/.source-registry-diff/**",
      "**/evals/**",
      "**/research/**",
      "**/.claude/**",
      "**/.git/**",
      "**/tests/**",
      "**/test-results/**",
      "**/docs/**",
      "**/scripts/**",
      "**/tools/**",
      "**/outlook-addin/**",
      "**/word-addin/**",
      "**/mobile/**",
      "**/plugins/**",
      "**/tmp/**",
    ],
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    // ioredis is an optional dynamic import for Redis presence.
    // Mark it as externals so webpack doesn't try to bundle it.
    config.externals = [...(config.externals || []), { ioredis: "ioredis" }];
    // pg is a Node.js-only module that should never end up in the client bundle.
    // If a client component accidentally imports a server module that imports pg,
    // this prevents webpack from trying to resolve fs/dns/net/tls in the browser.
    config.externals = [...(config.externals || []), { pg: "pg" }];
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
