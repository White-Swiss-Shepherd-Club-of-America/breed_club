/**
 * Admin page for managing health certificate versions.
 * Each version snapshots which tests are required and how scoring works at a point in time.
 */

import { useState } from "react";
import {
  useCertVersions,
  useCreateCertVersion,
  useUpdateCertVersion,
  useDeleteCertVersion,
  useHealthTestTypes,
} from "@/hooks/useAdmin";
import type { HealthCertVersion, HealthTestType, ScoreThresholds } from "@breed-club/shared";
import { Plus, Pencil, Trash2, X, Copy } from "lucide-react";

const DEFAULT_WEIGHTS: Record<string, number> = {
  hips: 20,
  genetics: 20,
  elbows: 15,
  vision: 12,
  spine: 10,
  cardiac: 8,
  patella: 5,
  dentition: 3,
  temperament: 5,
  other: 2,
};

const DEFAULT_CRITICAL = ["hips", "genetics", "elbows"];

const DEFAULT_THRESHOLDS: ScoreThresholds = {
  red: 20,
  orange: 40,
  yellow: 60,
  green: 95,
};

interface FormState {
  version_name: string;
  effective_date: string;
  required_test_type_ids: string[];
  category_weights: Record<string, number>;
  critical_categories: string[];
  score_thresholds: ScoreThresholds;
  notes: string;
}

const emptyForm: FormState = {
  version_name: "",
  effective_date: "",
  required_test_type_ids: [],
  category_weights: { ...DEFAULT_WEIGHTS },
  critical_categories: [...DEFAULT_CRITICAL],
  score_thresholds: { ...DEFAULT_THRESHOLDS },
  notes: "",
};

export function CertVersionsPanel() {
  const { data: versionsData, isLoading } = useCertVersions();
  const { data: testTypesData } = useHealthTestTypes();
  const createMutation = useCreateCertVersion();
  const updateMutation = useUpdateCertVersion();
  const deleteMutation = useDeleteCertVersion();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });

  const versions = versionsData?.data ?? [];
  const testTypes = testTypesData?.data ?? [];

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEdit(v: HealthCertVersion) {
    setEditingId(v.id);
    setForm({
      version_name: v.version_name,
      effective_date: v.effective_date,
      required_test_type_ids: [...v.required_test_type_ids],
      category_weights: { ...v.category_weights },
      critical_categories: [...v.critical_categories],
      score_thresholds: { ...v.score_thresholds },
      notes: v.notes ?? "",
    });
    setShowForm(true);
  }

  function prefillFromCurrent() {
    const requiredIds = testTypes
      .filter((tt: HealthTestType) => tt.is_required)
      .map((tt: HealthTestType) => tt.id);
    setForm((f) => ({
      ...f,
      required_test_type_ids: requiredIds,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      notes: form.notes || null,
    };

    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setShowForm(false);
    setEditingId(null);
  }

  function toggleTestType(id: string) {
    setForm((f) => ({
      ...f,
      required_test_type_ids: f.required_test_type_ids.includes(id)
        ? f.required_test_type_ids.filter((x) => x !== id)
        : [...f.required_test_type_ids, id],
    }));
  }

  function toggleCritical(cat: string) {
    setForm((f) => ({
      ...f,
      critical_categories: f.critical_categories.includes(cat)
        ? f.critical_categories.filter((x) => x !== cat)
        : [...f.critical_categories, cat],
    }));
  }

  function updateWeight(key: string, value: string) {
    setForm((f) => ({
      ...f,
      category_weights: { ...f.category_weights, [key]: Number(value) || 0 },
    }));
  }

  function updateThreshold(key: keyof ScoreThresholds, value: string) {
    setForm((f) => ({
      ...f,
      score_thresholds: { ...f.score_thresholds, [key]: Number(value) || 0 },
    }));
  }

  // Get unique categories from test types
  const categories = [...new Set(testTypes.map((tt: HealthTestType) => tt.category))];

  if (isLoading) {
    return <div className="max-w-4xl mx-auto p-4">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Certificate Versions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define health testing standards that apply at different points in time.
            Dogs are evaluated against the version active when they were last tested.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
        >
          <Plus className="h-4 w-4" />
          New Version
        </button>
      </div>

      {/* Version list */}
      <div className="space-y-4">
        {versions.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            No certificate versions defined yet. All dogs are evaluated against the current club configuration.
          </div>
        )}

        {versions.map((v: HealthCertVersion) => (
          <div
            key={v.id}
            className={`bg-white rounded-xl border p-6 ${v.is_active ? "border-gray-200" : "border-gray-100 opacity-60"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {v.version_name}
                  {!v.is_active && (
                    <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                      Inactive
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Effective from: {new Date(v.effective_date).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-500">
                  {v.required_test_type_ids.length} required tests
                  {" · "}
                  {v.critical_categories.length} critical categories
                </p>
                {v.notes && (
                  <p className="text-sm text-gray-400 mt-2 italic">{v.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(v)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Deactivate this certificate version?")) {
                      deleteMutation.mutate(v.id);
                    }
                  }}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-50"
                  title="Deactivate"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-16 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 mb-16">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit Certificate Version" : "New Certificate Version"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Version Name
                  </label>
                  <input
                    type="text"
                    value={form.version_name}
                    onChange={(e) => setForm((f) => ({ ...f, version_name: e.target.value }))}
                    placeholder='e.g., "2024 Standard"'
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={form.effective_date}
                    onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Required test types */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Required Tests ({form.required_test_type_ids.length} selected)
                  </label>
                  <button
                    type="button"
                    onClick={prefillFromCurrent}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                  >
                    <Copy className="h-3 w-3" />
                    Prefill from current
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  {testTypes.map((tt: HealthTestType) => (
                    <label
                      key={tt.id}
                      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.required_test_type_ids.includes(tt.id)}
                        onChange={() => toggleTestType(tt.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">{tt.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{tt.category}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Category weights */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category Weights
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(form.category_weights).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-28 capitalize">{key}</span>
                      <input
                        type="number"
                        value={value}
                        onChange={(e) => updateWeight(key, e.target.value)}
                        min="0"
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Critical categories */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Critical Categories
                  <span className="font-normal text-gray-400 ml-1">
                    (poor results in these cap the rating at yellow)
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCritical(cat)}
                      className={`px-3 py-1 rounded-full text-sm capitalize ${
                        form.critical_categories.includes(cat)
                          ? "bg-red-100 text-red-700 border border-red-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Score thresholds */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Score Thresholds (overall score → color)
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {(["red", "orange", "yellow", "green"] as const).map((color) => (
                    <div key={color} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          background:
                            color === "red"
                              ? "#dc3545"
                              : color === "orange"
                                ? "#fd7e14"
                                : color === "yellow"
                                  ? "#ffc107"
                                  : "#28a745",
                        }}
                      />
                      <span className="text-sm text-gray-600 capitalize">{color} ≤</span>
                      <input
                        type="number"
                        value={form.score_thresholds[color]}
                        onChange={(e) => updateThreshold(color, e.target.value)}
                        min="0"
                        max="100"
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Optional description of changes in this version..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editingId ? "Update Version" : "Create Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function CertVersionsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <CertVersionsPanel />
    </div>
  );
}
