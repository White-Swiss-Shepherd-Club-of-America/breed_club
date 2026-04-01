/**
 * Hook to fetch public club info (branding, name).
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Club, MembershipTier } from "@breed-club/shared";

type PublicClub = Pick<
  Club,
  "id" | "name" | "slug" | "breed_name" | "logo_url" | "primary_color" | "secondary_color"
> & {
  membership_tiers: MembershipTier[];
};

export function useClub() {
  return useQuery({
    queryKey: ["club"],
    queryFn: () => api.get<{ club: PublicClub }>("/public/club"),
    staleTime: 30 * 60 * 1000, // 30 minutes — club info rarely changes
  });
}
