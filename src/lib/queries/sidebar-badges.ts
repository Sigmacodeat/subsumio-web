"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SidebarBadge {
  count: number;
  variant: "danger" | "warning" | "info";
}

export type SidebarBadges = Record<string, SidebarBadge>;

export function useSidebarBadges() {
  return useQuery<SidebarBadges>({
    queryKey: ["sidebar-badges"],
    queryFn: async () => {
      const res = await api.get<{ data: SidebarBadges }>("/api/dashboard/badges");
      return res.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
