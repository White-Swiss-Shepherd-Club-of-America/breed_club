/**
 * Hooks for membership form field management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MembershipFormField } from "@breed-club/shared";

// ─── Public (no auth) ────────────────────────────────────────────────────────

export function usePublicFormFields() {
  return useQuery({
    queryKey: ["publicFormFields"],
    queryFn: () =>
      api.get<{ data: MembershipFormField[] }>("/public/membership-form"),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// ─── Admin (auth required) ───────────────────────────────────────────────────

export function useAdminFormFields() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["adminFormFields"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ data: MembershipFormField[] }>("/admin/form-fields", { token });
    },
  });
}

export function useCreateFormField() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      field_key: string;
      label: string;
      description?: string | null;
      field_type: string;
      options?: string[] | null;
      required?: boolean;
      sort_order?: number;
      is_active?: boolean;
    }) => {
      const token = await getToken();
      return api.post<{ data: MembershipFormField }>("/admin/form-fields", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminFormFields"] });
      queryClient.invalidateQueries({ queryKey: ["publicFormFields"] });
    },
  });
}

export function useUpdateFormField() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      label?: string;
      description?: string | null;
      field_type?: string;
      options?: string[] | null;
      required?: boolean;
      sort_order?: number;
      is_active?: boolean;
    }) => {
      const token = await getToken();
      return api.patch<{ data: MembershipFormField }>(
        `/admin/form-fields/${id}`,
        data,
        { token }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminFormFields"] });
      queryClient.invalidateQueries({ queryKey: ["publicFormFields"] });
    },
  });
}

export function useDeleteFormField() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.delete<{ success: boolean }>(`/admin/form-fields/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminFormFields"] });
      queryClient.invalidateQueries({ queryKey: ["publicFormFields"] });
    },
  });
}

export function useReorderFormFields() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (field_ids: string[]) => {
      const token = await getToken();
      return api.put<{ success: boolean }>(
        "/admin/form-fields/reorder",
        { field_ids },
        { token }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminFormFields"] });
    },
  });
}
