/**
 * Registration page — auto-registers the Clerk user on first sign-in.
 * No form needed: we fetch the user's name from Clerk server-side.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useCurrentMember, useRegisterMember } from "@/hooks/useCurrentMember";

export function RegisterPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { member } = useCurrentMember();
  const registerMutation = useRegisterMember();

  // If already registered, redirect immediately
  useEffect(() => {
    if (member) {
      navigate("/dashboard", { replace: true });
    }
  }, [member, navigate]);

  // Auto-submit registration using Clerk user data
  useEffect(() => {
    if (user && !member && !registerMutation.isPending && !registerMutation.isSuccess) {
      registerMutation.mutate(
        {
          full_name: user.fullName ?? "",
          email: user.primaryEmailAddress?.emailAddress,
        },
        { onSuccess: () => navigate("/dashboard", { replace: true }) }
      );
    }
  }, [user, member, registerMutation, navigate]);

  return (
    <div className="max-w-md mx-auto mt-12 text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto mb-4" />
      <p className="text-gray-600">Setting up your account...</p>
      {registerMutation.isError && (
        <p className="mt-4 text-sm text-red-600">
          Registration failed. Please try refreshing the page.
        </p>
      )}
    </div>
  );
}
