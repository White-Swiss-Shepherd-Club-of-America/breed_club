/**
 * Hooks for dog registry management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Dog, HealthRating, PaginatedResponse, DogRegistration, DogOwnershipTransfer, DogProgenyResponse } from "@breed-club/shared";

interface DogResponse {
  dog: Dog;
  canManageClearances?: boolean;
  pendingTransfer?: DogOwnershipTransfer | null;
}

interface RegistrationResponse {
  registration: DogRegistration;
}

interface PedigreeDogData {
  id: string;
  registered_name: string;
  call_name?: string;
  sex?: string;
  date_of_birth?: string;
  sire_id?: string;
  dam_id?: string;
  health_rating?: HealthRating | null;
  sire?: PedigreeDogData | null;
  dam?: PedigreeDogData | null;
}

interface PedigreeResponse {
  pedigree: {
    dog: PedigreeDogData;
    sire: PedigreeDogData | null;
    dam: PedigreeDogData | null;
  };
}

export function useDogs(page = 1, search?: string, sex?: "male" | "female", ownedOnly?: boolean, includeHistorical?: boolean) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogs", page, search, sex, ownedOnly, includeHistorical],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Dog>>("/dogs", {
        token,
        params: {
          page,
          search,
          sex,
          owned_only: ownedOnly ? "true" : undefined,
          include_historical: includeHistorical ? "true" : undefined,
        },
      });
    },
    enabled: isSignedIn === true,
  });
}

export function useDog(id: string | undefined) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dog", id],
    queryFn: async () => {
      if (!id) throw new Error("Dog ID required");
      const token = await getToken();
      return api.get<DogResponse>(`/dogs/${id}`, { token });
    },
    enabled: isSignedIn === true && !!id,
  });
}

export function useDogPedigree(id: string | undefined, depth = 3) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogPedigree", id, depth],
    queryFn: async () => {
      if (!id) throw new Error("Dog ID required");
      const token = await getToken();
      return api.get<PedigreeResponse>(`/dogs/${id}/pedigree`, {
        token,
        params: { depth },
      });
    },
    enabled: isSignedIn === true && !!id,
  });
}

export function useDogProgeny(id: string | undefined, depth = 1) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogProgeny", id, depth],
    queryFn: async () => {
      if (!id) throw new Error("Dog ID required");
      const token = await getToken();
      return api.get<DogProgenyResponse>(`/dogs/${id}/progeny`, {
        token,
        params: { depth },
      });
    },
    enabled: isSignedIn === true && !!id,
  });
}

type AncestorRef = string | { registered_name: string } | null;

interface PedigreeTree {
  sire?: AncestorRef;
  dam?: AncestorRef;
  sire_sire?: AncestorRef;
  sire_dam?: AncestorRef;
  dam_sire?: AncestorRef;
  dam_dam?: AncestorRef;
  sire_sire_sire?: AncestorRef;
  sire_sire_dam?: AncestorRef;
  sire_dam_sire?: AncestorRef;
  sire_dam_dam?: AncestorRef;
  dam_sire_sire?: AncestorRef;
  dam_sire_dam?: AncestorRef;
  dam_dam_sire?: AncestorRef;
  dam_dam_dam?: AncestorRef;
}

export function useCreateDog() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      registered_name: string;
      call_name?: string | null;
      microchip_number?: string | null;
      sex?: "male" | "female" | null;
      date_of_birth?: string | null;
      date_of_death?: string | null;
      color?: string | null;
      coat_type?: string | null;
      sire_id?: string | { registered_name: string } | null;
      dam_id?: string | { registered_name: string } | null;
      pedigree?: PedigreeTree;
      owner_id?: string | null;
      breeder_id?: string | null;
      is_public?: boolean;
      registrations?: Array<{
        organization_id: string;
        registration_number: string;
        registration_url?: string;
      }>;
    }) => {
      const token = await getToken();
      return api.post<DogResponse>("/dogs", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
    },
  });
}

export function useUpdateDog() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      registered_name?: string;
      call_name?: string;
      microchip_number?: string;
      sex?: "male" | "female";
      date_of_birth?: string;
      date_of_death?: string;
      color?: string;
      coat_type?: string;
      sire_id?: string;
      dam_id?: string;
      pedigree?: PedigreeTree;
      owner_id?: string;
      breeder_id?: string;
      is_public?: boolean;
    }) => {
      const token = await getToken();
      return api.patch<DogResponse>(`/dogs/${id}`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
      queryClient.invalidateQueries({ queryKey: ["dog", variables.id] });
    },
  });
}

export function useAdminUpdateDog() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      registered_name?: string;
      call_name?: string;
      microchip_number?: string;
      sex?: "male" | "female";
      date_of_birth?: string;
      date_of_death?: string;
      color?: string;
      coat_type?: string;
      sire_id?: string | null;
      dam_id?: string | null;
      pedigree?: PedigreeTree;
      owner_id?: string | null;
      breeder_id?: string | null;
      is_public?: boolean;
      is_historical?: boolean;
      photo_url?: string;
    }) => {
      const token = await getToken();
      return api.patch<DogResponse>(`/admin/dogs/${id}`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
      queryClient.invalidateQueries({ queryKey: ["dog", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["pendingDogs"] });
    },
  });
}

export function useAddDogRegistration() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dogId,
      ...data
    }: {
      dogId: string;
      organization_id: string;
      registration_number: string;
      registration_url?: string;
    }) => {
      const token = await getToken();
      return api.post<RegistrationResponse>(`/dogs/${dogId}/registrations`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dog", variables.dogId] });
    },
  });
}

export function usePendingDogs(page = 1) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["pendingDogs", page],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Dog>>("/admin/dogs/pending", {
        token,
        params: { page },
      });
    },
  });
}

export function useApproveDog() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post<DogResponse>(`/admin/dogs/${id}/approve`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingDogs"] });
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
    },
  });
}

export function useRejectDog() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post<DogResponse>(`/admin/dogs/${id}/reject`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingDogs"] });
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
    },
  });
}

// ─── Ownership Transfers ──────────────────────────────────────────────────

export function useTransferDog() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dogId,
      ...data
    }: {
      dogId: string;
      new_owner_id: string;
      reason?: string;
      notes?: string;
    }) => {
      const token = await getToken();
      return api.post<{ transfer: DogOwnershipTransfer }>(`/dogs/${dogId}/transfer`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
      queryClient.invalidateQueries({ queryKey: ["dog", variables.dogId] });
    },
  });
}

export function usePendingTransfers(page = 1) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["pendingTransfers", page],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<DogOwnershipTransfer>>("/admin/transfers/pending", {
        token,
        params: { page },
      });
    },
  });
}

export function useApproveTransfer() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post<{ transfer: DogOwnershipTransfer }>(`/admin/transfers/${id}/approve`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingTransfers"] });
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
    },
  });
}

export function useRejectTransfer() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post<{ transfer: DogOwnershipTransfer }>(`/admin/transfers/${id}/reject`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingTransfers"] });
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
    },
  });
}

export function useRecalculateHealthRating() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dogId: string) => {
      const token = await getToken();
      return api.post<{ health_rating: HealthRating | null }>(
        `/admin/dogs/${dogId}/recalculate`,
        {},
        { token }
      );
    },
    onSuccess: (_, dogId) => {
      queryClient.invalidateQueries({ queryKey: ["dog", dogId] });
    },
  });
}
