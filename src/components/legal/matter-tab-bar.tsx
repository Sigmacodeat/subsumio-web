"use client";

/**
 * MatterTabBar — URL-based tab navigation for matter sub-pages.
 * Primary tabs (5) always visible, secondary tabs (4) in overflow "More" menu.
 * Follows Miller's Law (7±2 items) by splitting into two groups.
 */

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import {
  FileText,
  FolderOpen,
  CalendarClock,
  Sparkles,
  Activity,
  ShieldAlert,
  CircleDollarSign,
  Mail,
  Users,
  Brain,
  MoreHorizontal,
} from "lucide-react";
import {
  useMatterData,
  matterTabUrl,
  PRIMARY_TABS,
  SECONDARY_TABS,
  type MatterTab,
} from "@/lib/matter-data-context";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<MatterTab, typeof FileText> = {
  overview: FileText,
  documents: FolderOpen,
  deadlines: CalendarClock,
  strategy: Sparkles,
  activity: Activity,
  evidence: ShieldAlert,
  billing: CircleDollarSign,
  communications: Mail,
  contacts: Users,
  ai: Brain,
};

const TAB_LABELS_DE: Record<MatterTab, string> = {
  overview: "Übersicht",
  documents: "Dokumente",
  deadlines: "Fristen",
  strategy: "KI",
  activity: "Verlauf",
  evidence: "Beweise",
  billing: "Kosten",
  communications: "Kommunikation",
  contacts: "Kontakte",
  ai: "Assistent",
};

const TAB_LABELS_EN: Record<MatterTab, string> = {
  overview: "Overview",
  documents: "Documents",
  deadlines: "Deadlines",
  strategy: "AI",
  activity: "Activity",
  evidence: "Evidence",
  billing: "Billing",
  communications: "Messages",
  contacts: "Contacts",
  ai: "Assistant",
};

export function MatterTabBar() {
  const { activeTab, caseSlug } = useMatterData();
  const { lang } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const labels = lang === "en" ? TAB_LABELS_EN : TAB_LABELS_DE;
  const moreRef = useRef<HTMLDivElement>(null);

  // Close "More" menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const isActive = (tab: MatterTab) => activeTab === tab;
  const isSecondaryActive = SECONDARY_TABS.includes(activeTab);

  return (
    <div className="sticky top-[var(--matter-header-height,0px)] z-20 flex items-center gap-1 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 md:px-4">
      {/* Primary tabs */}
      {PRIMARY_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab];
        const active = isActive(tab);
        return (
          <Link
            key={tab}
            href={matterTabUrl(caseSlug, tab)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors md:text-sm",
              active
                ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            )}
            onClick={() => setMoreOpen(false)}
          >
            <Icon size={14} className="shrink-0" />
            <span className={cn(active ? "inline" : "hidden", "sm:inline")}>{labels[tab]}</span>
          </Link>
        );
      })}

      {/* Secondary tabs in "More" dropdown */}
      <div className="relative ml-auto" ref={moreRef}>
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors md:text-sm",
            isSecondaryActive || moreOpen
              ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <MoreHorizontal size={14} className="shrink-0" />
          <span className="hidden sm:inline">
            {isSecondaryActive ? labels[activeTab] : lang === "en" ? "More" : "Mehr"}
          </span>
        </button>
        {moreOpen && (
          <div className="absolute top-full right-0 mt-1 min-w-[160px] rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-1 shadow-lg">
            {SECONDARY_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab];
              const active = isActive(tab);
              return (
                <Link
                  key={tab}
                  href={matterTabUrl(caseSlug, tab)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors md:text-sm",
                    active
                      ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
                      : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  )}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={14} className="shrink-0" />
                  {labels[tab]}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
