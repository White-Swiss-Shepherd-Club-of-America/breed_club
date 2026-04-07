import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DogHealthSummary {
  id: string;
  name: string;
  call_name: string | null;
  clearance_count: number;
  health_score: number | null;
  health_color: string | null;
}

export interface MyHealthStats {
  own_dogs: {
    total: number;
    tested: number;
    clearances: number;
    dogs: DogHealthSummary[];
  };
  progeny?: {
    total: number;
    tested: number;
    clearances: number;
    avg_score: number | null;
  };
  _cached_at?: string;
}

export function useMyHealthStats(enabled = true) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["health", "myStats"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<MyHealthStats>("/health/my-stats", { token });
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}
