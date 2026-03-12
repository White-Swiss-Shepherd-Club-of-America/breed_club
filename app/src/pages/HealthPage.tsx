/**
 * HealthPage - Submit and view health clearances for a dog
 */

import { useState, useMemo, Fragment } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../lib/api";
import { useDog } from "../hooks/useDogs";
import type { ResultSchema } from "@breed-club/shared";
import { formatDate } from "../lib/utils";

interface TestType {
  id: string;
  name: string;
  short_name: string;
  category: string;
  result_options: string[];
  organizations: GradingOrg[];
}

interface GradingOrg {
  id: string;
  name: string;
  type: string;
  country?: string;
  website_url?: string;
  result_schema: ResultSchema | null;
  confidence?: number | null;
}

interface Clearance {
  id: string;
  result: string;
  result_data?: Record<string, unknown> | null;
  result_detail?: string;
  result_score?: number | null;
  result_score_left?: number | null;
  result_score_right?: number | null;
  test_date: string;
  certificate_number?: string;
  certificate_url?: string;
  status: string;
  verified_at?: string;
  notes?: string;
  test_type: {
    id: string;
    name: string;
    short_name: string;
    category: string;
  };
  organization: {
    id: string;
    name: string;
    type: string;
  };
}

// ─── Result Form Components ─────────────────────────────────────────────────

