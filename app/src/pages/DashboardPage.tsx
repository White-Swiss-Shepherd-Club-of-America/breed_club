/**
 * Member dashboard — overview of the member's status, dogs, and applications.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useMyApplications } from "@/hooks/useApplications";
import { useDogs } from "@/hooks/useDogs";
import { useLitters, useSireApprovals, useRespondSireApproval } from "@/hooks/useLitters";
import { useTiers } from "@/hooks/useTiers";
import { PawPrint, FileText, UserPlus, Award, Baby } from "lucide-react";
import { ratingBgClass } from "@/lib/health-colors";
import { formatDate } from "@/lib/utils";
import type { Dog, Litter } from "@breed-club/shared";

export function DashboardPage() {
  const { member } = useCurrentMember();
  const { data: appData } = useMyApplications();
  const { getTierLabel } = useTiers();

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
              {getTierLabel(member.tier)}
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

      {/* Non-member info banner */}
      {member.tierLevel <= 1 && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Self-service account</strong> — You can register dogs and submit health clearances right away.
            Apply for membership to access the full member directory and club features.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {member.tierLevel <= 1 && !pendingApp && (
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

        {member.is_breeder && (
          <Link
            to="/litters"
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
          >
            <Baby className="h-6 w-6 text-gray-400 mb-2" />
            <h3 className="font-semibold text-gray-900">My Litters</h3>
            <p className="mt-1 text-sm text-gray-600">Manage litters and register new ones</p>
          </Link>
        )}
      </div>

      {/* Sire Approvals */}
      <SireApprovalsSection />

      {/* My Dogs */}
      {member.tierLevel >= 1 && <MyDogsSection />}

      {/* My Litters */}
      {member.is_breeder && <MyLittersSection />}

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

type DogSortField = "registered_name" | "call_name" | "sex" | "dob" | "health";
type SortOrder = "asc" | "desc";

function MyDogsSection() {
  const { data, isLoading } = useDogs({ ownedOnly: true });
  const dogs = data?.data ?? [];
  const [sortField, setSortField] = useState<DogSortField>("dob");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const toggleSort = (field: DogSortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "dob" ? "desc" : "asc");
    }
  };

  const sorted = [...dogs].sort((a: Dog, b: Dog) => {
    let cmp = 0;
    switch (sortField) {
      case "registered_name":
        cmp = (a.registered_name || "").localeCompare(b.registered_name || "");
        break;
      case "call_name":
        cmp = (a.call_name || "").localeCompare(b.call_name || "");
        break;
      case "sex":
        cmp = (a.sex || "").localeCompare(b.sex || "");
        break;
      case "dob":
        cmp = (a.date_of_birth || "").localeCompare(b.date_of_birth || "");
        break;
      case "health":
        cmp = (a.health_rating?.score ?? -1) - (b.health_rating?.score ?? -1);
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });

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
                <DogSortHeader field="registered_name" label="Registered Name" current={sortField} order={sortOrder} onSort={toggleSort} />
                <DogSortHeader field="call_name" label="Call Name" current={sortField} order={sortOrder} onSort={toggleSort} />
                <DogSortHeader field="sex" label="Sex" current={sortField} order={sortOrder} onSort={toggleSort} className="hidden sm:table-cell" />
                <DogSortHeader field="dob" label="DOB" current={sortField} order={sortOrder} onSort={toggleSort} className="hidden sm:table-cell" />
                <DogSortHeader field="health" label="Health" current={sortField} order={sortOrder} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((dog: Dog) => {
                const isDeceased = !!(dog.is_deceased || dog.date_of_death);
                const rowBg =
                  dog.sex === "male"
                    ? "bg-blue-50 hover:bg-blue-100"
                    : dog.sex === "female"
                      ? "bg-pink-50 hover:bg-pink-100"
                      : "hover:bg-gray-50";

                return (
                  <tr key={dog.id} className={rowBg}>
                    <td className="py-2">
                      <Link
                        to={`/dogs/${dog.id}`}
                        className={`text-gray-900 font-medium hover:underline ${isDeceased ? "line-through" : ""}`}
                      >
                        {dog.registered_name}
                      </Link>
                      {dog.status === "pending" && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className={`py-2 text-gray-600 ${isDeceased ? "line-through" : ""}`}>
                      {dog.call_name || "—"}
                    </td>
                    <td className={`py-2 text-gray-600 capitalize hidden sm:table-cell ${isDeceased ? "line-through" : ""}`}>
                      {dog.sex || "—"}
                    </td>
                    <td className={`py-2 text-gray-600 hidden sm:table-cell ${isDeceased ? "line-through" : ""}`}>
                      {formatDate(dog.date_of_birth)}
                    </td>
                    <td className="py-2">
                      {dog.health_rating ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ratingBgClass(dog.health_rating)}`}>
                          {dog.health_rating.score}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SireApprovalsSection() {
  const { data, isLoading } = useSireApprovals();
  const approvals = data?.data ?? [];

  if (isLoading || approvals.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-orange-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Sire Approval Requests</h2>
      <div className="space-y-3">
        {approvals.map((litter) => (
          <SireApprovalRow key={litter.id} litter={litter} />
        ))}
      </div>
    </div>
  );
}

function SireApprovalRow({ litter }: { litter: Litter }) {
  const respond = useRespondSireApproval(litter.id);

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {litter.breeder?.kennel_name || litter.breeder?.full_name || "Unknown breeder"} registered a
          litter using your sire{" "}
          <strong>{litter.sire?.call_name || litter.sire?.registered_name || "Unknown"}</strong>
        </p>
        <p className="text-xs text-gray-500">
          Dam: {litter.dam?.call_name || litter.dam?.registered_name || "Unknown"}
          {litter.whelp_date && ` · Whelp: ${formatDate(litter.whelp_date)}`}
        </p>
      </div>
      <div className="flex gap-2 ml-4 shrink-0">
        <button
          onClick={() => respond.mutate({ status: "approved" })}
          disabled={respond.isPending}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => respond.mutate({ status: "rejected" })}
          disabled={respond.isPending}
          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function MyLittersSection() {
  const { data, isLoading } = useLitters();
  const litters = data?.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">My Litters</h2>
        <Link
          to="/litters/new"
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Register New Litter
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : litters.length === 0 ? (
        <p className="text-sm text-gray-500">You haven't registered any litters yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 font-medium">Litter</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium hidden sm:table-cell">Sire Approval</th>
                <th className="pb-2 font-medium hidden sm:table-cell">Whelp Date</th>
                <th className="pb-2 font-medium">Pups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {litters.map((litter) => {
                const label =
                  litter.litter_name ||
                  `${litter.sire?.call_name || litter.sire?.registered_name || "?"} x ${litter.dam?.call_name || litter.dam?.registered_name || "?"}`;

                return (
                  <tr key={litter.id} className="hover:bg-gray-50">
                    <td className="py-2">
                      <Link to={`/litters/${litter.id}`} className="text-gray-900 font-medium hover:underline">
                        {label}
                      </Link>
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          litter.approved
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {litter.approved ? "Approved" : "Pending"}
                      </span>
                    </td>
                    <td className="py-2 hidden sm:table-cell">
                      {litter.sire_approval_status === "pending" && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                          Awaiting Sire Approval
                        </span>
                      )}
                      {litter.sire_approval_status === "rejected" && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          Sire Rejected
                        </span>
                      )}
                      {litter.sire_approval_status === "approved" && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          Sire Approved
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-gray-600 hidden sm:table-cell">
                      {formatDate(litter.whelp_date)}
                    </td>
                    <td className="py-2 text-gray-600">
                      {litter.num_males != null || litter.num_females != null
                        ? `${litter.num_males ?? 0}M / ${litter.num_females ?? 0}F`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DogSortHeader({
  field,
  label,
  current,
  order,
  onSort,
  className,
}: {
  field: DogSortField;
  label: string;
  current: DogSortField;
  order: SortOrder;
  onSort: (field: DogSortField) => void;
  className?: string;
}) {
  return (
    <th
      className={`pb-2 font-medium cursor-pointer hover:text-gray-700 select-none ${className || ""}`}
      onClick={() => onSort(field)}
    >
      {label}
      {current === field && (
        <span className="ml-1">{order === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
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
