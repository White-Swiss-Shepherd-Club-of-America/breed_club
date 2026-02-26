/**
 * Hooks for membership application management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MembershipApplication, PaginatedResponse } from "@breed-club/shared";

interface ApplicationResponse {
  application: MembershipApplication;
}

export function useMyApplications() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["myApplications"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ data: MembershipApplication[] }>("/applications", { token });
    },
    enabled: isSignedIn === true,
  });
}

export function useApplicationQueue(status = "submitted", page = 1) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["applicationQueue", status, page],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<MembershipApplication>>("/applications/queue", {
        token,
        params: { status, page },
      });
    },
  });
}

export function useSubmitApplication() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      applicant_name: string;
      applicant_email: string;
      applicant_phone?: string;
      applicant_address?: string;
      membership_type: string;
      notes?: string;
      form_data?: Array<{
        field_key: string;
        label: string;
        field_type: string;
        value: string | string[] | boolean | null;
      }>;
    }) => {
      const token = await getToken();
      return api.post<ApplicationResponse>("/applications", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myApplications"] });
    },
  });
}

export function useReviewApplication() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      status: "approved" | "rejected" | "needs_revision";
      review_notes?: string;
      tier?: string;
      membership_type?: string;
    }) => {
      const token = await getToken();
      return api.patch<ApplicationResponse>(`/applications/${id}/review`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicationQueue"] });
    },
  });
}
