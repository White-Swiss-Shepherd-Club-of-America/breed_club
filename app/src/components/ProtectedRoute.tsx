/**
 * Route guard that checks auth + RBAC using numeric tier levels.
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useTiers } from "@/hooks/useTiers";
import { SYSTEM_LEVELS } from "@breed-club/shared";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Minimum tier level required. Defaults to requiring any auth. */
  minLevel?: number;
  /** Required permission flag. */
  flag?: "is_breeder" | "can_approve_members" | "can_approve_clearances";
}

export function ProtectedRoute({ children, minLevel, flag }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const { member, isLoading } = useCurrentMember();
  const { getTierLabel } = useTiers();

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

  if (minLevel && minLevel > 0) {
    if (!member) {
      return <Navigate to="/register" replace />;
    }

    const memberLevel = member.tierLevel ?? 0;

    // Admin bypasses all checks
    if (memberLevel < SYSTEM_LEVELS.ADMIN) {
      if (memberLevel < minLevel) {
        return (
          <div className="max-w-lg mx-auto mt-12 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h2 className="text-lg font-semibold text-yellow-800">Access Restricted</h2>
            <p className="mt-2 text-sm text-yellow-700">
              This page requires a higher membership tier. Your current tier is{" "}
              <strong>{getTierLabel(member.tier)}</strong>.
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
