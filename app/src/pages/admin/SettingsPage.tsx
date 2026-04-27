/**
 * Admin settings page with tabs.
 * - Membership tab: manage custom form fields
 * - Settings tab: club-level configuration (banner aspect ratio, etc.)
 */

import { useState, useEffect } from "react";
import {
  useAdminFormFields,
  useCreateFormField,
  useUpdateFormField,
  useDeleteFormField,
} from "@/hooks/useFormFields";
import {
  useVotingTiers,
  useCreateVotingTier,
  useUpdateVotingTier,
  useDeleteVotingTier,
  useVotingTierAssignments,
  useAssignVotingTier,
  useRemoveVotingTierAssignment,
} from "@/hooks/useVoting";
import {
  useAdminMembershipTiers,
  useCreateMembershipTier,
  useUpdateMembershipTier,
  useDeleteMembershipTier,
} from "@/hooks/useMembershipTiers";
import { useAdminMembers } from "@/hooks/useAdmin";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import type { MembershipFormField, MembershipTier, VotingTier } from "@breed-club/shared";
import { Plus, Pencil, Trash2, EyeOff, Eye, X, UserPlus } from "lucide-react";

const FIELD_TYPES = [
  { value: "text", label: "Text (single line)" },
  { value: "textarea", label: "Text area (multi-line)" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Dropdown (select one)" },
  { value: "radio", label: "Radio buttons (select one)" },
  { value: "checkbox", label: "Checkbox (yes/no or multi-select)" },
];

type FormState = {
  field_key: string;
  label: string;
  description: string;
  field_type: string;
  options_text: string;
  required: boolean;
  sort_order: string;
};

const emptyForm = (): FormState => ({
  field_key: "",
  label: "",
  description: "",
  field_type: "text",
  options_text: "",
  required: false,
  sort_order: "0",
});

function formStateToPayload(state: FormState) {
  const needsOptions = ["select", "radio", "checkbox"].includes(state.field_type);
  return {
    field_key: state.field_key,
    label: state.label,
    description: state.description || null,
    field_type: state.field_type,
    options: needsOptions
      ? state.options_text
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    required: state.required,
    sort_order: parseInt(state.sort_order) || 0,
  };
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm";

function MembershipTab() {
  const { data, isLoading } = useAdminFormFields();
  const createMutation = useCreateFormField();
  const updateMutation = useUpdateFormField();
  const deleteMutation = useDeleteFormField();

  const embedUrl = `${window.location.origin}/embed/apply`;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const fields = data?.data ?? [];
  const needsOptions = ["select", "radio", "checkbox"].includes(formState.field_type);

  const startCreate = () => {
    setEditingId(null);
    setFormState(emptyForm());
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (field: MembershipFormField) => {
    setEditingId(field.id);
    setFormState({
      field_key: field.field_key,
      label: field.label,
      description: field.description || "",
      field_type: field.field_type,
      options_text: field.options?.join(", ") ?? "",
      required: field.required,
      sort_order: String(field.sort_order),
    });
    setFormError(null);
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    try {
      const payload = formStateToPayload(formState);
      if (editingId) {
        const { field_key: _omit, ...updatePayload } = payload;
        await updateMutation.mutateAsync({ id: editingId, ...updatePayload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err: any) {
      setFormError(
        err?.error?.message || err?.message || "Failed to save form field."
      );
    }
  };

  const handleToggleActive = async (field: MembershipFormField) => {
    try {
      await updateMutation.mutateAsync({
        id: field.id,
        is_active: !field.is_active,
      });
    } catch {
      // silently fail
    }
  };

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm font-medium text-blue-900 mb-1">
          Embed URL
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm bg-white px-3 py-2 rounded border border-blue-200 font-mono break-all select-all">
            {embedUrl}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(embedUrl)}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 shrink-0"
          >
            Copy
          </button>
        </div>
        <p className="mt-2 text-xs text-blue-700">
          Use this URL in an iframe to embed the membership form on any website.
        </p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Configure the questions shown on the membership application form.
        </p>
        {!showForm && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> Add Field
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              {editingId ? "Edit Field" : "New Field"}
            </h2>
            <button onClick={cancel} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Field Key <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formState.field_key}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, field_key: e.target.value }))
                }
                disabled={!!editingId}
                placeholder="e.g. dog_breed"
                className={inputClass + (editingId ? " bg-gray-50 text-gray-500" : "")}
              />
              <p className="mt-1 text-xs text-gray-400">
                Lowercase letters, numbers, underscores only. Cannot change after creation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formState.label}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, label: e.target.value }))
                }
                placeholder="e.g. What breed is your dog?"
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Help text <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={formState.description}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, description: e.target.value }))
                }
                placeholder="Additional instructions shown below the field"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Field Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formState.field_type}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, field_type: e.target.value }))
                }
                className={inputClass}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort Order
              </label>
              <input
                type="number"
                value={formState.sort_order}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, sort_order: e.target.value }))
                }
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-400">Lower numbers appear first.</p>
            </div>

            {needsOptions && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Options <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formState.options_text}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, options_text: e.target.value }))
                  }
                  placeholder="Option 1, Option 2, Option 3"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-400">Comma-separated list of choices.</p>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={formState.required}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, required: e.target.checked }))
                  }
                  className="rounded"
                />
                Required field
              </label>
            </div>
          </div>

          {formError && (
            <p className="mt-4 text-sm text-red-600">{formError}</p>
          )}

          <div className="flex gap-2 mt-6">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={cancel}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {!isLoading && fields.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500 mb-4">No form fields configured yet.</p>
          <p className="text-sm text-gray-400">
            Add fields to collect custom information from applicants beyond the standard
            name/email/address fields.
          </p>
        </div>
      )}

      {fields.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Label</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Key</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Required</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Order</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fields.map((field) => (
                <tr
                  key={field.id}
                  className={field.is_active ? "" : "opacity-50 bg-gray-50"}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{field.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {field.field_key}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{field.field_type}</td>
                  <td className="px-4 py-3 text-center">
                    {field.required ? (
                      <span className="text-red-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{field.sort_order}</td>
                  <td className="px-4 py-3 text-center">
                    {field.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => startEdit(field)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(field)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                        title={field.is_active ? "Deactivate" : "Activate"}
                      >
                        {field.is_active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        These fields appear after the standard fields (name, email, phone, address, membership type) on the application form.
        Deactivated fields are hidden from applicants but their answers in existing applications are preserved.
      </p>
    </>
  );
}

function TagInput({
  label,
  helpText,
  values,
  onChange,
  placeholder,
  onDirty,
}: {
  label: string;
  helpText?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  onDirty?: () => void;
}) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      const val = input.trim();
      if (!values.includes(val)) {
        onChange([...values, val]);
        onDirty?.();
      }
      setInput("");
    }
  };

  const handleRemove = (val: string) => {
    onChange(values.filter((v) => v !== val));
    onDirty?.();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {values.map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-gray-100 text-gray-800"
            >
              {val}
              <button
                type="button"
                onClick={() => handleRemove(val)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Type and press Enter to add"}
        className={inputClass}
      />
      {helpText && <p className="mt-1 text-xs text-gray-400">{helpText}</p>}
    </div>
  );
}

function ClubSettingsTab() {
  const { getToken } = useAuth();
  const [bannerWidth, setBannerWidth] = useState(390);
  const [bannerHeight, setBannerHeight] = useState(219);
  const [breedColors, setBreedColors] = useState<string[]>([]);
  const [breedCoatTypes, setBreedCoatTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const result = await api.get<{ settings: Record<string, unknown> }>("/admin/settings", { token });
        if (result.settings?.banner_width) setBannerWidth(result.settings.banner_width as number);
        if (result.settings?.banner_height) setBannerHeight(result.settings.banner_height as number);
        if (Array.isArray(result.settings?.breed_colors)) setBreedColors(result.settings.breed_colors as string[]);
        if (Array.isArray(result.settings?.breed_coat_types)) setBreedCoatTypes(result.settings.breed_coat_types as string[]);
      } catch {
        // defaults are fine
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const ratio = bannerWidth && bannerHeight ? (bannerWidth / bannerHeight).toFixed(2) : "—";

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const token = await getToken();
      await api.patch(
        "/admin/settings",
        { banner_width: bannerWidth, banner_height: bannerHeight, breed_colors: breedColors, breed_coat_types: breedCoatTypes },
        { token }
      );
      setSaved(true);
    } catch {
      // fail silently
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-500">Club-level configuration settings.</p>

      {/* Breed Options */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Breed Options</h3>
        <p className="text-sm text-gray-500">
          Define the allowed coat colors and coat types for your breed. These will appear as dropdown
          options when registering dogs and adding pups. If only one color is defined, it will be
          auto-filled and hidden from forms.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TagInput
            label="Coat Colors"
            values={breedColors}
            onChange={setBreedColors}
            placeholder="e.g. White"
            helpText="Press Enter or comma to add. These become the dropdown options for dog color."
            onDirty={() => setSaved(false)}
          />
          <TagInput
            label="Coat Types"
            values={breedCoatTypes}
            onChange={setBreedCoatTypes}
            placeholder="e.g. Short Coat"
            helpText="Press Enter or comma to add. These become the dropdown options for coat type."
            onDirty={() => setSaved(false)}
          />
        </div>
      </div>

      {/* Banner Dimensions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Breeder Banner Dimensions
        </label>
        <div className="flex items-center gap-3">
          <div>
            <label htmlFor="banner_width" className="block text-xs text-gray-500 mb-1">Width (px)</label>
            <input
              id="banner_width"
              type="number"
              min={100}
              max={2000}
              value={bannerWidth}
              onChange={(e) => { setBannerWidth(Number(e.target.value)); setSaved(false); }}
              className={inputClass + " w-28"}
            />
          </div>
          <span className="text-gray-400 mt-5">&times;</span>
          <div>
            <label htmlFor="banner_height" className="block text-xs text-gray-500 mb-1">Height (px)</label>
            <input
              id="banner_height"
              type="number"
              min={50}
              max={1000}
              value={bannerHeight}
              onChange={(e) => { setBannerHeight(Number(e.target.value)); setSaved(false); }}
              className={inputClass + " w-28"}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Ratio: {ratio}:1 — Uploaded banner images will be resized to fit these dimensions.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {saved && <p className="text-sm text-green-600">Settings saved.</p>}
    </div>
  );
}

function VotingTiersTab() {
  const { data: tiers, isLoading: tiersLoading } = useVotingTiers();
  const { data: assignments, isLoading: assignmentsLoading } = useVotingTierAssignments();
  const { data: membersData } = useAdminMembers(1);
  const { data: membershipTiersData } = useAdminMembershipTiers();
  const createTier = useCreateVotingTier();
  const updateTier = useUpdateVotingTier();
  const deleteTier = useDeleteVotingTier();
  const assignTier = useAssignVotingTier();
  const removeAssignment = useRemoveVotingTierAssignment();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VotingTier | null>(null);
  const [tierName, setTierName] = useState("");
  const [tierPoints, setTierPoints] = useState(1);
  const [tierMembershipTierId, setTierMembershipTierId] = useState<string>("");
  const [tierSortOrder, setTierSortOrder] = useState(0);
  const [tierActive, setTierActive] = useState(true);
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assignTierId, setAssignTierId] = useState("");

  const allMembers = membersData?.data ?? [];
  const membershipTiers = membershipTiersData?.data ?? [];
  // Exclude admin tier from linkable options
  const linkableMembershipTiers = membershipTiers.filter((t) => t.level < 100);

  const startCreate = () => {
    setEditing(null);
    setTierName(""); setTierPoints(1); setTierMembershipTierId(""); setTierSortOrder(0); setTierActive(true);
    setShowForm(true);
  };

  const startEdit = (tier: VotingTier) => {
    setEditing(tier);
    setTierName(tier.name); setTierPoints(tier.points); setTierMembershipTierId(tier.membership_tier_id ?? ""); setTierSortOrder(tier.sort_order); setTierActive(tier.is_active);
    setShowForm(true);
  };

  const cancel = () => { setShowForm(false); setEditing(null); };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: tierName,
      points: tierPoints,
      membership_tier_id: tierMembershipTierId || null,
      sort_order: tierSortOrder,
      is_active: tierActive,
    };
    if (editing) {
      await updateTier.mutateAsync({ id: editing.id, ...data });
    } else {
      await createTier.mutateAsync(data);
    }
    cancel();
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

  const handleRemove = async (memberId: string) => {
    if (!confirm("Remove this member's voting tier?")) return;
    await removeAssignment.mutateAsync(memberId);
  };

  if (tiersLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Tiers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            Define voter levels with different point weights. Link each voting tier to a membership tier so members get voting rights automatically. Use manual assignments below for individual overrides.
          </p>
          {!showForm && (
            <button
              onClick={startCreate}
              className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" /> Add Tier
            </button>
          )}
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{editing ? "Edit Tier" : "New Tier"}</h3>
              <button onClick={cancel} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleSaveTier} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={tierName} onChange={(e) => setTierName(e.target.value)} required
                  className={inputClass} placeholder="e.g. Full Member" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Points</label>
                <input type="number" value={tierPoints} onChange={(e) => setTierPoints(Number(e.target.value))}
                  min={1} max={100} required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Membership Tier</label>
                <select value={tierMembershipTierId} onChange={(e) => setTierMembershipTierId(e.target.value)} className={inputClass}>
                  <option value="">— None —</option>
                  {linkableMembershipTiers.map((t) => (
                    <option key={t.id} value={t.id}>{t.label} (level {t.level})</option>
                  ))}
                </select>
                <p className="mt-0.5 text-xs text-gray-400">Members at this tier auto-get these points.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sort Order</label>
                <input type="number" value={tierSortOrder} onChange={(e) => setTierSortOrder(Number(e.target.value))}
                  className={inputClass} />
              </div>
              <div className="col-span-full flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={tierActive} onChange={(e) => setTierActive(e.target.checked)} className="rounded border-gray-300" />
                  Active
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={createTier.isPending || updateTier.isPending}
                    className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50">
                    {createTier.isPending || updateTier.isPending ? "Saving..." : editing ? "Update" : "Create"}
                  </button>
                  <button type="button" onClick={cancel}
                    className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            </form>
          </div>
        )}

        {tiers && tiers.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Points</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Membership Tier</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Members</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tiers.map((tier) => {
                  const linkedMembershipTier = membershipTiers.find((mt) => mt.id === tier.membership_tier_id);
                  return (
                  <tr key={tier.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{tier.name}</td>
                    <td className="px-4 py-3 text-gray-600">{tier.points}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {linkedMembershipTier ? (
                        <span className="inline-flex items-center gap-1">
                          {linkedMembershipTier.color && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: linkedMembershipTier.color }} />
                          )}
                          {linkedMembershipTier.label}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{tier.member_count}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${tier.is_active ? "text-green-600" : "text-red-500"}`}>
                        {tier.is_active ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(tier)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteTier(tier.id)} disabled={deleteTier.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !showForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">No voting tiers configured yet.</p>
            </div>
          )
        )}
      </div>

      {/* Member Assignments (Overrides) */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Manual Overrides</h3>
        <p className="text-sm text-gray-500 mb-3">Assign individual members to a voting tier, overriding their membership tier's default.</p>

        {tiers && tiers.length > 0 && (
          <form onSubmit={handleAssign} className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Member</label>
                <select value={assignMemberId} onChange={(e) => setAssignMemberId(e.target.value)} className={inputClass}>
                  <option value="">Select member...</option>
                  {allMembers.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.contact?.full_name ?? m.clerk_user_id} ({m.tier})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Voting Tier</label>
                <select value={assignTierId} onChange={(e) => setAssignTierId(e.target.value)} className={inputClass}>
                  <option value="">Select tier...</option>
                  {tiers.filter((t) => t.is_active).map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.points} pts)</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={!assignMemberId || !assignTierId || assignTier.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition">
                <UserPlus className="h-4 w-4" /> Assign
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.member_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{a.member_email ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{a.tier_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{a.tier_points ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(a.assigned_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleRemove(a.member_id)} disabled={removeAssignment.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-500">No members assigned to voting tiers yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MembershipTiersTab() {
  const { data, isLoading } = useAdminMembershipTiers();
  const createTier = useCreateMembershipTier();
  const updateTier = useUpdateMembershipTier();
  const deleteTier = useDeleteMembershipTier();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MembershipTier | null>(null);
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [level, setLevel] = useState(5);
  const [color, setColor] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  const tiers = data?.data ?? [];

  const startCreate = () => {
    setEditing(null);
    setSlug(""); setLabel(""); setLevel(5); setColor(""); setIsDefault(false); setSortOrder(0);
    setShowForm(true);
  };

  const startEdit = (tier: MembershipTier) => {
    setEditing(tier);
    setSlug(tier.slug); setLabel(tier.label); setLevel(tier.level); setColor(tier.color ?? ""); setIsDefault(tier.is_default); setSortOrder(tier.sort_order);
    setShowForm(true);
  };

  const cancel = () => { setShowForm(false); setEditing(null); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await updateTier.mutateAsync({ id: editing.id, label, level, color: color || null, is_default: isDefault, sort_order: sortOrder });
    } else {
      await createTier.mutateAsync({ slug, label, level, color: color || null, is_default: isDefault, sort_order: sortOrder });
    }
    cancel();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this membership tier?")) return;
    try {
      await deleteTier.mutateAsync(id);
    } catch (err: any) {
      alert(err?.error?.message || err?.message || "Cannot delete this tier");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Configure membership levels for your club. Each tier has a numeric level that determines access.
          Higher levels have more access. Admin (level 100) is required and cannot be deleted.
        </p>
        {!showForm && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> Add Tier
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{editing ? "Edit Tier" : "New Tier"}</h3>
            <button onClick={cancel} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
              <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} required
                disabled={!!editing} pattern="^[a-z][a-z0-9_]*$"
                className={inputClass + (editing ? " bg-gray-50 text-gray-500" : "")} placeholder="e.g. associate" />
              <p className="mt-0.5 text-xs text-gray-400">Lowercase, no spaces. Cannot change later.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} required
                className={inputClass} placeholder="e.g. Associate Member" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Level (0-99)</label>
              <input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))}
                min={0} max={99} required className={inputClass}
                disabled={editing?.is_system} />
              <p className="mt-0.5 text-xs text-gray-400">Higher = more access. Admin is 100.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color || "#6b7280"} onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
                <input type="text" value={color} onChange={(e) => setColor(e.target.value)}
                  className={inputClass + " flex-1"} placeholder="#6b7280" maxLength={7} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
                className={inputClass} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-gray-300" />
                Default for new signups
              </label>
            </div>
            <div className="col-span-full flex items-center justify-end gap-2">
              <button type="submit" disabled={createTier.isPending || updateTier.isPending}
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50">
                {createTier.isPending || updateTier.isPending ? "Saving..." : editing ? "Update" : "Create"}
              </button>
              <button type="button" onClick={cancel}
                className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {tiers.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tier</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Slug</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Level</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Members</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Default</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tiers.map((tier) => (
                <tr key={tier.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {tier.color && (
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tier.color }} />
                      )}
                      <span className="font-medium text-gray-900">{tier.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{tier.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{tier.level}</td>
                  <td className="px-4 py-3 text-gray-600">{tier.member_count ?? "—"}</td>
                  <td className="px-4 py-3">
                    {tier.is_default && <span className="text-xs font-medium text-green-600">Default</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => startEdit(tier)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!tier.is_system && (
                        <button onClick={() => handleDelete(tier.id)} disabled={deleteTier.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No membership tiers configured yet.</p>
          </div>
        )
      )}

      <p className="text-xs text-gray-400">
        System tiers (like Admin) cannot be deleted. Tiers with members assigned cannot be deleted until those members are moved to a different tier.
      </p>
    </div>
  );
}

function LitterAdsTab() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);
  const [maxActive, setMaxActive] = useState(3);
  const [cooldownDays, setCooldownDays] = useState(30);
  const [expirationDays, setExpirationDays] = useState(90);
  const [feeCents, setFeeCents] = useState(0);
  const [imageWidth, setImageWidth] = useState(1200);
  const [imageHeight, setImageHeight] = useState(630);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "priority">("newest");

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const result = await api.get<{ settings: Record<string, unknown> }>("/admin/settings", { token });
        const la = result.settings?.litter_ads as Record<string, unknown> | undefined;
        if (la) {
          if (typeof la.enabled === "boolean") setEnabled(la.enabled);
          if (typeof la.require_approval === "boolean") setRequireApproval(la.require_approval);
          if (typeof la.max_active_per_member === "number") setMaxActive(la.max_active_per_member);
          if (typeof la.posting_cooldown_days === "number") setCooldownDays(la.posting_cooldown_days);
          if (typeof la.expiration_days === "number") setExpirationDays(la.expiration_days);
          if (typeof la.fee_cents === "number") setFeeCents(la.fee_cents);
          if (typeof la.ad_image_width === "number") setImageWidth(la.ad_image_width);
          if (typeof la.ad_image_height === "number") setImageHeight(la.ad_image_height);
          if (la.sort_order === "newest" || la.sort_order === "oldest" || la.sort_order === "priority") setSortOrder(la.sort_order);
        }
      } catch {
        // defaults are fine
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const token = await getToken();
      await api.patch(
        "/admin/settings",
        {
          litter_ads: {
            enabled,
            require_approval: requireApproval,
            max_active_per_member: maxActive,
            posting_cooldown_days: cooldownDays,
            expiration_days: expirationDays,
            fee_cents: feeCents,
            ad_image_width: imageWidth,
            ad_image_height: imageHeight,
            sort_order: sortOrder,
          },
        },
        { token }
      );
      setSaved(true);
    } catch {
      // fail silently for now
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-500">Configure the litter ad marketplace for your club.</p>

      {/* Enable / basic */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900">General</h3>
        <label className="flex items-center gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }}
            className="rounded border-gray-300"
          />
          Enable litter ads
        </label>
        <label className="flex items-center gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={requireApproval}
            onChange={(e) => { setRequireApproval(e.target.checked); setSaved(false); }}
            className="rounded border-gray-300"
          />
          Require admin approval before ads go live
        </label>
      </div>

      {/* Limits */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Limits</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max active ads per member</label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxActive}
              onChange={(e) => { setMaxActive(Number(e.target.value)); setSaved(false); }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Posting cooldown (days)</label>
            <input
              type="number"
              min={0}
              max={365}
              value={cooldownDays}
              onChange={(e) => { setCooldownDays(Number(e.target.value)); setSaved(false); }}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">Days between new ad submissions per member.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ad expiration (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={expirationDays}
              onChange={(e) => { setExpirationDays(Number(e.target.value)); setSaved(false); }}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">How long an active ad stays live.</p>
          </div>
        </div>
      </div>

      {/* Image dimensions */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Ad Image Dimensions</h3>
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Width (px)</label>
            <input
              type="number"
              min={100}
              max={4000}
              value={imageWidth}
              onChange={(e) => { setImageWidth(Number(e.target.value)); setSaved(false); }}
              className={inputClass + " w-28"}
            />
          </div>
          <span className="text-gray-400 mt-4">&times;</span>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Height (px)</label>
            <input
              type="number"
              min={50}
              max={4000}
              value={imageHeight}
              onChange={(e) => { setImageHeight(Number(e.target.value)); setSaved(false); }}
              className={inputClass + " w-28"}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">Uploaded ad images will be resized to fit these dimensions.</p>
      </div>

      {/* Sort order */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Default sort order</label>
        <select
          value={sortOrder}
          onChange={(e) => { setSortOrder(e.target.value as typeof sortOrder); setSaved(false); }}
          className={inputClass + " w-48"}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="priority">Priority (manual)</option>
        </select>
      </div>

      {/* Fee (disabled) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ad fee (USD)</label>
        <div className="relative w-36">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled
            value={(feeCents / 100).toFixed(2)}
            className={inputClass + " pl-7 bg-gray-50 text-gray-400 cursor-not-allowed"}
          />
        </div>
        <p className="mt-1 text-xs text-gray-400">Billing not yet active — this field is reserved for future use.</p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {saved && <p className="text-sm text-green-600">Settings saved.</p>}
    </div>
  );
}

type SocialPlatformKey = "facebook" | "instagram" | "twitter";

const SOCIAL_PLATFORMS: { key: SocialPlatformKey; label: string; configLabel: string; configPlaceholder: string }[] = [
  { key: "facebook", label: "Facebook", configLabel: "Page ID", configPlaceholder: "e.g. 123456789" },
  { key: "instagram", label: "Instagram", configLabel: "Instagram User ID", configPlaceholder: "e.g. 17841400008460056" },
  { key: "twitter", label: "Twitter / X", configLabel: "Handle", configPlaceholder: "e.g. MyBreedClub" },
];

type PlatformConfig = { enabled: boolean; config: string };

function SocialIntegrationsTab() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [platforms, setPlatforms] = useState<Record<SocialPlatformKey, PlatformConfig>>({
    facebook: { enabled: false, config: "" },
    instagram: { enabled: false, config: "" },
    twitter: { enabled: false, config: "" },
  });

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const result = await api.get<{ settings: Record<string, unknown> }>("/admin/settings", { token });
        const si = result.settings?.social_integrations as Record<string, unknown> | undefined;
        if (si) {
          setPlatforms((prev) => {
            const next = { ...prev };
            for (const key of ["facebook", "instagram", "twitter"] as SocialPlatformKey[]) {
              const p = si[key] as Record<string, unknown> | undefined;
              if (p) {
                next[key] = {
                  enabled: typeof p.enabled === "boolean" ? p.enabled : false,
                  config: typeof (p.page_id ?? p.account_id ?? p.handle) === "string"
                    ? String(p.page_id ?? p.account_id ?? p.handle ?? "")
                    : "",
                };
              }
            }
            return next;
          });
        }
      } catch {
        // defaults fine
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const setEnabled = (key: SocialPlatformKey, val: boolean) => {
    setPlatforms((prev) => ({ ...prev, [key]: { ...prev[key], enabled: val } }));
    setSaved(false);
  };

  const setConfig = (key: SocialPlatformKey, val: string) => {
    setPlatforms((prev) => ({ ...prev, [key]: { ...prev[key], config: val } }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const token = await getToken();
      const configKeys: Record<SocialPlatformKey, string> = {
        facebook: "page_id",
        instagram: "account_id",
        twitter: "handle",
      };
      const social_integrations: Record<string, unknown> = {};
      for (const key of ["facebook", "instagram", "twitter"] as SocialPlatformKey[]) {
        social_integrations[key] = {
          enabled: platforms[key].enabled,
          [configKeys[key]]: platforms[key].config,
        };
      }
      await api.patch("/admin/settings", { social_integrations }, { token });
      setSaved(true);
    } catch {
      // fail silently
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Enable social media platforms to automatically post when a litter ad is approved. Access credentials
        (tokens, secrets) are configured as <strong>wrangler secrets</strong> on the server — they are not
        stored here.
      </p>

      <div className="space-y-4">
        {SOCIAL_PLATFORMS.map(({ key, label, configLabel, configPlaceholder }) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{label}</h3>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={platforms[key].enabled}
                  onChange={(e) => setEnabled(key, e.target.checked)}
                  className="rounded border-gray-300"
                />
                Enabled
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{configLabel}</label>
                <input
                  type="text"
                  value={platforms[key].config}
                  onChange={(e) => setConfig(key, e.target.value)}
                  placeholder={configPlaceholder}
                  className={inputClass}
                />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                  API tokens and secrets are stored as server environment secrets, not in the database.
                  Contact your server administrator to update credentials.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {saved && <p className="text-sm text-green-600">Settings saved.</p>}
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<"membership" | "settings" | "voting" | "tiers" | "ads" | "social">("membership");

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab("membership")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "membership"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Membership Form
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "settings"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setTab("voting")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "voting"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Voting Tiers
        </button>
        <button
          onClick={() => setTab("tiers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "tiers"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Membership Tiers
        </button>
        <button
          onClick={() => setTab("ads")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "ads"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Litter Ads
        </button>
        <button
          onClick={() => setTab("social")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "social"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Social Integrations
        </button>
      </div>

      {tab === "membership" ? (
        <MembershipTab />
      ) : tab === "voting" ? (
        <VotingTiersTab />
      ) : tab === "tiers" ? (
        <MembershipTiersTab />
      ) : tab === "ads" ? (
        <LitterAdsTab />
      ) : tab === "social" ? (
        <SocialIntegrationsTab />
      ) : (
        <ClubSettingsTab />
      )}
    </div>
  );
}
