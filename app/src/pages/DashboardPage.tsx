/**
 * Unified dashboard — adapts to the user's role, showing member info,
 * approval queues, elections, dogs, health stats, and litters.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useMyApplications } from "@/hooks/useApplications";
import { useDogs } from "@/hooks/useDogs";
import { useLitters, useSireApprovals, useRespondSireApproval } from "@/hooks/useLitters";
import { useTiers } from "@/hooks/useTiers";
import { useDashboardCounts } from "@/hooks/useDashboardCounts";
import { useMyHealthStats } from "@/hooks/useMyHealthStats";
import { useElections } from "@/hooks/useVoting";
import {
  Award,
  Baby,
  ClipboardCheck,
  Dog,
  FileText,
  Heart,
  ArrowRightLeft,
  UserPlus,
  Vote,
  HeartPulse,
} from "lucide-react";
import { ratingBgClass, scoreToColor, RATING_BG_CLASSES } from "@/lib/health-colors";
import { formatDate } from "@/lib/utils";
import type { Dog as DogType, Litter, Election } from "@breed-club/shared";

export function DashboardPage() {
  const { member } = useCurrentMember();
  const { data: appData } = useMyApplications();
  const { getTierLabel } = useTiers();

  if (!member) return null;

  const tierLevel = member.tierLevel ?? 0;
  const isAdmin = member.is_admin === true || tierLevel >= 100;
  const isMember = tierLevel >= 20;
  const hasApprovalPerms =
    isAdmin ||
    member.can_approve_members ||
    member.can_approve_clearances ||
    member.can_manage_registry;

  const applications = appData?.data ?? [];
  const pendingApp = applications.find((a) => a.status === "submitted");

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* A. Member Info Card */}
      <MemberInfoCard member={member} getTierLabel={getTierLabel} />

      {/* B. Membership CTA (non-members only) */}
      {tierLevel <= 1 && (
        <MembershipCTA pendingApp={pendingApp} />
      )}

      {/* C. Elections Card (members only) */}
      {isMember && <ElectionsCard />}

      {/* D. Approval Queue Cards (approvers/admin) */}
      {hasApprovalPerms && (
        <ApprovalQueuesCard member={member} isAdmin={isAdmin} />
      )}

      {/* E. Sire Approvals */}
      <SireApprovalsSection />

      {/* F. My Dogs */}
      {tierLevel >= 1 && <MyDogsSection />}

      {/* G. Mini Health Stats */}
      {tierLevel >= 1 && <HealthStatsCard isBreeder={member.is_breeder} />}

      {/* H. My Litters (members + breeder) */}
      {isMember && member.is_breeder && <MyLittersSection />}

      {/* I. Application History */}
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

// ─── Member Info Card ──────────────────────────────────────────────────────

