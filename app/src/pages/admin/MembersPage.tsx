/**
 * Admin members list — view and manage all members.
 */

import { useState } from "react";
import { useAdminMembers, useUpdateMember, useDeleteMember, useUpdateContact, useDirectInvite } from "@/hooks/useAdmin";
import { useTiers } from "@/hooks/useTiers";
import type { Member } from "@breed-club/shared";
import { Trash2, AlertTriangle, Pencil, Mail } from "lucide-react";

const STATUS_OPTIONS = ["pending", "active", "expired", "suspended"];

export function MembersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useAdminMembers(page);
  const updateMutation = useUpdateMember();
  const deleteMutation = useDeleteMember();
  const updateContactMutation = useUpdateContact();
  const directInviteMutation = useDirectInvite();
  const { assignableTiers, invitableTiers } = useTiers();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

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
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name, email, or kennel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-72 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            <Mail className="h-4 w-4" /> Invite Member
          </button>
        </div>
      </div>

      {inviteSentTo && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          Invitation sent to <strong>{inviteSentTo}</strong>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {/* Direct invite modal */}
      {showInviteModal && (
        <DirectInviteModal
          onClose={() => setShowInviteModal(false)}
          onSend={async (data) => {
            await directInviteMutation.mutateAsync(data);
            setShowInviteModal(false);
            setInviteSentTo(data.email);
            setTimeout(() => setInviteSentTo(null), 5000);
          }}
          isSending={directInviteMutation.isPending}
          error={directInviteMutation.error?.message ?? null}
          tierOptions={invitableTiers}
        />
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

      {/* Edit contact modal */}
      {editingMember && editingMember.contact && (
        <ContactEditModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSave={async (data) => {
            await updateContactMutation.mutateAsync({ id: editingMember.contact!.id, ...data });
            setEditingMember(null);
          }}
          isSaving={updateContactMutation.isPending}
        />
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
                  <button
                    onClick={() => setEditingMember(member)}
                    className="text-left group"
                    title="Edit contact info"
                  >
                    <div className="font-medium text-gray-900 group-hover:text-blue-600 flex items-center gap-1">
                      {member.contact?.full_name}
                      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 text-blue-500" />
                    </div>
                    {member.contact?.kennel_name && (
                      <div className="text-xs text-gray-500">{member.contact.kennel_name}</div>
                    )}
                  </button>
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
                    {assignableTiers.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.label}
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

function DirectInviteModal({
  onClose,
  onSend,
  isSending,
  error,
  tierOptions,
}: {
  onClose: () => void;
  onSend: (data: { email: string; name?: string; tier: string }) => Promise<void>;
  isSending: boolean;
  error: string | null;
  tierOptions: Array<{ slug: string; label: string; level: number }>;
}) {
  const defaultTier = tierOptions.find((t) => t.slug === "member")?.slug ?? tierOptions[0]?.slug ?? "member";
  const [form, setForm] = useState({ email: "", name: "", tier: defaultTier });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSend({ email: form.email, name: form.name || undefined, tier: form.tier });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Member</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="For personalized email greeting"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
            <select
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {tierOptions.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {isSending ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>
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

function ContactEditModal({
  member,
  onClose,
  onSave,
  isSaving,
}: {
  member: Member;
  onClose: () => void;
  onSave: (data: Record<string, string | null>) => Promise<void>;
  isSaving: boolean;
}) {
  const contact = member.contact!;
  const [form, setForm] = useState({
    full_name: contact.full_name || "",
    email: contact.email || "",
    phone: contact.phone || "",
    kennel_name: contact.kennel_name || "",
    city: contact.city || "",
    state: contact.state || "",
    country: contact.country || "",
    website_url: contact.website_url || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      full_name: form.full_name || null,
      email: form.email || null,
      phone: form.phone || null,
      kennel_name: form.kennel_name || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      website_url: form.website_url || null,
    });
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Contact Info</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kennel Name</label>
            <input
              type="text"
              value={form.kennel_name}
              onChange={(e) => update("kennel_name", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
                maxLength={2}
                placeholder="US"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
            <input
              type="url"
              value={form.website_url}
              onChange={(e) => update("website_url", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
