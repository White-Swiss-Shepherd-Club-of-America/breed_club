/**
 * Hooks for contact management.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Contact, PaginatedResponse } from "@breed-club/shared";

interface ContactResponse {
  contact: Contact;
}

export function useContacts(search?: string, page = 1) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["contacts", search, page],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Contact>>("/contacts", {
        token,
        params: { search, page, limit: 10 },
      });
    },
    enabled: isSignedIn === true,
  });
}

export function useSearchContacts(query: string) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["contacts", "search", query],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse<Contact>>("/contacts", {
        token,
        params: { search: query, limit: 10 },
      });
    },
    enabled: isSignedIn === true && query.length >= 2,
    placeholderData: (prev) => prev,
  });
}

export function useContact(id: string | undefined) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      if (!id) throw new Error("Contact ID required");
      const token = await getToken();
      return api.get<ContactResponse>(`/contacts/${id}`, { token });
    },
    enabled: isSignedIn === true && !!id,
  });
}

export function useCreateContact() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      full_name: string;
      kennel_name?: string;
      email?: string;
      phone?: string;
      city?: string;
      state?: string;
      country?: string;
    }) => {
      const token = await getToken();
      return api.post<ContactResponse>("/contacts", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateContact() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      full_name?: string;
      kennel_name?: string;
      email?: string;
      phone?: string;
      city?: string;
      state?: string;
      country?: string;
    }) => {
      const token = await getToken();
      return api.patch<ContactResponse>(`/contacts/${id}`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact", variables.id] });
    },
  });
}
