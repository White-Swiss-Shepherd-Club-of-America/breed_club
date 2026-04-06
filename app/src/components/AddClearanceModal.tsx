import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResultSchema } from "@breed-club/shared";
import { api } from "@/lib/api";
import { useDogs } from "@/hooks/useDogs";

interface GradingOrg {
  id: string;
  name: string;
  type: string;
  country?: string;
  website_url?: string;
  result_schema: ResultSchema | null;
  confidence?: number | null;
}

interface TestType {
  id: string;
  name: string;
  short_name: string;
  category: string;
  result_options: string[];
  organizations: GradingOrg[];
}

interface AddClearanceModalProps {
  open: boolean;
  onClose: () => void;
  dogId?: string;
  initialDogId?: string;
}

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

function EnumLRForm({
  schema,
  value,
  onChange,
}: {
  schema: Extract<ResultSchema, { type: "enum_lr" }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as { value?: string }) || {};
  const right = (value.right as { value?: string }) || {};

  const updateSide = (side: "left" | "right", val: string) => {
    onChange({ ...value, [side]: { value: val } });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Results</label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Side</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Right</td>
              <td className="px-3 py-1.5">
                <select
                  value={right.value ?? ""}
                  onChange={(e) => updateSide("right", e.target.value)}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {schema.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Left</td>
              <td className="px-3 py-1.5">
                <select
                  value={left.value ?? ""}
                  onChange={(e) => updateSide("left", e.target.value)}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {schema.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
    case "enum_lr": {
      const left = resultData.left as { value?: string } | undefined;
      const right = resultData.right as { value?: string } | undefined;
      if (left && right) {
        return `L: ${left.value ?? "?"}, R: ${right.value ?? "?"}`;
      }
      return "";
    }
    default:
      return "";
  }
}

export function AddClearanceModal({ open, onClose, dogId, initialDogId }: AddClearanceModalProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [selectedDogId, setSelectedDogId] = useState<string>("");
  const [dogSearch, setDogSearch] = useState("");

  const [selectedTestType, setSelectedTestType] = useState<TestType | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<GradingOrg | null>(null);
  const [selectedResult, setSelectedResult] = useState("");
  const [resultData, setResultData] = useState<Record<string, unknown>>({});
  const [testDate, setTestDate] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingTests, setPendingTests] = useState<Array<{
    id: string;
    testType: TestType;
    org: GradingOrg;
    result: string;
    resultData: Record<string, unknown> | null;
    testDate: string;
    certificateNumber: string;
    notes: string;
  }>>([]);
  const [batchStep, setBatchStep] = useState<"entry" | "upload">("entry");
  const [certificateUrl, setCertificateUrl] = useState("");
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedDogId(dogId || initialDogId || "");
  }, [open, dogId, initialDogId]);

  const { data: dogsData } = useDogs({
    ownedOnly: true,
    search: dogSearch || undefined,
    page: 1,
    sortBy: "registered_name",
    sortDir: "asc",
  });
  const userDogs = dogsData?.data ?? [];

  const { data: testTypesData } = useQuery({
    queryKey: ["health", "test-types"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ test_types: TestType[] }>("/health/test-types", { token });
    },
    enabled: open,
  });

  const activeSchema = useMemo(() => selectedOrg?.result_schema ?? null, [selectedOrg]);
  const isStructuredSchema = activeSchema && activeSchema.type !== "enum";
  const enumOptions = useMemo(() => {
    if (activeSchema?.type === "enum") return activeSchema.options;
    if (!activeSchema && selectedTestType) return selectedTestType.result_options;
    return [];
  }, [activeSchema, selectedTestType]);

  const resetFormFields = () => {
    setSelectedTestType(null);
    setSelectedOrg(null);
    setSelectedResult("");
    setResultData({});
    setTestDate("");
    setCertificateNumber("");
    setNotes("");
  };

  const resetForm = () => {
    setDogSearch("");
    resetFormFields();
    setPendingTests([]);
    setBatchStep("entry");
    setCertificateUrl("");
    setCertificateFile(null);
    setUploading(false);
  };

  const submitBatch = useMutation({
    mutationFn: async (data: {
      clearances: Array<{
        health_test_type_id: string;
        organization_id: string;
        result: string;
        result_data?: Record<string, unknown> | null;
        test_date: string;
        certificate_number?: string;
        notes?: string;
      }>;
      certificate_url?: string;
    }) => {
      const targetDogId = dogId || selectedDogId;
      if (!targetDogId) throw new Error("Please select a dog");
      const token = await getToken();
      return api.post(`/health/dogs/${targetDogId}/clearances/batch`, data, { token });
    },
    onSuccess: () => {
      const targetDogId = dogId || selectedDogId;
      if (targetDogId) {
        queryClient.invalidateQueries({ queryKey: ["dogs", targetDogId, "clearances"] });
      }
      queryClient.invalidateQueries({ queryKey: ["myClearances"] });
      resetForm();
      onClose();
    },
  });

  const validateCurrentTest = (): typeof pendingTests[0] | null => {
    if (!selectedTestType || !selectedOrg || !testDate) {
      alert("Please select test type, organization, and test date");
      return null;
    }

    let result = selectedResult;
    let submittedResultData: Record<string, unknown> | null = null;

    if (isStructuredSchema && activeSchema) {
      result = computeResultSummary(resultData, activeSchema);
      submittedResultData = resultData;
      if (!result) {
        alert("Please fill in all result fields");
        return null;
      }
    } else if (!selectedResult) {
      alert("Please select a result");
      return null;
    }

    return {
      id: crypto.randomUUID(),
      testType: selectedTestType,
      org: selectedOrg,
      result,
      resultData: submittedResultData,
      testDate,
      certificateNumber,
      notes,
    };
  };

  const handleAddAnother = () => {
    const entry = validateCurrentTest();
    if (!entry) return;
    setPendingTests((prev) => [...prev, entry]);
    resetFormFields();
  };

  const handleComplete = () => {
    const entry = validateCurrentTest();
    if (!entry) return;
    setPendingTests((prev) => [...prev, entry]);
    resetFormFields();
    setBatchStep("upload");
  };

  const handleBatchSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!dogId && !selectedDogId) {
      alert("Please select a dog");
      return;
    }

    if (pendingTests.length === 0) {
      alert("No tests to submit");
      return;
    }

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

    submitBatch.mutate({
      clearances: pendingTests.map((t) => ({
        health_test_type_id: t.testType.id,
        organization_id: t.org.id,
        result: t.result,
        result_data: t.resultData,
        test_date: t.testDate,
        certificate_number: t.certificateNumber || undefined,
        notes: t.notes || undefined,
      })),
      certificate_url: finalCertificateUrl,
    });
  };

  if (!open) return null;

  const testTypes = testTypesData?.test_types || [];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          resetForm();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Add Health Clearances</h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
        </div>

        {!dogId && (
          <div className="mb-4 p-3 border rounded-lg bg-gray-50">
            <label className="block text-xs font-medium text-gray-600 mb-1">Select Dog *</label>
            <input
              type="text"
              value={dogSearch}
              onChange={(e) => setDogSearch(e.target.value)}
              className="w-full px-2 py-1.5 border rounded-lg text-sm mb-2"
              placeholder="Search your dogs..."
            />
            <select
              value={selectedDogId}
              onChange={(e) => setSelectedDogId(e.target.value)}
              className="w-full px-2 py-1.5 border rounded-lg text-sm"
              required
            >
              <option value="">Select a dog...</option>
              {userDogs.map((dog) => (
                <option key={dog.id} value={dog.id}>
                  {dog.registered_name}
                  {dog.call_name ? ` (${dog.call_name})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {pendingTests.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Tests to submit ({pendingTests.length})
            </div>
            <div className="space-y-1">
              {pendingTests.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded px-3 py-1.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{t.testType.short_name}</span>
                    <span className="text-gray-500 mx-1">&middot;</span>
                    <span className="text-gray-600">{t.org.name}</span>
                    <span className="text-gray-500 mx-1">&middot;</span>
                    <span className="text-gray-600">{t.result}</span>
                    <span className="text-gray-500 mx-1">&middot;</span>
                    <span className="text-gray-400">{t.testDate}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingTests((prev) => prev.filter((p) => p.id !== t.id))}
                    className="text-red-400 hover:text-red-600 text-xs ml-2"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {batchStep === "entry" ? (
          <div className="space-y-3">
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
                {activeSchema?.type === "enum_lr" && (
                  <EnumLRForm schema={activeSchema} value={resultData} onChange={setResultData} />
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Test Date *</label>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded-lg text-sm"
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

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 border rounded-lg text-sm"
              rows={1}
              placeholder="Notes (optional)"
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAddAnother}
                className="border border-purple-600 text-purple-600 py-1.5 px-4 rounded-lg text-sm hover:bg-purple-50"
              >
                + Add Another Test
              </button>
              <button
                type="button"
                onClick={handleComplete}
                className="bg-purple-600 text-white py-1.5 px-4 rounded-lg text-sm hover:bg-purple-700"
              >
                {pendingTests.length === 0
                  ? "Continue to Upload"
                  : `Complete & Upload (${pendingTests.length + 1} tests)`}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBatchSubmit} className="space-y-3">
            <div className="text-sm font-medium text-gray-700">
              Attach certificate for {pendingTests.length} test{pendingTests.length !== 1 ? "s" : ""}
            </div>

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

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setBatchStep("entry")}
                className="text-sm text-purple-600 hover:underline"
              >
                &larr; Add more tests
              </button>
              <button
                type="submit"
                disabled={submitBatch.isPending || uploading}
                className="bg-purple-600 text-white py-1.5 px-4 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading
                  ? "Uploading..."
                  : submitBatch.isPending
                    ? "Submitting..."
                    : `Submit ${pendingTests.length} Test${pendingTests.length !== 1 ? "s" : ""}`}
              </button>
              {submitBatch.isError && (
                <span className="text-red-600 text-sm">Error submitting. Please try again.</span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
