/**
 * Hooks for litter ad management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LitterAd } from "@breed-club/shared";

interface AdsResponse {
  data: LitterAd[];
}

interface AdResponse {
  data: LitterAd;
}

export function useMyAds() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["ads", "mine"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<AdsResponse>("/ads", { token });
    },
    enabled: isSignedIn === true,
  });
}

export function useCreateAd() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string | null;
      image_url?: string | null;
      contact_url?: string | null;
    }) => {
      const token = await getToken();
      return api.post<AdResponse>("/ads", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ads"] });
    },
  });
}

export function useUpdateAd(id: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      title?: string;
      description?: string | null;
      image_url?: string | null;
      contact_url?: string | null;
    }) => {
      const token = await getToken();
      return api.patch<AdResponse>(`/ads/${id}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ads"] });
    },
  });
}

export function useSubmitAd(id: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return api.post<AdResponse>(`/ads/${id}/submit`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ads"] });
    },
  });
}

export function useDeleteAd(id: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return api.delete(`/ads/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ads"] });
    },
  });
}

export function useAdminAds(status?: string) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["ads", "admin", status],
    queryFn: async () => {
      const token = await getToken();
      return api.get<AdsResponse>("/ads/admin/all", {
        token,
        params: status ? { status } : undefined,
      });
    },
    enabled: isSignedIn === true,
  });
}

export function useReviewAd(id: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      action: "approve" | "reject" | "request_revision";
      revision_notes?: string | null;
    }) => {
      const token = await getToken();
      return api.post<AdResponse & { social_posts?: unknown[] }>(`/ads/${id}/review`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ads"] });
    },
  });
}
