/**
 * Admin members list — view and manage all members.
 */

import { useState } from "react";
import { useAdminMembers, useUpdateMember, useDeleteMember } from "@/hooks/useAdmin";
import type { Member, Tier } from "@breed-club/shared";
import { Trash2, AlertTriangle } from "lucide-react";

const TIER_OPTIONS: Tier[] = ["non_member", "certificate", "member", "admin"];
const STATUS_OPTIONS = ["pending", "active", "expired", "suspended"];

export function MembersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useAdminMembers(page);
  const updateMutation = useUpdateMember();
  const deleteMutation = useDeleteMember();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allMembers = data?.data ?? [];
  const meta = data?.meta;

  // Client-side search filter
  const members = search
    ? allMembers.filter(
        (m: Member) =>
          m.contact?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          m.contact?.email?.toLowerCase().includes(search.toLowerCase()) ||
          m.contact?.kennel_name?.toLowerCase().includes(search.toLowerCase())
      )
    : allMembers;

  const handleUpdate = async (id: string, field: string, value: unknown) => {
    await updateMutation.mutateAsync({ id, [field]: value });
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setConfirmDeleteId(null);
  };

  const handleExpiresChange = async (id: string, neverExpires: boolean, dateValue?: string) => {
    if (neverExpires) {
      await updateMutation.mutateAsync({ id, membership_expires: null });
    } else if (dateValue) {
      await updateMutation.mutateAsync({ id, membership_expires: new Date(dateValue).toISOString() });
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <input
          type="text"
          placeholder="Search by name, email, or kennel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-72 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">Suspend Member</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              This will suspend the member, remove all permissions, and hide them from the directory.
              This action can be reversed by updating their status.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Suspending..." : "Suspend Member"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tier</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Expires</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Flags</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((member: Member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">
                    {member.contact?.full_name}
                  </div>
                  {member.contact?.kennel_name && (
                    <div className="text-xs text-gray-500">{member.contact.kennel_name}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {member.contact?.email}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={member.tier}
                    onChange={(e) => handleUpdate(member.id, "tier", e.target.value)}
                    className="text-sm border border-gray-200 rounded px-2 py-1"
                  >
                    {TIER_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={member.membership_status}
                    onChange={(e) =>
                      handleUpdate(member.id, "membership_status", e.target.value)
                    }
                    className="text-sm border border-gray-200 rounded px-2 py-1"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={!member.membership_expires}
                        onChange={(e) =>
                          handleExpiresChange(
                            member.id,
                            e.target.checked,
                            e.target.checked ? undefined : new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0]
                          )
                        }
                        className="rounded"
                      />
                      Never
                    </label>
                    {member.membership_expires && (
                      <input
                        type="date"
                        value={new Date(member.membership_expires).toISOString().split("T")[0]}
                        onChange={(e) =>
                          handleExpiresChange(member.id, false, e.target.value)
                        }
                        className="text-xs border border-gray-200 rounded px-1 py-0.5"
                      />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <FlagToggle
                      label="Breeder"
                      active={member.is_breeder}
                      onClick={() => handleUpdate(member.id, "is_breeder", !member.is_breeder)}
                    />
                    <FlagToggle
                      label="Approve Members"
                      active={member.can_approve_members}
                      onClick={() =>
                        handleUpdate(member.id, "can_approve_members", !member.can_approve_members)
                      }
                    />
                    <FlagToggle
                      label="Approve Clearances"
                      active={member.can_approve_clearances}
                      onClick={() =>
                        handleUpdate(
                          member.id,
                          "can_approve_clearances",
                          !member.can_approve_clearances
                        )
                      }
                    />
                    <FlagToggle
                      label="Verified Breeder"
                      active={member.verified_breeder}
                      onClick={() =>
                        handleUpdate(member.id, "verified_breeder", !member.verified_breeder)
                      }
                    />
                    <FlagToggle
                      label="Directory"
                      active={member.show_in_directory}
                      onClick={() =>
                        handleUpdate(member.id, "show_in_directory", !member.show_in_directory)
                      }
                    />
                    <FlagToggle
                      label="Skip Fees"
                      active={member.skip_fees}
                      onClick={() =>
                        handleUpdate(member.id, "skip_fees", !member.skip_fees)
                      }
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setConfirmDeleteId(member.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                    title="Suspend member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            Page {page} of {meta.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
            disabled={page === meta.pages}
            className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function FlagToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-xs font-medium transition ${
        active
          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}
