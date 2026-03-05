/**
 * Admin settings page.
 * Currently manages membership form fields; future: branding, colors, etc.
 */

import { useState } from "react";
import {
  useAdminFormFields,
  useCreateFormField,
  useUpdateFormField,
  useDeleteFormField,
} from "@/hooks/useFormFields";
import type { MembershipFormField } from "@breed-club/shared";
import { Plus, Pencil, EyeOff, Eye, X } from "lucide-react";

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
  options_text: string; // comma-separated input for options
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

export function SettingsPage() {
  const { data, isLoading } = useAdminFormFields();
  const createMutation = useCreateFormField();
  const updateMutation = useUpdateFormField();
  const deleteMutation = useDeleteFormField();

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
      // silently fail — UI will reflect actual state on next fetch
    }
  };

  const handleDelete = async (field: MembershipFormField) => {
    if (!confirm(`Deactivate "${field.label}"? It will no longer appear on the form.`)) return;
    try {
      await deleteMutation.mutateAsync(field.id);
    } catch {
      // silently fail
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure the questions shown on the membership application form.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> Add Field
          </button>
        )}
      </div>

      {/* Create/edit form */}
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
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save"}
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

      {/* Field list */}
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
    </div>
  );
}
