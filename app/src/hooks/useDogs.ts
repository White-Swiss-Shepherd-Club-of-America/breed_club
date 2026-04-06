/**
 * Hooks for dog registry management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Dog, DogAuditLog, DogFilterOptions, HealthRating, HealthCondition, PaginatedResponse, DogRegistration, DogOwnershipTransfer, DogProgenyResponse, BreedingStatus } from "@breed-club/shared";

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

export interface DogFilters {
  page?: number;
  search?: string;
  sex?: "male" | "female";
  breedingStatus?: BreedingStatus;
  ownedOnly?: boolean;
  includeHistorical?: boolean;
  healthScoreMin?: number;
  healthScoreMax?: number;
  dobFrom?: string;
  dobTo?: string;
  breeder?: string;
  owner?: string;
  coatType?: string;
  color?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function useDogs(filters: DogFilters = {}) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogs", filters],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Dog>>("/dogs", {
        token,
        params: {
          page: filters.page || 1,
          search: filters.search,
          sex: filters.sex,
          breeding_status: filters.breedingStatus,
          owned_only: filters.ownedOnly ? "true" : undefined,
          include_historical: filters.includeHistorical ? "true" : undefined,
          health_score_min: filters.healthScoreMin,
          health_score_max: filters.healthScoreMax,
          dob_from: filters.dobFrom,
          dob_to: filters.dobTo,
          breeder: filters.breeder,
          owner: filters.owner,
          coat_type: filters.coatType,
          color: filters.color,
          sort_by: filters.sortBy,
          sort_dir: filters.sortDir,
        },
      });
    },
    enabled: isSignedIn === true,
  });
}

export function useDogFilterOptions() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogFilterOptions"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<DogFilterOptions>("/dogs/filter-options", { token });
    },
    enabled: isSignedIn === true,
    staleTime: 5 * 60 * 1000,
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
      is_deceased?: boolean;
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

// ─── Audit Log ─────────────────────────────────────────────────────────────

export function useDogAuditLog(dogId: string | undefined) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["dogAuditLog", dogId],
    queryFn: async () => {
      if (!dogId) throw new Error("Dog ID required");
      const token = await getToken();
      return api.get<{ data: DogAuditLog[] }>(`/admin/dogs/${dogId}/audit-log`, { token });
    },
    enabled: isSignedIn === true && !!dogId,
  });
}

// ─── Breeding Metadata ──────────────────────────────────────────────────────

export function useUpdateBreedingMetadata() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dogId,
      ...data
    }: {
      dogId: string;
      breeding_status?: BreedingStatus;
      stud_service_available?: boolean;
      frozen_semen_available?: boolean;
    }) => {
      const token = await getToken();
      return api.patch<{ dog: Dog }>(`/dogs/${dogId}/breeding`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dog", variables.dogId] });
      queryClient.invalidateQueries({ queryKey: ["dogs"] });
    },
  });
}

// ─── Health Conditions ──────────────────────────────────────────────────────

export function useHealthConditions(dogId: string | undefined) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["healthConditions", dogId],
    queryFn: async () => {
      if (!dogId) throw new Error("Dog ID required");
      const token = await getToken();
      return api.get<{ conditions: HealthCondition[] }>(`/health/dogs/${dogId}/conditions`, { token });
    },
    enabled: isSignedIn === true && !!dogId,
  });
}

export function useCreateHealthCondition() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dogId,
      ...data
    }: {
      dogId: string;
      condition_name: string;
      category?: string;
      diagnosis_date?: string;
      resolved_date?: string;
      severity?: string;
      notes?: string;
    }) => {
      const token = await getToken();
      return api.post<{ condition: HealthCondition }>(`/health/dogs/${dogId}/conditions`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["healthConditions", variables.dogId] });
    },
  });
}

export function useUpdateHealthCondition() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dogId,
      conditionId,
      ...data
    }: {
      dogId: string;
      conditionId: string;
      condition_name?: string;
      category?: string;
      diagnosis_date?: string;
      resolved_date?: string;
      severity?: string;
      notes?: string;
    }) => {
      const token = await getToken();
      return api.patch<{ condition: HealthCondition }>(
        `/health/dogs/${dogId}/conditions/${conditionId}`,
        data,
        { token }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["healthConditions", variables.dogId] });
    },
  });
}

export function useDeleteHealthCondition() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dogId, conditionId }: { dogId: string; conditionId: string }) => {
      const token = await getToken();
      return api.delete<{ ok: boolean }>(`/health/dogs/${dogId}/conditions/${conditionId}`, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["healthConditions", variables.dogId] });
    },
  });
}
