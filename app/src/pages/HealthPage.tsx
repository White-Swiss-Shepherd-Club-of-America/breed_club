/**
 * HealthPage - Submit and view health clearances for a dog
 */

import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { PdfViewer } from "../components/PdfViewer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../lib/api";
import { useDog } from "../hooks/useDogs";
import type { ResultSchema } from "@breed-club/shared";

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
}

interface Clearance {
  id: string;
  result: string;
  result_data?: Record<string, unknown> | null;
  result_detail?: string;
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link to={`/app/registry/${dogId}`} className="text-sm text-purple-600 hover:underline">
          &larr; Back to dog profile
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">Health Clearances</h1>

      {/* Submit Clearance Form */}
      {canManage && (
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Submit New Clearance</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Test Type Dropdown */}
          <div>
            <label className="block text-sm font-medium mb-1">Test Type</label>
            <select
              value={selectedTestType?.id || ""}
              onChange={(e) => {
                const testType = testTypes.find((t) => t.id === e.target.value) || null;
                setSelectedTestType(testType);
                setSelectedOrg(null);
                setSelectedResult("");
                setResultData({});
              }}
              className="w-full px-3 py-2 border rounded-lg"
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

          {/* Organization Dropdown (filtered by selected test type) */}
          {selectedTestType && (
            <div>
              <label className="block text-sm font-medium mb-1">Grading Organization</label>
              <select
                value={selectedOrg?.id || ""}
                onChange={(e) => {
                  const org =
                    selectedTestType.organizations.find((o) => o.id === e.target.value) || null;
                  setSelectedOrg(org);
                  setSelectedResult("");
                  setResultData({});
                }}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Select organization...</option>
                {selectedTestType.organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dynamic Result Form */}
          {selectedOrg && (
            <>
              {/* Enum dropdown (OFA-style or fallback) */}
              {!isStructuredSchema && enumOptions.length > 0 && (
                <EnumResultForm
                  options={enumOptions}
                  value={selectedResult}
                  onChange={setSelectedResult}
                />
              )}

              {/* Numeric L/R (PennHIP-style) */}
              {activeSchema?.type === "numeric_lr" && (
                <NumericLRForm
                  schema={activeSchema}
                  value={resultData}
                  onChange={setResultData}
                />
              )}

              {/* Point score L/R (ANKC/BVA-style) */}
              {activeSchema?.type === "point_score_lr" && (
                <PointScoreLRForm
                  schema={activeSchema}
                  value={resultData}
                  onChange={setResultData}
                />
              )}

              {/* Elbow L/R (ANKC-style) */}
              {activeSchema?.type === "elbow_lr" && (
                <ElbowLRForm value={resultData} onChange={setResultData} />
              )}
            </>
          )}

          {/* Test Date (required) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Test Date *</label>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Certificate Number</label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., OFA123456"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Certificate (PDF or Image)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                setCertificateFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setCertificateUrl("");
              }}
              className="w-full px-3 py-2 border rounded-lg"
            />
            {certificateFile && (
              <p className="text-sm text-gray-500 mt-1">
                {certificateFile.name} ({(certificateFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
            {!certificateFile && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Or paste a certificate URL</label>
                <input
                  type="url"
                  value={certificateUrl}
                  onChange={(e) => setCertificateUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="https://..."
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="Additional notes or details..."
            />
          </div>

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
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading certificate..." : submitClearance.isPending ? "Submitting..." : "Submit Clearance"}
          </button>

          {submitClearance.isError && (
            <div className="text-red-600 text-sm">
              Error submitting clearance. Please try again.
            </div>
          )}
          {submitClearance.isSuccess && (
            <div className="text-green-600 text-sm">
              Clearance submitted successfully! Awaiting verification.
            </div>
          )}
        </form>
      </div>
      )}

      {/* Existing Clearances */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Existing Clearances</h2>

        {clearancesLoading && <p className="text-gray-500">Loading clearances...</p>}

        {!clearancesLoading && clearances.length === 0 && (
          <p className="text-gray-500">No clearances submitted yet.</p>
        )}

        {!clearancesLoading && clearances.length > 0 && (
          <div className="space-y-6">
            {Object.entries(clearancesByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
                  {category}
                </h3>
                <div className="space-y-3">
                  {items.map((clearance) => (
                    <div
                      key={clearance.id}
                      className={`p-4 border-l-4 rounded ${
                        clearance.status === "approved"
                          ? "border-green-500 bg-green-50"
                          : clearance.status === "rejected"
                            ? "border-red-500 bg-red-50"
                            : "border-yellow-500 bg-yellow-50"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold">{clearance.test_type.name}</h4>
                          <p className="text-sm text-gray-600">
                            {clearance.organization.name} &bull; {clearance.result}
                          </p>
                          {clearance.result_data && (
                            <ResultDataDisplay resultData={clearance.result_data} />
                          )}
                          {clearance.test_date && (
                            <p className="text-sm text-gray-600 mt-1">
                              Test Date: {new Date(clearance.test_date).toLocaleDateString()}
                            </p>
                          )}
                          {clearance.certificate_number && (
                            <p className="text-sm text-gray-600">
                              Certificate: {clearance.certificate_number}
                            </p>
                          )}
                          {clearance.certificate_url && (() => {
                            const url = clearance.certificate_url.startsWith("http")
                              ? clearance.certificate_url
                              : `${import.meta.env.VITE_API_URL || "/api"}/uploads/certificate/${clearance.certificate_url}`;
                            const isImage = /\.(jpg|jpeg|png)$/i.test(clearance.certificate_url);
                            return isImage ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2">
                                <img
                                  src={url}
                                  alt="Certificate"
                                  className="max-w-sm max-h-48 rounded border object-contain"
                                />
                              </a>
                            ) : (
                              <div className="mt-2">
                                <PdfViewer url={url} />
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-purple-600 hover:underline mt-1 inline-block"
                                >
                                  Open in new tab &rarr;
                                </a>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-sm">
                          {clearance.status === "approved" && clearance.verified_at && (
                            <span className="px-2 py-1 bg-green-200 text-green-800 rounded">
                              Verified
                            </span>
                          )}
                          {clearance.status === "pending" && (
                            <span className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded">
                              Pending
                            </span>
                          )}
                          {clearance.status === "rejected" && (
                            <span className="px-2 py-1 bg-red-200 text-red-800 rounded">
                              Rejected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
