/**
 * Admin page for managing voting tiers and member assignments.
 */

import { useState } from "react";
import {
  useVotingTiers,
  useCreateVotingTier,
  useUpdateVotingTier,
  useDeleteVotingTier,
  useVotingTierAssignments,
  useAssignVotingTier,
  useRemoveVotingTierAssignment,
} from "@/hooks/useVoting";
import { useAdminMembers } from "@/hooks/useAdmin";
import type { VotingTier } from "@breed-club/shared";
import { Plus, Pencil, Trash2, X, UserPlus } from "lucide-react";

function TierForm({
  tier,
  onSave,
  onCancel,
  isPending,
}: {
  tier: VotingTier | null;
  onSave: (data: { name: string; points: number; sort_order: number; is_active: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(tier?.name ?? "");
  const [points, setPoints] = useState(tier?.points ?? 1);
  const [sortOrder, setSortOrder] = useState(tier?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(tier?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, points, sort_order: sortOrder, is_active: isActive });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {tier ? "Edit Voting Tier" : "New Voting Tier"}
        </h3>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="e.g. Full Member"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              min={1}
              max={100}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          Active
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {isPending ? "Saving..." : tier ? "Update" : "Create"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function VotingTiersPage() {
  const { data: tiers, isLoading: tiersLoading } = useVotingTiers();
  const { data: assignments, isLoading: assignmentsLoading } = useVotingTierAssignments();
  const { data: membersData } = useAdminMembers(1);
  const createTier = useCreateVotingTier();
  const updateTier = useUpdateVotingTier();
  const deleteTier = useDeleteVotingTier();
  const assignTier = useAssignVotingTier();
  const removeAssignment = useRemoveVotingTierAssignment();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VotingTier | null>(null);
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assignTierId, setAssignTierId] = useState("");

  const allMembers = membersData?.data ?? [];

  const handleSaveTier = async (data: { name: string; points: number; sort_order: number; is_active: boolean }) => {
    if (editing) {
      await updateTier.mutateAsync({ id: editing.id, ...data });
      setEditing(null);
    } else {
      await createTier.mutateAsync(data);
      setShowForm(false);
    }
  };

  const handleDeleteTier = async (id: string) => {
    if (!confirm("Delete this voting tier?")) return;
    await deleteTier.mutateAsync(id);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignMemberId || !assignTierId) return;
    await assignTier.mutateAsync({ member_id: assignMemberId, voting_tier_id: assignTierId });
    setAssignMemberId("");
  };

  const handleRemoveAssignment = async (memberId: string) => {
    if (!confirm("Remove this member's voting tier assignment?")) return;
    await removeAssignment.mutateAsync(memberId);
  };

  if (tiersLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Voting Tiers */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Voting Tiers</h1>
            <p className="text-sm text-gray-500 mt-1">
              Define voter levels with different point weights for elections.
            </p>
          </div>
          {!showForm && !editing && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
            >
              <Plus className="h-4 w-4" />
              Add Tier
            </button>
          )}
        </div>

        {(showForm || editing) && (
          <TierForm
            tier={editing}
            onSave={handleSaveTier}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            isPending={createTier.isPending || updateTier.isPending}
          />
        )}

        {tiers && tiers.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Points</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Members</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tiers.map((tier) => (
                  <tr key={tier.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{tier.name}</td>
                    <td className="px-4 py-3 text-gray-600">{tier.points}</td>
                    <td className="px-4 py-3 text-gray-600">{tier.member_count}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${tier.is_active ? "text-green-600" : "text-red-500"}`}>
                        {tier.is_active ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(tier)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTier(tier.id)}
                          disabled={deleteTier.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(!tiers || tiers.length === 0) && !showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No voting tiers configured yet.</p>
          </div>
        )}
      </div>

      {/* Tier Assignments */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Member Assignments</h2>

        {tiers && tiers.length > 0 && (
          <form onSubmit={handleAssign} className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
                <select
                  value={assignMemberId}
                  onChange={(e) => setAssignMemberId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">Select member...</option>
                  {allMembers.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.contact?.full_name ?? m.clerk_user_id} ({m.tier})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Voting Tier</label>
                <select
                  value={assignTierId}
                  onChange={(e) => setAssignTierId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">Select tier...</option>
                  {tiers.filter((t) => t.is_active).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.points} pts)
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={!assignMemberId || !assignTierId || assignTier.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition"
              >
                <UserPlus className="h-4 w-4" />
                Assign
              </button>
            </div>
          </form>
        )}

        {assignmentsLoading ? (
          <div className="flex items-center justify-center h-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
          </div>
        ) : assignments && assignments.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Member</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Voting Tier</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Points</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Assigned</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.member_name ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-500">{a.member_email ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{a.tier_name ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{a.tier_points ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(a.assigned_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemoveAssignment(a.member_id)}
                        disabled={removeAssignment.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Remove assignment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No members assigned to voting tiers yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