function MemberInfoCard({
  member,
  getTierLabel,
}: {
  member: any;
  getTierLabel: (slug: string) => string;
}) {
  const tierLevel = member.tierLevel ?? 0;
  const showTierBadge = tierLevel > 20 || (tierLevel >= 1 && tierLevel < 20);

  return (
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
        <div className="text-right flex items-center gap-2">
          {showTierBadge && tierLevel !== 20 && (
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
              {getTierLabel(member.tier)}
            </span>
          )}
          {member.membership_status === "active" && (
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
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
  );
}

// ─── Membership CTA ────────────────────────────────────────────────────────

function MembershipCTA({ pendingApp }: { pendingApp: any }) {
  if (pendingApp) {
    return (
      <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 mb-6">
        <div className="flex items-start gap-3">
          <FileText className="h-6 w-6 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-yellow-800">Application Pending</h3>
            <p className="mt-1 text-sm text-yellow-700">
              Your membership application is under review. We'll notify you once it's been processed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to="/apply"
      className="block bg-blue-50 rounded-xl border border-blue-200 p-6 mb-6 hover:bg-blue-100 transition group"
    >
      <div className="flex items-start gap-3">
        <UserPlus className="h-6 w-6 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-blue-900 group-hover:text-blue-800">
            Become a Member
          </h3>
          <p className="mt-1 text-sm text-blue-700">
            Unlock the full member directory, voting, breeder tools, and more.
            Apply for membership today.
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Elections Card ────────────────────────────────────────────────────────

function ElectionsCard() {
  const { data: elections } = useElections();
  const all = elections ?? [];
  const open = all.filter((e: Election) => e.status === "open");
  const upcoming = all.filter((e: Election) => e.status === "upcoming");

  if (open.length === 0 && upcoming.length === 0) return null;

  return (
    <Link
      to="/voting"
      className="block bg-white rounded-xl border border-violet-200 p-5 mb-6 hover:shadow-md transition"
    >
      <div className="flex items-center gap-3">
        <Vote className="h-6 w-6 text-violet-500 shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">Elections</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            {open.length > 0 && (
              <span className="text-green-700 font-medium">
                {open.length} open{" "}
              </span>
            )}
            {upcoming.length > 0 && (
              <span className="text-blue-600">
                {upcoming.length} upcoming
              </span>
            )}
          </p>
        </div>
        <span className="text-sm text-violet-600 font-medium">
          {open.length > 0 ? "Vote Now →" : "View →"}
        </span>
      </div>
    </Link>
  );
}

// ─── Approval Queues Card ──────────────────────────────────────────────────

function ApprovalQueuesCard({
  member,
  isAdmin,
}: {
  member: any;
  isAdmin: boolean;
}) {
  const { data: counts } = useDashboardCounts(true);

  if (!counts) return null;

  const total =
    counts.applications + counts.dogs + counts.clearances + counts.litters + counts.transfers;

  if (total === 0) return null;

  const queues = [
    {
      label: "Applications",
      count: counts.applications,
      icon: ClipboardCheck,
      color: "text-yellow-500",
      show: isAdmin || member.can_approve_members,
    },
    {
      label: "Dogs",
      count: counts.dogs,
      icon: Dog,
      color: "text-purple-500",
      show: isAdmin || member.can_approve_clearances || member.can_manage_registry,
    },
    {
      label: "Health",
      count: counts.clearances,
      icon: Heart,
      color: "text-red-500",
      show: isAdmin || member.can_approve_clearances,
    },
    {
      label: "Litters",
      count: counts.litters,
      icon: Baby,
      color: "text-pink-500",
      show: isAdmin || member.can_approve_clearances,
    },
    {
      label: "Transfers",
      count: counts.transfers,
      icon: ArrowRightLeft,
      color: "text-orange-500",
      show: isAdmin || member.can_manage_registry,
    },
  ].filter((q) => q.show && q.count > 0);

  if (queues.length === 0) return null;

  return (
    <div className="mb-6">
      <Link
        to="/admin/approvals"
        className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition"
      >
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Pending Approvals
        </h3>
        <div className="flex flex-wrap gap-4">
          {queues.map((q) => {
            const Icon = q.icon;
            return (
              <div key={q.label} className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${q.color}`} />
                <span className="text-lg font-bold text-gray-900">{q.count}</span>
                <span className="text-sm text-gray-500">{q.label}</span>
              </div>
            );
          })}
        </div>
      </Link>
    </div>
  );
}

// ─── Health Stats Card ─────────────────────────────────────────────────────

function HealthStatsCard({ isBreeder }: { isBreeder: boolean }) {
  const { data, isLoading, isError } = useMyHealthStats(true);

  if (isLoading) return null;
  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <HeartPulse className="h-5 w-5 text-red-400" />
          Health Summary
        </h2>
        <p className="text-sm text-gray-500">
          Health summary is temporarily unavailable.
        </p>
      </div>
    );
  }
  if (!data) return null;
  if (data.own_dogs.total === 0 && (!data.progeny || data.progeny.total === 0)) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-red-400" />
          Health Summary
        </h2>
        <Link
          to="/health-stats?view=my-dogs"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Full Stats →
        </Link>
      </div>

      {/* Own Dogs */}
      {data.own_dogs.total > 0 && (
        <div className={isBreeder && data.progeny ? "mb-4" : ""}>
          {isBreeder && data.progeny && (
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              My Dogs
            </h3>
          )}
          <div className="flex gap-6 mb-3 text-sm">
            <div>
              <span className="font-bold text-gray-900">{data.own_dogs.total}</span>{" "}
              <span className="text-gray-500">dogs</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">{data.own_dogs.tested}</span>{" "}
              <span className="text-gray-500">tested</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">{data.own_dogs.clearances}</span>{" "}
              <span className="text-gray-500">clearances</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.own_dogs.dogs.map((d) => {
              const color = d.health_color ?? "gray";
              const bgClass = RATING_BG_CLASSES[color as keyof typeof RATING_BG_CLASSES] || RATING_BG_CLASSES.gray;
              return (
                <Link
                  key={d.id}
                  to={`/dogs/${d.id}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bgClass} hover:opacity-80 transition`}
                >
                  {d.call_name || d.name}
                  {d.health_score != null && (
                    <span className="font-bold">{d.health_score}</span>
                  )}
                  {d.health_score == null && d.clearance_count > 0 && (
                    <span>{d.clearance_count} clr</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Progeny (breeders) */}
      {isBreeder && data.progeny && data.progeny.total > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Progeny Produced
          </h3>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="font-bold text-gray-900">{data.progeny.total}</span>{" "}
              <span className="text-gray-500">dogs</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">{data.progeny.tested}</span>{" "}
              <span className="text-gray-500">tested</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">{data.progeny.clearances}</span>{" "}
              <span className="text-gray-500">clearances</span>
            </div>
            {data.progeny.avg_score != null && (
              <div>
                <span className="text-gray-500">avg</span>{" "}
                <span className={`font-bold px-1.5 py-0.5 rounded text-xs ${RATING_BG_CLASSES[scoreToColor(data.progeny.avg_score)]}`}>
                  {data.progeny.avg_score}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sire Approvals ────────────────────────────────────────────────────────

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

// ─── My Dogs ───────────────────────────────────────────────────────────────

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

  const sorted = [...dogs].sort((a: DogType, b: DogType) => {
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
              {sorted.map((dog: DogType) => {
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

// ─── My Litters ────────────────────────────────────────────────────────────

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

// ─── Shared Components ─────────────────────────────────────────────────────

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
