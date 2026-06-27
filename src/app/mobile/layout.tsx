"use client";

/**
 * Mobile-optimized shell layout for Capacitor native app.
 *
 * This layout wraps the 5 core mobile screens with a native-feel bottom
 * tab bar. It applies safe-area insets (notch / home-bar) via CSS env().
 * Pages: /mobile/cases  /mobile/deadlines  /mobile/note
 *        /mobile/time   /mobile/document
 *
 * The shell is also accessible as a PWA on mobile browsers at /mobile.
 */

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { FolderOpen, CalendarClock, PenLine, Clock, FileText } from "lucide-react";

const TABS = [
  { path: "/mobile/cases", label: "Akten", icon: FolderOpen },
  { path: "/mobile/deadlines", label: "Fristen", icon: CalendarClock },
  { path: "/mobile/note", label: "Notiz", icon: PenLine },
  { path: "/mobile/time", label: "Zeit", icon: Clock },
  { path: "/mobile/document", label: "Dokument", icon: FileText },
];

export default function MobileLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh", // dynamic viewport height (mobile keyboard safe)
        background: "#06060f",
        color: "#e8e8f0",
        overflow: "hidden",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        // Top safe area (status bar / notch)
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Scrollable content area */}
      <div
        style={
          {
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties
        }
      >
        {children}
      </div>

      {/* Bottom Tab Bar */}
      <nav
        style={{
          display: "flex",
          background: "#0a0a18",
          borderTop: "1px solid #1e1e3a",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          flexShrink: 0,
        }}
      >
        {TABS.map(({ path, label, icon: Icon }) => {
          const active = pathname.startsWith(path);
          return (
            <a
              key={path}
              href={path}
              style={
                {
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  padding: "8px 0 6px",
                  color: active ? "#6366f1" : "#6a6a8a",
                  textDecoration: "none",
                  transition: "color 0.1s",
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span
                style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: "0.2px" }}
              >
                {label}
              </span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
