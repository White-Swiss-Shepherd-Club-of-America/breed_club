/**
 * Hooks for dog registry management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Dog, PaginatedResponse, DogRegistration } from "@breed-club/shared";

interface DogResponse {
  dog: Dog;
}

interface RegistrationResponse {
  registration: DogRegistration;
}

interface PedigreeResponse {
  pedigree: {
    dog: Partial<Dog>;
    sire: Partial<Dog> | null;
    dam: Partial<Dog> | null;
  };
}

export function useDogs(page = 1, search?: string) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogs", page, search],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Dog>>("/dogs", {
        token,
        params: { page, search },
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
