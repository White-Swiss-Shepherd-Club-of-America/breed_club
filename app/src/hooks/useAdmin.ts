/**
 * Hooks for admin functionality.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Member, Organization, HealthTestType, PaginatedResponse } from "@breed-club/shared";

export function useAdminMembers(page = 1) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["adminMembers", page],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Member>>("/admin/members", { token, params: { page } });
    },
  });
}

export function useUpdateMember() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const token = await getToken();
      return api.patch<{ member: Member }>(`/admin/members/${id}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminMembers"] });
    },
  });
}

export function useDeleteMember() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.delete(`/admin/members/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminMembers"] });
    },
  });
}

export function useOrganizations() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["adminOrganizations"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ data: Organization[] }>("/admin/organizations", { token });
    },
  });
}

export function useHealthTestTypes() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["adminHealthTestTypes"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ data: HealthTestType[] }>("/admin/health-test-types", { token });
    },
  });
}

export function useCreateHealthTestType() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const token = await getToken();
      return api.post<{ health_test_type: HealthTestType }>("/admin/health-test-types", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminHealthTestTypes"] });
    },
  });
}

export function useUpdateHealthTestType() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const token = await getToken();
      return api.patch<{ health_test_type: HealthTestType }>(`/admin/health-test-types/${id}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminHealthTestTypes"] });
    },
  });
}

export function useDeleteHealthTestType() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.delete(`/admin/health-test-types/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminHealthTestTypes"] });
    },
  });
}

export function useCreateOrganization() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const token = await getToken();
      return api.post<{ organization: Organization }>("/admin/organizations", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminOrganizations"] });
    },
  });
}

export function useUpdateOrganization() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const token = await getToken();
      return api.patch<{ organization: Organization }>(`/admin/organizations/${id}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminOrganizations"] });
    },
  });
}

export function useDeleteOrganization() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.delete(`/admin/organizations/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminOrganizations"] });
    },
  });
}
