import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DashboardCounts {
  applications: number;
  dogs: number;
  clearances: number;
  litters: number;
  transfers: number;
}

export function useDashboardCounts(enabled = true) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["dashboardCounts"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<DashboardCounts>("/admin/dashboard-counts", { token });
    },
    enabled,
    staleTime: 60_000,
  });
}
