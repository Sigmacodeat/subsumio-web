"use client";

/**
 * Matter Layout — wraps all [...slug] case pages with MatterDataProvider,
 * MatterHeader (sticky, with vitals bar), and MatterTabBar (URL-based tabs).
 * The actual page content is rendered as children.
 */

import { MatterDataProvider } from "@/lib/matter-data-context";
import { MatterDetailProvider } from "@/lib/matter-detail-context";
import { MatterHeader } from "@/components/legal/matter-header";
import { MatterTabBar } from "@/components/legal/matter-tab-bar";

export default function MatterLayout({ children }: { children: React.ReactNode }) {
  return (
    <MatterDataProvider>
      <MatterDetailProvider>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <MatterHeader />
          <MatterTabBar />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </div>
      </MatterDetailProvider>
    </MatterDataProvider>
  );
}
