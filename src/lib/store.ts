"use client";

import { create } from "zustand";
import type { BrainStats, RecentQuery, SearchResult } from "./types";

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { slug: string; title: string; quote: string; confidence: number }[];
  gaps?: string[];
  isStreaming?: boolean;
  createdAt: Date;
}

interface SubsumioStore {
  stats: BrainStats | null;
  setStats: (stats: BrainStats) => void;

  recentQueries: RecentQuery[];
  setRecentQueries: (queries: RecentQuery[]) => void;

  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;

  queryMessages: QueryMessage[];
  addMessage: (msg: Omit<QueryMessage, "id" | "createdAt">) => string;
  updateMessage: (id: string, updates: Partial<QueryMessage>) => void;
  clearMessages: () => void;

  queryMode: "conservative" | "balanced" | "tokenmax";
  setQueryMode: (mode: "conservative" | "balanced" | "tokenmax") => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useStore = create<SubsumioStore>((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),

  recentQueries: [],
  setRecentQueries: (queries) => set({ recentQueries: queries }),

  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),

  queryMessages: [],
  addMessage: (msg) => {
    const id = crypto.randomUUID();
    set((state) => ({
      queryMessages: [
        ...state.queryMessages,
        { ...msg, id, createdAt: new Date() },
      ],
    }));
    return id;
  },
  updateMessage: (id, updates) =>
    set((state) => ({
      queryMessages: state.queryMessages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  clearMessages: () => set({ queryMessages: [] }),

  queryMode: "balanced",
  setQueryMode: (mode) => set({ queryMode: mode }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
