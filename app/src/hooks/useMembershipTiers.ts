/**
 * Hooks for managing membership tiers (admin).
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MembershipTier } from "@breed-club/shared";

export function useAdminMembershipTiers() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["adminMembershipTiers"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ data: MembershipTier[] }>("/admin/membership-tiers", { token });
    },
  });
}

export function useCreateMembershipTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { slug: string; label: string; level: number; color?: string | null; is_default?: boolean; sort_order?: number }) => {
      const token = await getToken();
      return api.post<{ tier: MembershipTier }>("/admin/membership-tiers", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminMembershipTiers"] });
      queryClient.invalidateQueries({ queryKey: ["club"] });
    },
  });
}

export function useUpdateMembershipTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; label?: string; level?: number; color?: string | null; is_default?: boolean; sort_order?: number }) => {
      const token = await getToken();
      return api.patch<{ tier: MembershipTier }>(`/admin/membership-tiers/${id}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminMembershipTiers"] });
      queryClient.invalidateQueries({ queryKey: ["club"] });
    },
  });
}

export function useDeleteMembershipTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.delete(`/admin/membership-tiers/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminMembershipTiers"] });
      queryClient.invalidateQueries({ queryKey: ["club"] });
    },
  });
}
