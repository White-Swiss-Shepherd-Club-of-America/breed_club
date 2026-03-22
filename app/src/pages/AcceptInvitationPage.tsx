/**
 * Invitation acceptance page.
 * Route: /accept-invitation?token=<token>
 *
 * 1. Fetches invitation preview to show what the user is accepting
 * 2. If not signed in: shows Clerk SignIn so user can auth and return here
 * 3. If signed in: auto-submits POST /invitations/accept and redirects to /dashboard
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, useUser, SignUp } from "@clerk/clerk-react";
import { api } from "@/lib/api";

interface InvitationPreview {
  email: string;
  tier: string;
  expires_at: string;
  status: string;
  club_name: string;
}

const TIER_LABELS: Record<string, string> = {
  non_member: "Non-Member",
  certificate: "Certificate",
  member: "Full Member",
  admin: "Administrator",
};

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const { isSignedIn, getToken } = useAuth();
  const { isLoaded } = useUser();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Fetch invitation preview (public, no auth)
  useEffect(() => {
    if (!token) {
      setPreviewError("No invitation token found.");
      return;
    }

    api.get<{ invitation: InvitationPreview }>(`/invitations/${token}`)
      .then((res) => setPreview(res.invitation))
      .catch(() => setPreviewError("This invitation link is invalid or has expired."));
  }, [token]);

  // Once signed in, auto-accept the invitation
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || !preview) return;
    if (preview.status !== "pending") return;
    if (accepting || acceptError) return;

    setAccepting(true);
    getToken()
      .then((authToken) =>
        api.post<{ member: unknown }>("/invitations/accept", { token }, { token: authToken })
      )
      .then(() => navigate("/dashboard", { replace: true }))
      .catch((err) => {
        setAccepting(false);
        setAcceptError(err?.error?.message ?? "Failed to accept invitation. Please try again.");
      });
  }, [isLoaded, isSignedIn, token, preview, accepting, acceptError, getToken, navigate]);

  if (!token || previewError) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-red-600">{previewError ?? "Invalid invitation link."}</p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
        <p className="text-gray-500">Loading invitation...</p>
      </div>
    );
  }

  if (preview.status !== "pending") {
    const statusMessage =
      preview.status === "accepted"
        ? "This invitation has already been accepted."
        : preview.status === "expired"
          ? "This invitation has expired."
          : "This invitation is no longer valid.";

    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-gray-700">{statusMessage}</p>
      </div>
    );
  }

  const tierLabel = TIER_LABELS[preview.tier] ?? preview.tier;
  const expiresAt = new Date(preview.expires_at).toLocaleDateString();

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You're invited!</h1>
        <p className="text-gray-600 mb-4">
          Join <strong>{preview.club_name}</strong> as a{" "}
          <strong>{tierLabel}</strong>.
        </p>
        <p className="text-xs text-gray-400">Invitation expires {expiresAt}</p>
      </div>

      {!isLoaded ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
        </div>
      ) : isSignedIn ? (
        <div className="text-center">
          {accepting ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
              <p className="text-gray-600">Setting up your account...</p>
            </>
          ) : acceptError ? (
            <p className="text-red-600">{acceptError}</p>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="text-center text-sm text-gray-600 mb-4">
            Create an account to accept this invitation.
          </p>
          <SignUp
            redirectUrl={window.location.href}
            appearance={{ elements: { rootBox: "w-full", card: "shadow-none border-0 p-0" } }}
          />
        </div>
      )}
    </div>
  );
}
