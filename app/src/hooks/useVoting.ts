/**
 * Hooks for voting / elections functionality.
 */

import { useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  VotingTier,
  MemberVotingTierAssignment,
  Election,
  ElectionResults,
} from "@breed-club/shared";

// ─── Voting Tiers (Admin) ──────────────────────────────────────────────────

export function useVotingTiers() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["votingTiers"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<(VotingTier & { member_count: number })[]>("/voting/tiers", { token });
    },
  });
}

export function useCreateVotingTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; points: number; sort_order?: number; is_active?: boolean }) => {
      const token = await getToken();
      return api.post<VotingTier>("/voting/tiers", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votingTiers"] });
    },
  });
}

export function useUpdateVotingTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const token = await getToken();
      return api.patch<VotingTier>(`/voting/tiers/${id}`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votingTiers"] });
    },
  });
}

export function useDeleteVotingTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.delete(`/voting/tiers/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votingTiers"] });
    },
  });
}

// ─── Tier Assignments (Admin) ──────────────────────────────────────────────

interface TierAssignment {
  id: string;
  member_id: string;
  voting_tier_id: string;
  assigned_at: string;
  assigned_by: string | null;
  member_name: string | null;
  member_email: string | null;
  tier_name: string | null;
  tier_points: number | null;
}

export function useVotingTierAssignments() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["votingTierAssignments"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<TierAssignment[]>("/voting/tiers/assignments", { token });
    },
  });
}

export function useAssignVotingTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { member_id: string; voting_tier_id: string }) => {
      const token = await getToken();
      return api.post("/voting/tiers/assign", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votingTierAssignments"] });
      queryClient.invalidateQueries({ queryKey: ["votingTiers"] });
    },
  });
}

export function useBulkAssignVotingTier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { member_ids: string[]; voting_tier_id: string }) => {
      const token = await getToken();
      return api.post("/voting/tiers/assign/bulk", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votingTierAssignments"] });
      queryClient.invalidateQueries({ queryKey: ["votingTiers"] });
    },
  });
}

export function useRemoveVotingTierAssignment() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const token = await getToken();
      return api.delete(`/voting/tiers/assignments/${memberId}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["votingTierAssignments"] });
      queryClient.invalidateQueries({ queryKey: ["votingTiers"] });
    },
  });
}

// ─── Elections ─────────────────────────────────────────────────────────────

export function useElections() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["elections"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<Election[]>("/voting/elections", { token });
    },
  });
}

export function useElection(id: string) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["election", id],
    queryFn: async () => {
      const token = await getToken();
      return api.get<Election>(`/voting/elections/${id}`, { token });
    },
    enabled: !!id,
  });
}

export function useCreateElection() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const token = await getToken();
      return api.post<Election>("/voting/elections", data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
    },
  });
}

export function useUpdateElection() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const token = await getToken();
      return api.patch<Election>(`/voting/elections/${id}`, data, { token });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      queryClient.invalidateQueries({ queryKey: ["election", variables.id] });
    },
  });
}

export function useDeleteElection() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.delete(`/voting/elections/${id}`, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
    },
  });
}

// ─── Voting ────────────────────────────────────────────────────────────────

export function useCastBallot() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ electionId, votes }: { electionId: string; votes: { question_id: string; option_id: string }[] }) => {
      const token = await getToken();
      return api.post(`/voting/elections/${electionId}/vote`, { votes }, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      queryClient.invalidateQueries({ queryKey: ["election"] });
    },
  });
}

// ─── Results ───────────────────────────────────────────────────────────────

export function useElectionResults(id: string, enabled = true) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["electionResults", id],
    queryFn: async () => {
      const token = await getToken();
      return api.get<ElectionResults>(`/voting/elections/${id}/results`, { token });
    },
    enabled: enabled && !!id,
  });
}

// ─── Participation (Admin) ─────────────────────────────────────────────────

interface ParticipationData {
  election_id: string;
  total_questions: number;
  participants: {
    member_id: string;
    name: string;
    voted_at: string;
    questions_voted: number;
  }[];
}

export function useElectionParticipation(id: string) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["electionParticipation", id],
    queryFn: async () => {
      const token = await getToken();
      return api.get<ParticipationData>(`/voting/elections/${id}/participation`, { token });
    },
    enabled: !!id,
  });
}
