import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Link, Navigate } from "react-router-dom";
import { useClub } from "@/hooks/useClub";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { PawPrint, LogIn } from "lucide-react";

export function HomePage() {
  const { data: clubData } = useClub();
  const { member, isLoading } = useCurrentMember();
  const club = clubData?.club;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <PawPrint className="h-16 w-16 mx-auto mb-4 text-gray-400" />
        <h1 className="text-3xl font-bold text-gray-900">
          {club?.name || "Breed Club Manager"}
        </h1>
        {club?.breed_name && (
          <p className="mt-2 text-lg text-gray-600">{club.breed_name}</p>
        )}
      </div>

      <SignedOut>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome</h2>
          <p className="text-gray-600 mb-6">
            Sign in to access the dog registry, health clearances, breeder directory, and more.
          </p>
          <SignInButton mode="modal">
            <button className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition">
              <LogIn className="h-5 w-5" />
              Sign In
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        {isLoading ? null : member ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Complete Registration</h2>
            <p className="text-gray-600 mb-6">
              You're signed in but haven't registered with the club yet.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
            >
              Register Now
            </Link>
          </div>
        )}
      </SignedIn>
    </div>
  );
}
