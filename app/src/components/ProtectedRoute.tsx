/**
 * Route guard that checks auth + RBAC.
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import type { Tier } from "@breed-club/shared";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Minimum tier required. Defaults to requiring any auth. */
  minTier?: Tier;
  /** Required permission flag. */
  flag?: "is_breeder" | "can_approve_members" | "can_approve_clearances";
}

const TIER_LEVEL: Record<Tier, number> = {
  public: 0,
  non_member: 1,
  certificate: 2,
  member: 3,
  admin: 4,
};

export function ProtectedRoute({ children, minTier, flag }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const { member, isLoading } = useCurrentMember();

  if (!isLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  // If we need a specific tier/flag, check the member record
  if (minTier && minTier !== "public") {
    if (!member) {
      return <Navigate to="/register" replace />;
    }

    // Admin bypasses all checks
    if (member.tier !== "admin") {
      const memberLevel = TIER_LEVEL[member.tier as Tier] ?? 0;
      const requiredLevel = TIER_LEVEL[minTier];

      if (memberLevel < requiredLevel) {
        return (
          <div className="max-w-lg mx-auto mt-12 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h2 className="text-lg font-semibold text-yellow-800">Access Restricted</h2>
            <p className="mt-2 text-sm text-yellow-700">
              This page requires {minTier} tier or higher. Your current tier is{" "}
              <strong>{member.tier}</strong>.
            </p>
          </div>
        );
      }

      if (flag && !member[flag]) {
        return (
          <div className="max-w-lg mx-auto mt-12 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h2 className="text-lg font-semibold text-yellow-800">Access Restricted</h2>
            <p className="mt-2 text-sm text-yellow-700">
              This page requires the <strong>{flag.replace(/_/g, " ")}</strong> permission.
            </p>
          </div>
        );
      }
    }
  }

  return <>{children}</>;
}