function EnumResultForm({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">Result</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg"
        required
      >
        <option value="">Select result...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumericLRForm({
  schema,
  value,
  onChange,
}: {
  schema: Extract<ResultSchema, { type: "numeric_lr" }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as Record<string, number>) || {};
  const right = (value.right as Record<string, number>) || {};

  const updateSide = (side: "left" | "right", key: string, val: number) => {
    const current = (value[side] as Record<string, number>) || {};
    onChange({ ...value, [side]: { ...current, [key]: val } });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Results</label>
      <div className="grid grid-cols-3 gap-2 text-sm font-medium text-gray-600">
        <div />
        <div className="text-center">Left</div>
        <div className="text-center">Right</div>
      </div>
      {schema.fields.map((field) => (
        <div key={field.key} className="grid grid-cols-3 gap-2 items-center">
          <label className="text-sm">
            {field.label}
            {field.unit && <span className="text-gray-400 ml-1">({field.unit})</span>}
          </label>
          <input
            type="number"
            value={left[field.key] ?? ""}
            onChange={(e) => updateSide("left", field.key, parseFloat(e.target.value))}
            min={field.min}
            max={field.max}
            step={field.step}
            className="px-2 py-1 border rounded text-center"
            required
          />
          <input
            type="number"
            value={right[field.key] ?? ""}
            onChange={(e) => updateSide("right", field.key, parseFloat(e.target.value))}
            min={field.min}
            max={field.max}
            step={field.step}
            className="px-2 py-1 border rounded text-center"
            required
          />
        </div>
      ))}
    </div>
  );
}

function PointScoreLRForm({
  schema,
  value,
  onChange,
}: {
  schema: Extract<ResultSchema, { type: "point_score_lr" }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as Record<string, number>) || {};
  const right = (value.right as Record<string, number>) || {};

  const leftTotal = schema.subcategories.reduce((sum, sc) => sum + (left[sc.key] || 0), 0);
  const rightTotal = schema.subcategories.reduce((sum, sc) => sum + (right[sc.key] || 0), 0);
  const grandTotal = leftTotal + rightTotal;

  const updateSide = (side: "left" | "right", key: string, val: number) => {
    const current = (value[side] as Record<string, number>) || {};
    const updated = { ...current, [key]: val };
    // Recalculate totals
    const sideTotal = schema.subcategories.reduce((sum, sc) => sum + (updated[sc.key] || 0), 0);
    updated.total = sideTotal;

    const otherSide = side === "left" ? "right" : "left";
    const otherTotal = ((value[otherSide] as Record<string, number>) || {}).total || 0;

    onChange({
      ...value,
      [side]: updated,
      total: sideTotal + otherTotal,
    });
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Point Scores</label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Subcategory</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Right</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Left</th>
              <th className="px-3 py-2 text-center font-medium text-gray-400 w-16">Max</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {schema.subcategories.map((sc) => (
              <tr key={sc.key}>
                <td className="px-3 py-1.5 text-gray-700">{sc.label}</td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={right[sc.key] ?? ""}
                    onChange={(e) => updateSide("right", sc.key, parseInt(e.target.value) || 0)}
                    min={0}
                    max={sc.max}
                    className="w-full px-2 py-1 border rounded text-center"
                    required
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={left[sc.key] ?? ""}
                    onChange={(e) => updateSide("left", sc.key, parseInt(e.target.value) || 0)}
                    min={0}
                    max={sc.max}
                    className="w-full px-2 py-1 border rounded text-center"
                    required
                  />
                </td>
                <td className="px-3 py-1.5 text-center text-gray-400">{sc.max}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-center">{rightTotal}</td>
              <td className="px-3 py-2 text-center">{leftTotal}</td>
              <td className="px-3 py-2 text-center text-purple-600">{grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ElbowLRForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as { mm_change?: number; grade?: number; uap?: boolean }) || {};
  const right = (value.right as { mm_change?: number; grade?: number; uap?: boolean }) || {};

  const updateSide = (side: "left" | "right", key: string, val: unknown) => {
    const current = (value[side] as Record<string, unknown>) || {};
    onChange({ ...value, [side]: { ...current, [key]: val } });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Elbow Results</label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Measurement</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Right</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Left</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Mm of change</td>
              <td className="px-3 py-1.5">
                <input
                  type="number"
                  value={right.mm_change ?? ""}
                  onChange={(e) => updateSide("right", "mm_change", parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="number"
                  value={left.mm_change ?? ""}
                  onChange={(e) => updateSide("left", "mm_change", parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                />
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Grade</td>
              <td className="px-3 py-1.5">
                <select
                  value={right.grade ?? ""}
                  onChange={(e) => updateSide("right", "grade", parseInt(e.target.value))}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {[0, 1, 2, 3].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <select
                  value={left.grade ?? ""}
                  onChange={(e) => updateSide("left", "grade", parseInt(e.target.value))}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {[0, 1, 2, 3].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">UAP</td>
              <td className="px-3 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={right.uap || false}
                  onChange={(e) => updateSide("right", "uap", e.target.checked)}
                  className="w-4 h-4"
                />
              </td>
              <td className="px-3 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={left.uap || false}
                  onChange={(e) => updateSide("left", "uap", e.target.checked)}
                  className="w-4 h-4"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Result Display Component ───────────────────────────────────────────────

function ResultDataDisplay({ resultData }: { resultData: Record<string, unknown> }) {
  const left = resultData.left as Record<string, unknown> | undefined;
  const right = resultData.right as Record<string, unknown> | undefined;
  const total = resultData.total as number | undefined;

  if (!left || !right) return null;

  const keys = Object.keys(left).filter((k) => k !== "total");

  return (
    <div className="mt-2 text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-normal pr-2" />
            <th className="text-center font-normal px-2">R</th>
            <th className="text-center font-normal px-2">L</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key} className="text-gray-600">
              <td className="pr-2">{key.replace(/_/g, " ")}</td>
              <td className="text-center px-2">{String(right[key] ?? "-")}</td>
              <td className="text-center px-2">{String(left[key] ?? "-")}</td>
            </tr>
          ))}
          {(left as Record<string, unknown>).total != null && (
            <tr className="font-semibold text-gray-800 border-t">
              <td className="pr-2">Total</td>
              <td className="text-center px-2">{String((right as Record<string, unknown>).total)}</td>
              <td className="text-center px-2">{String((left as Record<string, unknown>).total)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {total != null && (
        <div className="mt-1 font-semibold text-purple-700">Combined Total: {total}</div>
      )}
    </div>
  );
}

// ─── Result Summary Helper ──────────────────────────────────────────────────

function computeResultSummary(
  resultData: Record<string, unknown>,
  schema: ResultSchema
): string {
  switch (schema.type) {
    case "numeric_lr": {
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      if (!left || !right) return "";
      const parts = schema.fields.map(
        (f) => `${f.label}: L=${left[f.key]}, R=${right[f.key]}`
      );
      return parts.join("; ");
    }
    case "point_score_lr": {
      const total = resultData.total as number | undefined;
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      if (total != null && left?.total != null && right?.total != null) {
        return `${total} (R:${right.total}, L:${left.total})`;
      }
      return "";
    }
    case "elbow_lr": {
      const left = resultData.left as { grade?: number } | undefined;
      const right = resultData.right as { grade?: number } | undefined;
      if (left && right) {
        return `L: Grade ${left.grade ?? "?"}, R: Grade ${right.grade ?? "?"}`;
      }
      return "";
    }
    default:
      return "";
  }
}

// ─── Main Page Component ────────────────────────────────────────────────────

export function HealthPage() {
  const { dogId } = useParams<{ dogId: string }>();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { data: dogData } = useDog(dogId);
  const canManage = dogData?.canManageClearances ?? false;

  const [showForm, setShowForm] = useState(false);
  const [selectedTestType, setSelectedTestType] = useState<TestType | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<GradingOrg | null>(null);
  const [selectedResult, setSelectedResult] = useState("");
  const [resultData, setResultData] = useState<Record<string, unknown>>({});
  const [testDate, setTestDate] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [certificateUrl, setCertificateUrl] = useState("");
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");

  // Fetch test types catalog
  const { data: testTypesData } = useQuery({
    queryKey: ["health", "test-types"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ test_types: TestType[] }>("/health/test-types", { token });
    },
  });

  // Fetch clearances for this dog
  const { data: clearancesData, isLoading: clearancesLoading } = useQuery({
    queryKey: ["dogs", dogId, "clearances"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ clearances: Clearance[] }>(`/health/dogs/${dogId}/clearances`, { token });
    },
    enabled: !!dogId,
  });

  // Determine the active result schema based on selected org
  const activeSchema = useMemo(() => {
    return selectedOrg?.result_schema ?? null;
  }, [selectedOrg]);

  // Whether the current schema is structured (not enum / no schema)
  const isStructuredSchema = activeSchema && activeSchema.type !== "enum";

  // The effective enum options: from result_schema if enum type, otherwise from test type fallback
  const enumOptions = useMemo(() => {
    if (activeSchema?.type === "enum") return activeSchema.options;
    if (!activeSchema && selectedTestType) return selectedTestType.result_options;
    return [];
  }, [activeSchema, selectedTestType]);

  // Submit clearance mutation
  const submitClearance = useMutation({
    mutationFn: async (data: {
      health_test_type_id: string;
      organization_id: string;
      result: string;
      result_data?: Record<string, unknown> | null;
      test_date: string;
      certificate_number?: string;
      certificate_url?: string;
      notes?: string;
    }) => {
      const token = await getToken();
      return api.post(`/health/dogs/${dogId}/clearances`, data, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dogs", dogId, "clearances"] });
      resetForm();
    },
  });

  const resetForm = () => {
    setSelectedTestType(null);
    setSelectedOrg(null);
    setSelectedResult("");
    setResultData({});
    setTestDate("");
    setCertificateNumber("");
    setCertificateUrl("");
    setCertificateFile(null);
    setUploading(false);
    setNotes("");
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTestType || !selectedOrg || !testDate) {
      alert("Please select test type, organization, and test date");
      return;
    }

    // For structured schemas, compute the result summary from result_data
    let result = selectedResult;
    let submittedResultData: Record<string, unknown> | null = null;

    if (isStructuredSchema && activeSchema) {
      result = computeResultSummary(resultData, activeSchema);
      submittedResultData = resultData;
      if (!result) {
        alert("Please fill in all result fields");
        return;
      }
    } else if (!selectedResult) {
      alert("Please select a result");
      return;
    }

    // Upload certificate file first if provided
    let finalCertificateUrl = certificateUrl || undefined;
    if (certificateFile) {
      try {
        setUploading(true);
        const token = await getToken();
        const uploadResult = await api.upload<{ key: string }>(
          "/uploads/certificate",
          certificateFile,
          { token }
        );
        finalCertificateUrl = uploadResult.key;
      } catch {
        alert("Failed to upload certificate file. Please try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    submitClearance.mutate({
      health_test_type_id: selectedTestType.id,
      organization_id: selectedOrg.id,
      result,
      result_data: submittedResultData,
      test_date: testDate,
      certificate_number: certificateNumber || undefined,
      certificate_url: finalCertificateUrl,
      notes: notes || undefined,
    });
  };

  const testTypes = testTypesData?.test_types || [];
  const clearances = clearancesData?.clearances || [];

  // Group clearances by category
  const clearancesByCategory = clearances.reduce(
    (acc, c) => {
      const cat = c.test_type.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(c);
      return acc;
    },
    {} as Record<string, Clearance[]>
  );

  const dog = dogData?.dog;

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Compact header row */}
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/dogs/${dogId}`} className="text-sm text-purple-600 hover:underline shrink-0">
          &larr; Back
        </Link>
        <h1 className="text-lg font-bold text-gray-900 truncate">
          Health Clearances{dog ? ` — ${dog.registered_name || dog.call_name || ""}` : ""}
        </h1>
        {canManage && (
          <button
            onClick={() => setShowForm((f) => !f)}
            className="ml-auto shrink-0 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700"
          >
            {showForm ? "Cancel" : "+ Add Clearance"}
          </button>
        )}
      </div>

      {/* Collapsible submission form */}
      {canManage && showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Test Type + Org side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Test Type *</label>
                <select
                  value={selectedTestType?.id || ""}
                  onChange={(e) => {
                    const testType = testTypes.find((t) => t.id === e.target.value) || null;
                    setSelectedTestType(testType);
                    setSelectedOrg(null);
                    setSelectedResult("");
                    setResultData({});
                  }}
                  className="w-full px-2 py-1.5 border rounded-lg text-sm"
                  required
                >
                  <option value="">Select test type...</option>
                  {testTypes.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name} ({tt.short_name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Organization *</label>
                <select
                  value={selectedOrg?.id || ""}
                  onChange={(e) => {
                    const org =
                      selectedTestType?.organizations.find((o) => o.id === e.target.value) || null;
                    setSelectedOrg(org);
                    setSelectedResult("");
                    setResultData({});
                  }}
                  className="w-full px-2 py-1.5 border rounded-lg text-sm"
                  required
                  disabled={!selectedTestType}
                >
                  <option value="">Select org...</option>
                  {selectedTestType?.organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic result form */}
            {selectedOrg && (
              <>
                {!isStructuredSchema && enumOptions.length > 0 && (
                  <EnumResultForm
                    options={enumOptions}
                    value={selectedResult}
                    onChange={setSelectedResult}
                  />
                )}
                {activeSchema?.type === "numeric_lr" && (
                  <NumericLRForm schema={activeSchema} value={resultData} onChange={setResultData} />
                )}
                {activeSchema?.type === "point_score_lr" && (
                  <PointScoreLRForm schema={activeSchema} value={resultData} onChange={setResultData} />
                )}
                {activeSchema?.type === "elbow_lr" && (
                  <ElbowLRForm value={resultData} onChange={setResultData} />
                )}
              </>
            )}

            {/* Test Date + Cert # */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Test Date *</label>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Certificate #</label>
                <input
                  type="text"
                  value={certificateNumber}
                  onChange={(e) => setCertificateNumber(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded-lg text-sm"
                  placeholder="e.g., OFA123456"
                />
              </div>
            </div>

            {/* Certificate file / URL — compact row */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs font-medium text-gray-600 shrink-0">Certificate:</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  setCertificateFile(e.target.files?.[0] || null);
                  if (e.target.files?.[0]) setCertificateUrl("");
                }}
                className="text-sm"
              />
              {certificateFile ? (
                <span className="text-xs text-gray-500">
                  {certificateFile.name} ({(certificateFile.size / 1024).toFixed(0)} KB)
                </span>
              ) : (
                <>
                  <span className="text-xs text-gray-400">or URL:</span>
                  <input
                    type="url"
                    value={certificateUrl}
                    onChange={(e) => setCertificateUrl(e.target.value)}
                    className="px-2 py-1 border rounded text-sm flex-1 min-w-32"
                    placeholder="https://..."
                  />
                </>
              )}
            </div>

            {/* Notes — 1 row */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 border rounded-lg text-sm"
              rows={1}
              placeholder="Notes (optional)"
            />

            {/* Submit row */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={
                  submitClearance.isPending ||
                  uploading ||
                  !selectedTestType ||
                  !selectedOrg ||
                  !testDate ||
                  (!isStructuredSchema && !selectedResult)
                }
                className="bg-purple-600 text-white py-1.5 px-4 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading
                  ? "Uploading…"
                  : submitClearance.isPending
                    ? "Submitting…"
                    : "Submit Clearance"}
              </button>
              {submitClearance.isError && (
                <span className="text-red-600 text-sm">Error submitting. Please try again.</span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Clearances — compact table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {clearancesLoading && (
          <p className="text-gray-500 text-sm p-4">Loading clearances…</p>
        )}
        {!clearancesLoading && clearances.length === 0 && (
          <p className="text-gray-500 text-sm p-4">No clearances submitted yet.</p>
        )}
        {!clearancesLoading && clearances.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Test</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Org</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cert</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(clearancesByCategory).map(([category, items]) => (
                <Fragment key={category}>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td
                      colSpan={7}
                      className="py-1 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {category}
                    </td>
                  </tr>
                  {items.map((c) => {
                    const certUrl = c.certificate_url
                      ? c.certificate_url.startsWith("http")
                        ? c.certificate_url
                        : `${import.meta.env.VITE_API_URL || "/api"}/uploads/certificate/${c.certificate_url}`
                      : null;
                    const scoreDisplay =
                      c.result_score != null
                        ? `${c.result_score}`
                        : c.result_score_left != null && c.result_score_right != null
                          ? `L${c.result_score_left}/R${c.result_score_right}`
                          : "";
                    return (
                      <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-3 font-medium">{c.test_type.short_name}</td>
                        <td className="py-1.5 px-3">{c.result}</td>
                        <td className="py-1.5 px-3 text-purple-700 text-xs font-medium">{scoreDisplay}</td>
                        <td className="py-1.5 px-3 text-gray-500 text-xs">{c.organization.name}</td>
                        <td className="py-1.5 px-3 text-gray-500 text-xs">
                          {formatDate(c.test_date)}
                        </td>
                        <td className="py-1.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              c.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : c.status === "rejected"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {c.status === "approved"
                              ? "Verified"
                              : c.status === "rejected"
                                ? "Rejected"
                                : "Pending"}
                          </span>
                        </td>
                        <td className="py-1.5 px-3">
                          {certUrl ? (
                            <a
                              href={certUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 hover:underline text-xs"
                            >
                              View
                            </a>
                          ) : c.certificate_number ? (
                            <span className="text-gray-500 text-xs">{c.certificate_number}</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
