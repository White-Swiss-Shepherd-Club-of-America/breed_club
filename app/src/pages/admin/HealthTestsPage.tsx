/**
 * Admin page for managing health test types and grading organizations.
 * Two tabs: Test Types and Organizations.
 */

import { useState } from "react";
import {
  useHealthTestTypes,
  useCreateHealthTestType,
  useUpdateHealthTestType,
  useDeleteHealthTestType,
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
} from "@/hooks/useAdmin";
import type { HealthTestType, Organization, HealthCategory, OrgType, ResultSchema, GradingOrg } from "@breed-club/shared";
import { Plus, Pencil, Trash2, X } from "lucide-react";

type Tab = "test-types" | "organizations";

const CATEGORIES: HealthCategory[] = [
  "orthopedic",
  "cardiac",
  "genetic",
  "vision",
  "thyroid",
  "dental",
  "other",
];

const RESULT_SCHEMA_PRESETS: { value: string; label: string; schema: ResultSchema | null }[] = [
  { value: "none", label: "Default (use result options)", schema: null },
  {
    value: "enum",
    label: "Custom enum",
    schema: { type: "enum", options: [] },
  },
  {
    value: "pennhip",
    label: "PennHIP (Distraction Index L/R)",
    schema: {
      type: "numeric_lr",
      fields: [{ label: "Distraction Index", key: "di", min: 0, max: 1, step: 0.01 }],
    },
  },
  {
    value: "bva_hips",
    label: "BVA/ANKC Hips (Point Score L/R)",
    schema: {
      type: "point_score_lr",
      subcategories: [
        { label: "Norberg Angle", key: "norberg_angle", max: 6 },
        { label: "Subluxation", key: "subluxation", max: 6 },
        { label: "Cranial acetabular edge", key: "cranial_acetabular_edge", max: 6 },
        { label: "Dorsal acetabular edge", key: "dorsal_acetabular_edge", max: 6 },
        { label: "Cranial effect acetabular rim", key: "cranial_effect_acetabular_rim", max: 6 },
        { label: "Acetabular fossa", key: "acetabular_fossa", max: 6 },
        { label: "Caudal acetabular edge", key: "caudal_acetabular_edge", max: 5 },
        { label: "Femoral head/neck exostosis", key: "femoral_head_neck_exostosis", max: 6 },
        { label: "Femoral head re-contouring", key: "femoral_head_recontouring", max: 6 },
      ],
    },
  },
  {
    value: "elbow_lr",
    label: "BVA/ANKC Elbows (Grade/mm/UAP L/R)",
    schema: { type: "elbow_lr" },
  },
];

function getPresetForSchema(schema: ResultSchema | null): string {
  if (!schema) return "none";
  if (schema.type === "elbow_lr") return "elbow_lr";
  if (schema.type === "point_score_lr") return "bva_hips";
  if (schema.type === "numeric_lr") return "pennhip";
  if (schema.type === "enum") return "enum";
  return "none";
}

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: "kennel_club", label: "Kennel Club" },
  { value: "health_testing", label: "Health Testing" },
  { value: "grading_body", label: "Grading Body" },
  { value: "pedigree_database", label: "Pedigree Database" },
];

