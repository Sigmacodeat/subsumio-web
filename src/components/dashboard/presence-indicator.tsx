"use client";

import { usePresence, type PresenceUser } from "@/lib/use-presence";
import { useMe } from "@/lib/queries/auth";
import { cn } from "@/lib/utils";

interface PresenceIndicatorProps {
  pageSlug: string;
  className?: string;
  maxAvatars?: number;
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
];

function getInitials(email: string): string {
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function PresenceIndicator({ pageSlug, className, maxAvatars = 5 }: PresenceIndicatorProps) {
  const meQuery = useMe();
  const user = meQuery.data?.user
    ? { id: meQuery.data.user.id, email: meQuery.data.user.email || "" }
    : null;
  const activeUsers = usePresence(pageSlug, user);

  if (activeUsers.length === 0) return null;

  const visible = activeUsers.slice(0, maxAvatars);
  const remaining = activeUsers.length - maxAvatars;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <div
            key={user.userId}
            title={`${user.email} — aktiv seit ${new Date(user.joinedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border-2 border-[color:var(--ds-surface)] text-[10px] font-semibold text-white shadow-sm",
              getColorForId(user.userId)
            )}
          >
            {getInitials(user.email)}
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <span className="text-xs text-[color:var(--ds-text-muted)]">+{remaining}</span>
      )}
      <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        {activeUsers.length === 1 ? "1 Person" : `${activeUsers.length} Personen`}
      </span>
    </div>
  );
}
