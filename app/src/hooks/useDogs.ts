/**
 * Hooks for dog registry management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Dog, PaginatedResponse, DogRegistration, DogOwnershipTransfer } from "@breed-club/shared";

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

export function useDogs(page = 1, search?: string, sex?: "male" | "female", ownedOnly?: boolean) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogs", page, search, sex, ownedOnly],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Dog>>("/dogs", {
        token,
        params: { page, search, sex, owned_only: ownedOnly ? "true" : undefined },
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
      owner_id?: string | null;
      breeder_id?: string | null;
      is_public?: boolean;
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
