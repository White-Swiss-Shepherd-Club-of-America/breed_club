/**
 * Member dashboard — overview of the member's status, dogs, and applications.
 */

import { Link } from "react-router-dom";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useMyApplications } from "@/hooks/useApplications";
import { useDogs } from "@/hooks/useDogs";
import { hasTier } from "@breed-club/shared/roles.js";
import { PawPrint, FileText, UserPlus, Award } from "lucide-react";
import type { Dog } from "@breed-club/shared";

const TIER_LABELS: Record<string, string> = {
  non_member: "Non-Member",
  certificate: "Certificate",
  member: "Full Member",
  admin: "Administrator",
};

export function DashboardPage() {
  const { member } = useCurrentMember();
  const { data: appData } = useMyApplications();

  if (!member) return null;

  const applications = appData?.data ?? [];
  const pendingApp = applications.find((a) => a.status === "submitted");

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Status card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {member.contact?.full_name}
            </h2>
            {member.contact?.kennel_name && (
              <p className="text-sm text-gray-500">{member.contact.kennel_name}</p>
            )}
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
              {TIER_LABELS[member.tier] || member.tier}
            </span>
            {member.membership_status === "active" && (
              <span className="ml-2 inline-block px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                Active
              </span>
            )}
          </div>
        </div>

        {member.is_breeder && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <Award className="h-4 w-4" />
            <span>Registered Breeder</span>
            {member.verified_breeder && (
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">
                Verified
              </span>
            )}
          </div>
        )}

        {member.membership_expires && (
          <p className="mt-2 text-sm text-gray-500">
            Membership expires: {new Date(member.membership_expires).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {member.tier === "non_member" && !pendingApp && (
          <Link
            to="/apply"
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
          >
            <UserPlus className="h-6 w-6 text-gray-400 mb-2" />
            <h3 className="font-semibold text-gray-900">Apply for Membership</h3>
            <p className="mt-1 text-sm text-gray-600">
              Submit an application to become a full member
            </p>
          </Link>
        )}

        {pendingApp && (
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6">
            <FileText className="h-6 w-6 text-yellow-600 mb-2" />
            <h3 className="font-semibold text-yellow-800">Application Pending</h3>
            <p className="mt-1 text-sm text-yellow-700">
              Your membership application is under review.
            </p>
          </div>
        )}

        <Link
          to="/profile"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
        >
          <PawPrint className="h-6 w-6 text-gray-400 mb-2" />
          <h3 className="font-semibold text-gray-900">Edit Profile</h3>
          <p className="mt-1 text-sm text-gray-600">Update your contact information</p>
        </Link>
      </div>

      {/* My Dogs */}
      {hasTier(member.tier, "certificate") && <MyDogsSection />}

      {/* Application history */}
      {applications.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Application History</h2>
          <div className="space-y-3">
            {applications.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {app.membership_type} Membership
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MyDogsSection() {
  const { data, isLoading } = useDogs(1, undefined, undefined, true);
  const dogs = data?.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">My Dogs</h2>
        <Link
          to="/dogs/register"
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Register a Dog
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : dogs.length === 0 ? (
        <p className="text-sm text-gray-500">
          You haven't registered any dogs yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">Registered Name</th>
                <th className="pb-2 font-medium">Call Name</th>
                <th className="pb-2 font-medium hidden sm:table-cell">Sex</th>
                <th className="pb-2 font-medium hidden sm:table-cell">DOB</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dogs.map((dog: Dog) => (
                <tr key={dog.id} className="hover:bg-gray-50">
                  <td className="py-2">
                    <Link to={`/dogs/${dog.id}`} className="text-gray-900 font-medium hover:underline">
                      {dog.registered_name}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-600">{dog.call_name || "—"}</td>
                  <td className="py-2 text-gray-600 capitalize hidden sm:table-cell">{dog.sex || "—"}</td>
                  <td className="py-2 text-gray-600 hidden sm:table-cell">
                    {dog.date_of_birth ? new Date(dog.date_of_birth).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 text-right">
                    <DogStatusBadge status={dog.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DogStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Approved
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        Pending
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
      {status}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    submitted: "bg-yellow-100 text-yellow-700",
    under_review: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    needs_revision: "bg-orange-100 text-orange-700",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-700"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
