/**
 * Helper hook for working with configurable membership tiers.
 * Consumes tier data from the club's public info (useClub).
 */

import { useMemo } from "react";
import { useClub } from "./useClub";
import type { Member, MembershipTier } from "@breed-club/shared";
import { SYSTEM_LEVELS } from "@breed-club/shared";

export function useTiers() {
  const { data: clubData } = useClub();
  const tiers = clubData?.club?.membership_tiers ?? [];

  const tierMap = useMemo(
    () => new Map(tiers.map((t) => [t.slug, t])),
    [tiers]
  );

  const getTier = (slug: string): MembershipTier | undefined => tierMap.get(slug);
  const getTierLabel = (slug: string): string => tierMap.get(slug)?.label ?? slug;
  const getTierColor = (slug: string): string | null => tierMap.get(slug)?.color ?? null;
  const getTierLevel = (slug: string): number => tierMap.get(slug)?.level ?? 0;
  const isAdmin = (member: Pick<Member, "tierLevel" | "is_admin"> | null | undefined): boolean =>
    !!member && (member.is_admin === true || (member.tierLevel ?? 0) >= SYSTEM_LEVELS.ADMIN);
  const hasMinLevel = (
    member: Pick<Member, "tierLevel" | "is_admin"> | null | undefined,
    level: number
  ): boolean =>
    !!member &&
    ((member.tierLevel ?? 0) >= level ||
      (member.is_admin === true && level <= SYSTEM_LEVELS.ADMIN));

  /** All tiers except "public", sorted by level */
  const assignableTiers = useMemo(
    () => tiers.filter((t) => t.slug !== "public").sort((a, b) => a.level - b.level),
    [tiers]
  );

  /** Tiers available for invitations/applications (exclude admin and public) */
  const invitableTiers = useMemo(
    () => tiers.filter((t) => t.slug !== "public" && t.level < SYSTEM_LEVELS.ADMIN).sort((a, b) => a.level - b.level),
    [tiers]
  );

  return {
    tiers,
    tierMap,
    assignableTiers,
    invitableTiers,
    getTier,
    getTierLabel,
    getTierColor,
    getTierLevel,
    isAdmin,
    hasMinLevel,
  };
}
