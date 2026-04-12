import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AdminOverviewStats {
  dogs: {
    total: number;
    health_tested: number;
    health_tested_pct: number;
    color_distribution: {
      blue: number;
      green: number;
      yellow: number;
      orange: number;
      red: number;
      unrated: number;
    };
  };
  members: {
    total_active: number;
    by_tier: Array<{ label: string; level: number; count: number }>;
  };
  litters: {
    total: number;
    total_puppies: number;
  };
  pending_applications: number;
}

export function useAdminOverviewStats(enabled = true) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["adminOverviewStats"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<AdminOverviewStats>("/admin/overview-stats", { token });
    },
    enabled,
    staleTime: 60_000,
  });
}
