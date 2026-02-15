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
      expected_date?: string;
      num_puppies_born?: number;
      num_puppies_survived?: number;
      status?: "planned" | "expected" | "born" | "weaned" | "closed";
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
      expected_date?: string;
      num_puppies_born?: number;
      num_puppies_survived?: number;
      status?: "planned" | "expected" | "born" | "weaned" | "closed";
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
      buyer_email: string;
      buyer_name: string;
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

export function usePublicAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      return api.get<LittersResponse>("/public/announcements", {});
    },
  });
}