export function HealthTestsPage() {
  const [tab, setTab] = useState<Tab>("test-types");

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Health Tests & Organizations</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab("test-types")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "test-types"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Test Types
        </button>
        <button
          onClick={() => setTab("organizations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "organizations"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Organizations
        </button>
      </div>

      {tab === "test-types" ? <TestTypesTab /> : <OrganizationsTab />}
    </div>
  );
}

// ─── Test Types Tab ──────────────────────────────────────────────────────────

function TestTypesTab() {
  const { data, isLoading } = useHealthTestTypes();
  const createMutation = useCreateHealthTestType();
  const updateMutation = useUpdateHealthTestType();
  const deleteMutation = useDeleteHealthTestType();
  const { data: orgsData } = useOrganizations();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HealthTestType | null>(null);

  const testTypes = data?.data ?? [];
  const organizations = orgsData?.data ?? [];

  const handleSave = async (formData: Record<string, unknown>) => {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, ...formData });
      setEditing(null);
    } else {
      await createMutation.mutateAsync(formData);
      setShowForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div>
      {(showForm || editing) && (
        <TestTypeForm
          testType={editing}
          organizations={organizations}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {!showForm && !editing && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-4 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
        >
          <Plus className="h-4 w-4" />
          Add Test Type
        </button>
      )}

      {testTypes.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No health test types configured yet.</p>
        </div>
      )}

      {testTypes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Short</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Results</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">CHIC</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Grading Orgs</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {testTypes.map((tt: HealthTestType) => (
                <tr key={tt.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{tt.name}</td>
                  <td className="px-4 py-3 text-gray-600">{tt.short_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                      {tt.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {tt.result_options?.join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    {tt.is_required_for_chic ? (
                      <span className="text-green-600 font-medium text-xs">Required</span>
                    ) : (
                      <span className="text-gray-400 text-xs">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {tt.grading_orgs?.map((o) => {
                      const go = o as GradingOrg;
                      const schema = go.result_schema;
                      const tag = schema ? ` (${schema.type})` : "";
                      return `${o.name}${tag}`;
                    }).join(", ") || "None"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium ${tt.is_active ? "text-green-600" : "text-red-500"}`}
                    >
                      {tt.is_active ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(tt)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {tt.is_active && (
                        <button
                          onClick={() => handleDelete(tt.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Deactivate"
                        >
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
      )}
    </div>
  );
}

// ─── Test Type Form ──────────────────────────────────────────────────────────

function TestTypeForm({
  testType,
  organizations,
  onSave,
  onCancel,
  isPending,
}: {
  testType: HealthTestType | null;
  organizations: Organization[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(testType?.name ?? "");
  const [shortName, setShortName] = useState(testType?.short_name ?? "");
  const [category, setCategory] = useState<string>(testType?.category ?? "other");
  const [resultOptions, setResultOptions] = useState(testType?.result_options?.join(", ") ?? "");
  const [isChic, setIsChic] = useState(testType?.is_required_for_chic ?? false);
  const [description, setDescription] = useState(testType?.description ?? "");
  const [sortOrder, setSortOrder] = useState(testType?.sort_order ?? 0);
  // Track per-org result schemas
  const [orgSchemas, setOrgSchemas] = useState<Record<string, ResultSchema | null>>(() => {
    const initial: Record<string, ResultSchema | null> = {};
    if (testType?.grading_orgs) {
      for (const org of testType.grading_orgs) {
        initial[org.id] = (org as GradingOrg).result_schema ?? null;
      }
    }
    return initial;
  });
  const selectedOrgIds = Object.keys(orgSchemas);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const results = resultOptions
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    onSave({
      name,
      short_name: shortName,
      category,
      result_options: results,
      is_required_for_chic: isChic,
      description: description || null,
      sort_order: sortOrder,
      grading_org_ids: selectedOrgIds,
      grading_orgs: selectedOrgIds.map((orgId) => ({
        organization_id: orgId,
        result_schema: orgSchemas[orgId] ?? null,
      })),
    });
  };

  const toggleOrg = (orgId: string) => {
    setOrgSchemas((prev) => {
      if (orgId in prev) {
        const next = { ...prev };
        delete next[orgId];
        return next;
      }
      return { ...prev, [orgId]: null };
    });
  };

  const setOrgSchema = (orgId: string, schema: ResultSchema | null) => {
    setOrgSchemas((prev) => ({ ...prev, [orgId]: schema }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {testType ? "Edit Test Type" : "New Test Type"}
        </h3>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="e.g. Hip Evaluation"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Short Name</label>
            <input
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="e.g. Hips"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
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
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isChic}
                onChange={(e) => setIsChic(e.target.checked)}
                className="rounded"
              />
              Required for CHIC
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Result Options <span className="text-gray-400">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={resultOptions}
            onChange={(e) => setResultOptions(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            placeholder="e.g. Normal, Mild, Moderate, Severe"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {organizations.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Grading Organizations</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {organizations
                .filter((o) => o.is_active)
                .map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => toggleOrg(org.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      selectedOrgIds.includes(org.id)
                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {org.name}
                  </button>
                ))}
            </div>
            {/* Per-org result schema selection */}
            {selectedOrgIds.length > 0 && (
              <div className="space-y-2 mt-2 pl-2 border-l-2 border-blue-100">
                {selectedOrgIds.map((orgId) => {
                  const org = organizations.find((o) => o.id === orgId);
                  if (!org) return null;
                  const currentPreset = getPresetForSchema(orgSchemas[orgId] ?? null);
                  return (
                    <div key={orgId} className="flex items-center gap-3 text-sm">
                      <span className="font-medium text-gray-700 w-24">{org.name}</span>
                      <select
                        value={currentPreset}
                        onChange={(e) => {
                          const preset = RESULT_SCHEMA_PRESETS.find((p) => p.value === e.target.value);
                          setOrgSchema(orgId, preset?.schema ?? null);
                        }}
                        className="px-2 py-1 border rounded text-xs flex-1"
                      >
                        {RESULT_SCHEMA_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {isPending ? "Saving..." : testType ? "Update" : "Create"}
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

// ─── Organizations Tab ──────────────────────────────────────────────────────

function OrganizationsTab() {
  const { data, isLoading } = useOrganizations();
  const createMutation = useCreateOrganization();
  const updateMutation = useUpdateOrganization();
  const deleteMutation = useDeleteOrganization();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  const orgs = data?.data ?? [];

  const handleSave = async (formData: Record<string, unknown>) => {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, ...formData });
      setEditing(null);
    } else {
      await createMutation.mutateAsync(formData);
      setShowForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div>
      {(showForm || editing) && (
        <OrgForm
          org={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {!showForm && !editing && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-4 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
        >
          <Plus className="h-4 w-4" />
          Add Organization
        </button>
      )}

      {orgs.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No organizations configured yet.</p>
        </div>
      )}

      {orgs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Country</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Website</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org: Organization) => (
                <tr key={org.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {org.name}
                    {org.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{org.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {ORG_TYPES.find((t) => t.value === org.type)?.label || org.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{org.country || "-"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {org.website_url ? (
                      <a
                        href={org.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Link
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium ${org.is_active ? "text-green-600" : "text-red-500"}`}
                    >
                      {org.is_active ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(org)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {org.is_active && (
                        <button
                          onClick={() => handleDelete(org.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Deactivate"
                        >
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
      )}
    </div>
  );
}

// ─── Organization Form ──────────────────────────────────────────────────────

function OrgForm({
  org,
  onSave,
  onCancel,
  isPending,
}: {
  org: Organization | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(org?.name ?? "");
  const [type, setType] = useState<string>(org?.type ?? "health_testing");
  const [country, setCountry] = useState(org?.country ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(org?.website_url ?? "");
  const [description, setDescription] = useState(org?.description ?? "");
  const [sortOrder, setSortOrder] = useState(org?.sort_order ?? 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      type,
      country: country || null,
      website_url: websiteUrl || null,
      description: description || null,
      sort_order: sortOrder,
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {org ? "Edit Organization" : "New Organization"}
        </h3>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="e.g. OFA"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={2}
              placeholder="US"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {isPending ? "Saving..." : org ? "Update" : "Create"}
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
