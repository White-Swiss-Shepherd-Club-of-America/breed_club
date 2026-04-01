/**
 * Hooks for litter management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Litter, LitterPup } from "@breed-club/shared";

interface LittersResponse {
  data: Litter[];
}

interface LitterResponse {
  litter?: Litter;
}

interface PupResponse {
  pup?: LitterPup;
}

interface SellPupResponse {
  dog: {
    id: string;
    registered_name: string;
  };
  buyer: {
    id: string;
    full_name: string;
    email: string;
  };
  pup: LitterPup;
}

export function useLitters() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["litters"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<LittersResponse>("/litters", { token });
    },
    enabled: isSignedIn === true,
  });
}

export function useLitter(id: string | undefined) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["litter", id],
    queryFn: async () => {
      if (!id) throw new Error("Litter ID required");
      const token = await getToken();
      return api.get<Litter>(`/litters/${id}`, { token });
    },
    enabled: isSignedIn === true && !!id,
  });
}

export function useCreateLitter() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      sire_id?: string;
      dam_id?: string;
      whelp_date?: string;
      litter_name?: string;
      num_males?: number;
      num_females?: number;
      notes?: string;
    }) => {
      const token = await getToken();
      return api.post<Litter>("/litters", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["litters"] });
    },
  });
}

export function useUpdateLitter(id: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<{
      sire_id?: string;
      dam_id?: string;
      whelp_date?: string;
      litter_name?: string;
      num_males?: number;
      num_females?: number;
      notes?: string;
    }>) => {
      const token = await getToken();
      return api.patch<Litter>(`/litters/${id}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["litters"] });
      queryClient.invalidateQueries({ queryKey: ["litter", id] });
    },
  });
}

export function useSireApprovals() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["sireApprovals"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<LittersResponse>("/litters/sire-approvals", { token });
    },
    enabled: isSignedIn === true,
  });
}

export function useRespondSireApproval(litterId: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: { status: "approved" | "rejected"; notes?: string }) => {
      const token = await getToken();
      return api.post<Litter>(`/litters/${litterId}/sire-approve`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sireApprovals"] });
      queryClient.invalidateQueries({ queryKey: ["litters"] });
    },
  });
}

export function useAddPup(litterId: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      call_name?: string;
      sex?: "male" | "female";
      color?: string;
      coat_type?: string;
      notes?: string;
    }) => {
      const token = await getToken();
      return api.post<LitterPup>(`/litters/${litterId}/pups`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["litter", litterId] });
      queryClient.invalidateQueries({ queryKey: ["litters"] });
    },
  });
}

export function useUpdatePup(litterId: string, pupId: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<{
      call_name?: string;
      sex?: "male" | "female";
      color?: string;
      coat_type?: string;
      status?: "available" | "reserved" | "sold" | "retained" | "deceased";
      notes?: string;
    }>) => {
      const token = await getToken();
      return api.patch<LitterPup>(`/litters/${litterId}/pups/${pupId}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["litter", litterId] });
      queryClient.invalidateQueries({ queryKey: ["litters"] });
    },
  });
}

export function useSellPup(litterId: string, pupId: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      buyer_contact_id?: string;
      buyer_email?: string;
      buyer_name?: string;
      registered_name: string;
    }) => {
      const token = await getToken();
      return api.post<SellPupResponse>(`/litters/${litterId}/pups/${pupId}/sell`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["litter", litterId] });
      queryClient.invalidateQueries({ queryKey: ["litters"] });
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
    },
  });
}

export function useAdminLitters(page = 1, status = "all") {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["adminLitters", page, status],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ data: Litter[]; meta: { page: number; limit: number; total: number; pages: number } }>("/admin/litters", {
        token,
        params: { page, status },
      });
    },
  });
}

export function usePendingLitters(page = 1) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["pendingLitters", page],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ data: Litter[]; meta: { page: number; limit: number; total: number; pages: number } }>("/admin/litters/pending", {
        token,
        params: { page },
      });
    },
  });
}

export function useApproveLitter() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post<{ litter: Litter }>(`/admin/litters/${id}/approve`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingLitters"] });
      queryClient.invalidateQueries({ queryKey: ["litters"] });
    },
  });
}

export function useRejectLitter() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post<{ litter: Litter }>(`/admin/litters/${id}/reject`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingLitters"] });
      queryClient.invalidateQueries({ queryKey: ["litters"] });
    },
  });
}

export function usePublicAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      return api.get<LittersResponse>("/public/announcements", {});
    },
  });
}
