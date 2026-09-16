import type { Metadata } from "next";
import { requirePlatformOperator } from "@/lib/auth/require-operator";
import { OpsShell } from "@/components/ops/ops-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Betreiber-Konsole", template: "%s · Subsumio Ops" },
  robots: { index: false, follow: false },
};

/**
 * /ops/* — Subsumio platform operator console (ops.subsum.eu).
 *
 * Defense in depth:
 *   1. Middleware: /ops only on the ops host, session required
 *   2. This layout: platform operator (allowlist + 2FA) or 404
 *   3. APIs: createHandler({ action: "platform.operator" })
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const operator = await requirePlatformOperator();
  return <OpsShell operatorEmail={operator.email}>{children}</OpsShell>;
}
