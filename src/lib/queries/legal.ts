import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Frist = Awaited<ReturnType<typeof api.legal.fristen>>["fristen"][number];

export function useFristen(params?: {
  case?: string;
  status?: string;
  heute?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["legal", "fristen", params],
    queryFn: () => api.legal.fristen(params),
    enabled: params?.enabled ?? true,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
