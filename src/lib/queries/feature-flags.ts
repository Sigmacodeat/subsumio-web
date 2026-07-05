"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  allowedPlans: string[];
  allowedRoles: string[];
  updatedAt: string;
  updatedBy: string;
}

export function useFeatureFlags() {
  return useQuery<{ flags: FeatureFlag[] }>({
    queryKey: ["feature-flags"],
    queryFn: () => api.featureFlags.list(),
    staleTime: 30 * 1000,
  });
}

export function useCreateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.featureFlags.create>[0]) =>
      api.featureFlags.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags"] }),
  });
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      ...input
    }: { key: string } & Parameters<typeof api.featureFlags.update>[1]) =>
      api.featureFlags.update(key, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags"] }),
  });
}

export function useDeleteFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.featureFlags.delete(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags"] }),
  });
}

export function useFeatureFlagCheck(key?: string) {
  return useQuery<{
    key?: string;
    enabled: boolean;
    flags?: Array<{ key: string; name: string; enabled: boolean }>;
  }>({
    queryKey: ["feature-flags", "check", key],
    queryFn: () => api.featureFlags.check(key),
    staleTime: 60 * 1000,
  });
}
