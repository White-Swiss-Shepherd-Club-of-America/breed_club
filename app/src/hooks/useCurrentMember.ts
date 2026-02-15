/**
 * Hook to fetch and cache the current member profile.
 * Uses Clerk's session token for auth.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Member } from "@breed-club/shared";

interface MemberResponse {
  member: Member | null;
}

export function useCurrentMember() {
  const { getToken, isSignedIn } = useAuth();

  const query = useQuery({
    queryKey: ["currentMember"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<MemberResponse>("/members/me", { token });
    },
    enabled: isSignedIn === true,
    staleTime: 5 * 60 * 1000,
  });

  return {
    member: query.data?.member ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export function useRegisterMember() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { full_name: string; email?: string }) => {
      const token = await getToken();
      return api.post<MemberResponse>("/members/register", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentMember"] });
    },
  });
}

export function useUpdateProfile() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const token = await getToken();
      return api.patch<MemberResponse>("/members/me", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentMember"] });
    },
  });
}
