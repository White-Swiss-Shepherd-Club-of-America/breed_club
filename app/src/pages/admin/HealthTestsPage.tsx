/**
 * Admin page for managing health test types and grading organizations.
 * Two tabs: Test Types and Organizations.
 */

import { useState, useRef, useEffect } from "react";
import {
  useHealthTestTypes,
  useCreateHealthTestType,
  useUpdateHealthTestType,
  useDeleteHealthTestType,
  useOrganizations,
} from "@/hooks/useAdmin";
import type { HealthTestType, Organization, HealthCategory, ResultSchema, GradingOrg } from "@breed-club/shared";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { CertVersionsPanel } from "./CertVersionsPage";

type Tab = "test-types" | "cert-versions";

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
  // ── Orthopedic: Hips ──────────────────────────────────────────────────────
  {
    value: "ofa_hips",
    label: "OFA Hips (Excellent/Good/Fair/…)",
    schema: {
      type: "enum",
      options: ["Excellent", "Good", "Fair", "Borderline", "Mild", "Moderate", "Severe"],
      score_config: {
        score_map: { Excellent: 100, Good: 90, Fair: 70, Borderline: 50, Mild: 30, Moderate: 15, Severe: 0 },
      },
    },
  },
  {
    value: "fci_hips",
    label: "FCI/SV Hips (A1/A2/B1/B2/C/D/E)",
    schema: {
      type: "enum",
      options: ["A1", "A2", "B1", "B2", "C", "D", "E"],
      score_config: {
        score_map: { A1: 100, A2: 85, B1: 70, B2: 55, C: 30, D: 10, E: 0 },
      },
    },
  },
  {
    value: "pennhip",
    label: "PennHIP (Distraction Index L/R)",
    schema: {
      type: "numeric_lr",
      fields: [{ label: "Distraction Index", key: "di", min: 0, max: 1, step: 0.01 }],
      score_config: {
        field: "di",
        ranges: [
          { max: 0.3, score: 100 },
          { max: 0.4, score: 80 },
          { max: 0.5, score: 60 },
          { max: 0.6, score: 40 },
          { max: 0.7, score: 20 },
          { max: 1.0, score: 0 },
        ],
      },
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
      score_config: {
        ranges: [
          { max: 5, score: 100 },
          { max: 10, score: 90 },
          { max: 15, score: 75 },
          { max: 25, score: 50 },
          { max: 35, score: 25 },
          { max: 53, score: 0 },
        ],
      },
    },
  },
  // ── Orthopedic: Elbows ────────────────────────────────────────────────────
  {
    value: "ofa_elbows",
    label: "OFA Elbows (Normal/DJD1/DJD2/DJD3)",
    schema: {
      type: "enum",
      options: ["Normal", "DJD1", "DJD2", "DJD3"],
      score_config: {
        score_map: { Normal: 100, DJD1: 66, DJD2: 33, DJD3: 0 },
      },
    },
  },
  {
    value: "elbow_lr",
    label: "BVA/ANKC Elbows (Grade/mm/UAP L/R)",
    schema: {
      type: "elbow_lr",
      score_config: {
        score_map: { "0": 100, "1": 66, "2": 33, "3": 0 },
      },
    },
  },
  // ── General ───────────────────────────────────────────────────────────────
  {
    value: "normal_abnormal",
    label: "Normal / Abnormal",
    schema: {
      type: "enum",
      options: ["Normal", "Abnormal"],
      score_config: {
        score_map: { Normal: 100, Abnormal: 0 },
      },
    },
  },
  {
    value: "eye_exam",
    label: "Eye Exam (Normal/Breeder Option/Abnormal)",
    schema: {
      type: "enum",
      options: ["Normal", "Normal w/Breeder Option", "Abnormal"],
      score_config: {
        score_map: { Normal: 100, "Normal w/Breeder Option": 75, Abnormal: 0 },
      },
    },
  },
  // ── Genetic ───────────────────────────────────────────────────────────────
  {
    value: "genetic_clear_carrier",
    label: "Genetic: Clear / Carrier / Affected",
    schema: {
      type: "enum",
      options: ["Clear", "Carrier", "Affected"],
      score_config: {
        score_map: { Clear: 100, Carrier: 50, Affected: 0 },
      },
    },
  },
  {
    value: "dm_genetic",
    label: "Genetic: DM (Normal/Clear, Carrier, At Risk/Affected)",
    schema: {
      type: "enum",
      options: ["Normal/Clear", "Carrier", "At Risk/Affected"],
      score_config: {
        score_map: { "Normal/Clear": 100, Carrier: 50, "At Risk/Affected": 0 },
      },
    },
  },
  {
    value: "mdr1_genetic",
    label: "Genetic: MDR1 (Normal/Normal, Normal/Mutant, Mutant/Mutant)",
    schema: {
      type: "enum",
      options: ["Normal/Normal", "Normal/Mutant", "Mutant/Mutant"],
      score_config: {
        score_map: { "Normal/Normal": 100, "Normal/Mutant": 50, "Mutant/Mutant": 0 },
      },
    },
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

export function HealthTestsPage() {
  const [tab, setTab] = useState<Tab>("test-types");

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Health</h1>

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
          onClick={() => setTab("cert-versions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "cert-versions"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Cert Versions
        </button>
      </div>

      {tab === "test-types" ? <TestTypesTab /> : <CertVersionsPanel />}
    </div>
  );
}

// ─── Sort Header ─────────────────────────────────────────────────────────────

type TestTypeSortKey = "name" | "short_name" | "category" | "sort_order" | "is_required" | "is_active";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: TestTypeSortKey;
  currentSort: TestTypeSortKey;
  currentDir: SortDir;
  onSort: (key: TestTypeSortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th
      className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            {currentDir === "asc" ? (
              <path d="M6 2L10 8H2L6 2Z" />
            ) : (
              <path d="M6 10L2 4H10L6 10Z" />
            )}
          </svg>
        )}
      </span>
    </th>
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
  const [sortKey, setSortKey] = useState<TestTypeSortKey>("sort_order");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [categoryFilter, setCategoryFilter] = useState("");

  const testTypes = data?.data ?? [];
  const organizations = orgsData?.data ?? [];

  const handleSort = (key: TestTypeSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = categoryFilter
    ? testTypes.filter((tt: HealthTestType) => tt.category === categoryFilter)
    : testTypes;

  const sorted = [...filtered].sort((a: HealthTestType, b: HealthTestType) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "name":
      case "short_name":
      case "category":
        return dir * (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "");
      case "sort_order":
        return dir * ((a.sort_order ?? 0) - (b.sort_order ?? 0));
      case "is_required":
        return dir * (Number(a.is_required) - Number(b.is_required));
      case "is_active":
        return dir * (Number(a.is_active) - Number(b.is_active));
      default:
        return 0;
    }
  });

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
      {showForm && !editing && (
        <TestTypeForm
          key="new"
          testType={null}
          organizations={organizations}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
          <div className="w-full max-w-3xl my-8">
            <TestTypeForm
              key={editing.id}
              testType={editing}
              organizations={organizations}
              onSave={handleSave}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
              isPending={createMutation.isPending || updateMutation.isPending}
            />
          </div>
        </div>
      )}

      {!showForm && !editing && (
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
          >
            <Plus className="h-4 w-4" />
            Add Test Type
          </button>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
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
                <SortHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Short" sortKey="short_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Category" sortKey="category" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-medium text-gray-600">Results</th>
                <SortHeader label="Required" sortKey="is_required" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-medium text-gray-600">Grading Orgs</th>
                <SortHeader label="Active" sortKey="is_active" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((tt: HealthTestType) => (
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
                    {tt.is_required ? (
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

// ─── Enum Options Editor ────────────────────────────────────────────────────

function EnumOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const lastInputRef = useRef<HTMLInputElement>(null);
  const [shouldFocus, setShouldFocus] = useState(false);

  useEffect(() => {
    if (shouldFocus && lastInputRef.current) {
      lastInputRef.current.focus();
      setShouldFocus(false);
    }
  }, [shouldFocus, options.length]);

  const addOption = () => {
    onChange([...options, ""]);
    setShouldFocus(true);
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    onChange(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addOption();
    }
    if (e.key === "Backspace" && options[index] === "" && options.length > 0) {
      e.preventDefault();
      removeOption(index);
    }
  };

  return (
    <div className="mt-2 ml-[108px] space-y-1.5">
      {options.length === 0 && (
        <p className="text-xs text-amber-600">At least one option is required.</p>
      )}
      {options.map((opt, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            ref={index === options.length - 1 ? lastInputRef : undefined}
            type="text"
            value={opt}
            onChange={(e) => updateOption(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            placeholder={`Option ${index + 1}`}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-gray-900 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => removeOption(index)}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
            title="Remove option"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addOption}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
      >
        <Plus className="h-3 w-3" />
        Add option
      </button>
    </div>
  );
}

// ─── Score Config Editor ─────────────────────────────────────────────────────

function ScoreConfigEditor({
  schema,
  onChange,
  resultOptions = [],
}: {
  schema: ResultSchema | null;
  onChange: (updated: ResultSchema) => void;
  resultOptions?: string[];
}) {
  if (!schema) {
    // No structured schema — but if the test type has result_options, offer a quick way to enable scoring
    if (resultOptions.length === 0) return null;
    return (
      <div className="mt-1 ml-27">
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={false}
            onChange={() => {
              // Auto-promote to a scored enum schema using the test type's result_options
              onChange({
                type: "enum",
                options: resultOptions,
                score_config: {
                  score_map: Object.fromEntries(resultOptions.map((o) => [o, 0])),
                },
              });
            }}
            className="rounded"
          />
          Score mapping
        </label>
      </div>
    );
  }

  const hasScoreConfig = "score_config" in schema && schema.score_config != null;

  // Toggle score config on/off
  const toggleScoreConfig = () => {
    if (hasScoreConfig) {
      // Remove score_config
      const { score_config: _, ...rest } = schema as Record<string, unknown>;
      onChange(rest as ResultSchema);
    } else {
      // Initialize empty score_config
      switch (schema.type) {
        case "enum":
          onChange({ ...schema, score_config: { score_map: Object.fromEntries(schema.options.map((o) => [o, 0])) } });
          break;
        case "numeric_lr":
          onChange({ ...schema, score_config: { field: schema.fields[0]?.key ?? "", ranges: [{ max: 0, score: 100 }] } });
          break;
        case "point_score_lr":
          onChange({ ...schema, score_config: { ranges: [{ max: 0, score: 100 }] } });
          break;
        case "elbow_lr":
          onChange({ ...schema, score_config: { score_map: { "0": 100, "1": 66, "2": 33, "3": 0 } } });
          break;
      }
    }
  };

  return (
    <div className="mt-1 ml-27">
      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
        <input type="checkbox" checked={hasScoreConfig} onChange={toggleScoreConfig} className="rounded" />
        Score mapping
      </label>
      {hasScoreConfig && schema.type === "enum" && schema.score_config && (
        <div className="mt-1 space-y-1">
          {schema.options.map((opt) => (
            <div key={opt} className="flex items-center gap-2 ml-4">
              <span className="text-xs text-gray-600 w-32 truncate" title={opt}>{opt}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={schema.score_config!.score_map[opt] ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : 0;
                  onChange({
                    ...schema,
                    score_config: { score_map: { ...schema.score_config!.score_map, [opt]: val } },
                  });
                }}
                className="w-14 px-1 py-0.5 border rounded text-xs text-center"
              />
              <span className="text-xs text-gray-400">/100</span>
            </div>
          ))}
        </div>
      )}
      {hasScoreConfig && schema.type === "numeric_lr" && schema.score_config && (
        <div className="mt-1 ml-4 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Field:</span>
            <select
              value={schema.score_config.field}
              onChange={(e) => onChange({ ...schema, score_config: { ...schema.score_config!, field: e.target.value } })}
              className="px-1 py-0.5 border rounded text-xs"
            >
              {schema.fields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <RangesEditor
            ranges={schema.score_config.ranges}
            onChange={(ranges) => onChange({ ...schema, score_config: { ...schema.score_config!, ranges } })}
          />
        </div>
      )}
      {hasScoreConfig && schema.type === "point_score_lr" && schema.score_config && (
        <div className="mt-1 ml-4">
          <span className="text-xs text-gray-500">Per-side total ranges:</span>
          <RangesEditor
            ranges={schema.score_config.ranges}
            onChange={(ranges) => onChange({ ...schema, score_config: { ranges } })}
          />
        </div>
      )}
      {hasScoreConfig && schema.type === "elbow_lr" && schema.score_config && (
        <div className="mt-1 space-y-1">
          {["0", "1", "2", "3"].map((grade) => (
            <div key={grade} className="flex items-center gap-2 ml-4">
              <span className="text-xs text-gray-600 w-32">Grade {grade}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={schema.score_config!.score_map[grade] ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : 0;
                  onChange({
                    ...schema,
                    score_config: { score_map: { ...schema.score_config!.score_map, [grade]: val } },
                  });
                }}
                className="w-14 px-1 py-0.5 border rounded text-xs text-center"
              />
              <span className="text-xs text-gray-400">/100</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ranges Editor (for numeric_lr and point_score_lr) ──────────────────────

function RangesEditor({
  ranges,
  onChange,
}: {
  ranges: Array<{ max: number; score: number }>;
  onChange: (ranges: Array<{ max: number; score: number }>) => void;
}) {
  return (
    <div className="space-y-1">
      {ranges.map((range, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500">max:</span>
          <input
            type="number"
            step="any"
            value={range.max}
            onChange={(e) => {
              const updated = [...ranges];
              updated[i] = { ...range, max: parseFloat(e.target.value) || 0 };
              onChange(updated);
            }}
            className="w-16 px-1 py-0.5 border rounded text-xs text-center"
          />
          <span className="text-xs text-gray-500">score:</span>
          <input
            type="number"
            min={0}
            max={100}
            value={range.score}
            onChange={(e) => {
              const updated = [...ranges];
              updated[i] = { ...range, score: parseInt(e.target.value) || 0 };
              onChange(updated);
            }}
            className="w-14 px-1 py-0.5 border rounded text-xs text-center"
          />
          <button
            type="button"
            onClick={() => onChange(ranges.filter((_, j) => j !== i))}
            className="text-red-400 hover:text-red-600"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...ranges, { max: 0, score: 0 }])}
        className="text-xs text-blue-600 hover:underline"
      >
        + Add range
      </button>
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
  const [isRequired, setIsRequired] = useState(testType?.is_required ?? false);
  const [ratingCategory, setRatingCategory] = useState(testType?.rating_category ?? "");
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

  // Track per-org confidence values (1-10)
  const [orgConfidence, setOrgConfidence] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {};
    if (testType?.grading_orgs) {
      for (const org of testType.grading_orgs) {
        initial[org.id] = (org as GradingOrg).confidence ?? null;
      }
    }
    return initial;
  });

  // Track per-org thresholds
  const [orgThresholds, setOrgThresholds] = useState<Record<string, { auto_dq: number; poor: number; fair: number; good: number } | null>>(() => {
    const initial: Record<string, { auto_dq: number; poor: number; fair: number; good: number } | null> = {};
    if (testType?.grading_orgs) {
      for (const org of testType.grading_orgs) {
        initial[org.id] = (org as GradingOrg).thresholds ?? null;
      }
    }
    return initial;
  });

  // Cache enum options so they survive preset round-trips
  const [cachedEnumOptions, setCachedEnumOptions] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    if (testType?.grading_orgs) {
      for (const org of testType.grading_orgs) {
        const schema = (org as GradingOrg).result_schema;
        if (schema?.type === "enum") {
          initial[org.id] = schema.options;
        }
      }
    }
    return initial;
  });

  const updateEnumOptions = (orgId: string, options: string[]) => {
    const existing = orgSchemas[orgId];
    const scoreConfig = existing?.type === "enum" ? existing.score_config : undefined;
    setOrgSchema(orgId, { type: "enum", options, ...(scoreConfig ? { score_config: scoreConfig } : {}) });
    setCachedEnumOptions((prev) => ({ ...prev, [orgId]: options }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate enum schemas have at least one non-empty option
    for (const orgId of selectedOrgIds) {
      const schema = orgSchemas[orgId];
      if (schema?.type === "enum") {
        const nonEmpty = schema.options.filter((o) => o.trim().length > 0);
        if (nonEmpty.length === 0) {
          const org = organizations.find((o) => o.id === orgId);
          alert(`${org?.name ?? "Organization"}: Custom enum requires at least one option.`);
          return;
        }
      }
    }

    const results = resultOptions
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    onSave({
      name,
      short_name: shortName,
      category,
      result_options: results,
      is_required: isRequired,
      rating_category: ratingCategory || null,
      description: description || null,
      sort_order: sortOrder,
      grading_org_ids: selectedOrgIds,
      grading_orgs: selectedOrgIds.map((orgId) => {
        let schema = orgSchemas[orgId] ?? null;
        if (schema?.type === "enum") {
          schema = { ...schema, options: schema.options.filter((o) => o.trim().length > 0) };
        }
        return {
          organization_id: orgId,
          result_schema: schema,
          confidence: orgConfidence[orgId] ?? null,
          thresholds: orgThresholds[orgId] ?? null,
        };
      }),
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
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="rounded"
              />
              Required Test
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rating Category</label>
            <select
              value={ratingCategory}
              onChange={(e) => setRatingCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="">Auto (use category)</option>
              <option value="hips">Hips</option>
              <option value="elbows">Elbows</option>
              <option value="spine">Spine</option>
              <option value="patella">Patella</option>
              <option value="cardiac">Cardiac</option>
              <option value="genetics">Genetics</option>
              <option value="vision">Vision</option>
              <option value="dentition">Dentition</option>
              <option value="temperament">Temperament</option>
              <option value="other">Other</option>
            </select>
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
                  const isEnum = orgSchemas[orgId]?.type === "enum";
                  return (
                    <div key={orgId} className="text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-700 w-24">{org.name}</span>
                        <select
                          value={currentPreset}
                          onChange={(e) => {
                            const preset = RESULT_SCHEMA_PRESETS.find((p) => p.value === e.target.value);
                            if (preset?.value === "enum") {
                              const cached = cachedEnumOptions[orgId];
                              setOrgSchema(orgId, { type: "enum", options: cached ?? [] });
                            } else {
                              setOrgSchema(orgId, preset?.schema ?? null);
                            }
                          }}
                          className="px-2 py-1 border rounded text-xs flex-1"
                        >
                          {RESULT_SCHEMA_PRESETS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={orgConfidence[orgId] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            setOrgConfidence((prev) => ({ ...prev, [orgId]: val }));
                          }}
                          placeholder="1-10"
                          className="w-16 px-2 py-1 border rounded text-xs text-center"
                          title="Confidence (1-10)"
                        />
                        <span className="text-xs text-gray-400">conf.</span>
                      </div>
                      {isEnum && (
                        <EnumOptionsEditor
                          options={(orgSchemas[orgId] as { type: "enum"; options: string[] }).options}
                          onChange={(opts) => updateEnumOptions(orgId, opts)}
                        />
                      )}
                      <ScoreConfigEditor
                        schema={orgSchemas[orgId] ?? null}
                        onChange={(updated) => setOrgSchema(orgId, updated)}
                        resultOptions={resultOptions.split(",").map((s) => s.trim()).filter(Boolean)}
                      />
                      {/* Rating Thresholds */}
                      <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                        <div className="text-xs font-medium text-gray-600 mb-1">Rating Thresholds (score 0-100)</div>
                        <div className="grid grid-cols-4 gap-2">
                          {(["auto_dq", "poor", "fair", "good"] as const).map((level) => (
                            <div key={level}>
                              <label className="block text-[10px] text-gray-500 capitalize">{level === "auto_dq" ? "Auto DQ" : level}</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={orgThresholds[orgId]?.[level] ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value ? parseInt(e.target.value) : 0;
                                  setOrgThresholds((prev) => ({
                                    ...prev,
                                    [orgId]: {
                                      auto_dq: prev[orgId]?.auto_dq ?? 0,
                                      poor: prev[orgId]?.poor ?? 0,
                                      fair: prev[orgId]?.fair ?? 0,
                                      good: prev[orgId]?.good ?? 0,
                                      [level]: val,
                                    },
                                  }));
                                }}
                                className="w-full px-1 py-0.5 border rounded text-xs text-center"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
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

