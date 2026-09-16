"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Per-request CSP nonce, generated in middleware and read by the root layout
 * (server component). Client components that need to render an inline
 * `<script>` — e.g. the dashboard theme bootstrap — take it from here so the
 * script passes the strict production CSP (`script-src 'self' 'nonce-…'`).
 */
const CspNonceContext = createContext<string | undefined>(undefined);

export function CspNonceProvider({ nonce, children }: { nonce?: string; children: ReactNode }) {
  return <CspNonceContext.Provider value={nonce}>{children}</CspNonceContext.Provider>;
}

export function useCspNonce(): string | undefined {
  return useContext(CspNonceContext);
}
