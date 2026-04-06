import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { HealthRating } from "@breed-club/shared";

export type ClearanceStatus = "pending" | "approved" | "rejected";
export type ClearanceStatusFilter = ClearanceStatus | "all";
export type ClearanceSortBy = "created_at" | "test_date" | "status" | "dog_name" | "test_type";
export type ClearanceSortDir = "asc" | "desc";

export interface MyClearance {
  id: string;
  dog_id: string;
  result: string;
  result_data?: Record<string, unknown> | null;
  result_detail?: string | null;
  result_score?: number | null;
  result_score_left?: number | null;
  result_score_right?: number | null;
  test_date: string;
  expiration_date?: string | null;
  certificate_number?: string | null;
  certificate_url?: string | null;
  status: ClearanceStatus;
  verified_at?: string | null;
  notes?: string | null;
  created_at: string;
  can_edit: boolean;
  dog: {
    id: string;
    registered_name: string;
    call_name?: string | null;
    health_rating?: HealthRating | null;
  };
  test_type: {
    id: string;
    name: string;
    short_name: string;
    category: string;
  };
  organization: {
    id: string;
    name: string;
    type: string;
  };
}

interface MyClearancesResponse {
  clearances: MyClearance[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export function useMyClearances(filters: {
  status: ClearanceStatusFilter;
  sortBy: ClearanceSortBy;
  sortDir: ClearanceSortDir;
  page: number;
  limit?: number;
}) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["myClearances", filters],
    queryFn: async () => {
      const token = await getToken();
      return api.get<MyClearancesResponse>("/health/clearances", {
        token,
        params: {
          status: filters.status,
          sort_by: filters.sortBy,
          sort_dir: filters.sortDir,
          page: filters.page,
          limit: filters.limit ?? 20,
        },
      });
    },
    enabled: isSignedIn === true,
  });
}

export function useUpdateClearance() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dogId,
      clearanceId,
      payload,
    }: {
      dogId: string;
      clearanceId: string;
      payload: {
        result?: string;
        test_date?: string;
        certificate_number?: string;
        certificate_url?: string;
        notes?: string;
      };
    }) => {
      const token = await getToken();
      return api.patch(`/health/dogs/${dogId}/clearances/${clearanceId}`, payload, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["myClearances"] });
      queryClient.invalidateQueries({ queryKey: ["dogs", variables.dogId, "clearances"] });
    },
  });
}

export function useDeleteClearance() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dogId, clearanceId }: { dogId: string; clearanceId: string }) => {
      const token = await getToken();
      return api.delete(`/health/dogs/${dogId}/clearances/${clearanceId}`, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["myClearances"] });
      queryClient.invalidateQueries({ queryKey: ["dogs", variables.dogId, "clearances"] });
    },
  });
}
