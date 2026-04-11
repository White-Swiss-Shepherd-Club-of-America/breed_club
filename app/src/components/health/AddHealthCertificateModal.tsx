import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dna, Bone, Heart, FlaskConical, ScanEye, SmilePlus, X, Plus, Trash2, ArrowLeft, ScanLine, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDogs } from "@/hooks/useDogs";
import {
  type GradingOrg,
  type TestType,
  ResultFormRouter,
  computeResultSummary,
} from "./ResultForms";
import { OrgTypeahead } from "./OrgTypeahead";
import { preparePageImages } from "@/lib/pdf-to-images";
import { CertDraftReview, type ExtractionResponse, type SubmitClearance } from "./CertDraftReview";

interface AddHealthCertificateModalProps {
  open: boolean;
  onClose: () => void;
  dogId?: string;
  initialDogId?: string;
}

type Step = "dog" | "category" | "results" | "upload" | "scanning" | "review";

interface PendingTest {
  id: string;
  testType: TestType;
  result: string;
  resultData: Record<string, unknown> | null;
}

interface TestRow {
  id: string;
  testTypeId: string;
  result: string;
  resultData: Record<string, unknown>;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Dna; description: string }> = {
  genetic: { label: "DNA / Genetic", icon: Dna, description: "Gene tests, panels, DNA profiles" },
  orthopedic: { label: "Orthopedic", icon: Bone, description: "Hips, elbows, patellas" },
  cardiac: { label: "Cardiac", icon: Heart, description: "Heart evaluations" },
  thyroid: { label: "Hormone", icon: FlaskConical, description: "Thyroid, endocrine tests" },
  vision: { label: "Vision", icon: ScanEye, description: "Eye examinations" },
  dental: { label: "Dental", icon: SmilePlus, description: "Dentition evaluations" },
};

const CATEGORY_ORDER = ["genetic", "orthopedic", "cardiac", "thyroid", "vision", "dental"];

export function AddHealthCertificateModal({
  open,
  onClose,
  dogId,
  initialDogId,
}: AddHealthCertificateModalProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  // Step state
  const [step, setStep] = useState<Step>(dogId ? "category" : "dog");

  // Dog selection
  const [selectedDogId, setSelectedDogId] = useState("");
  const [dogSearch, setDogSearch] = useState("");

  // Category & org
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<GradingOrg | null>(null);

  // Shared fields
  const [testDate, setTestDate] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Test rows (multiple results in one session)
  const [testRows, setTestRows] = useState<TestRow[]>([]);

  // Upload step
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateUrl, setCertificateUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Finalized pending tests (built from testRows when moving to upload step)
  const [pendingTests, setPendingTests] = useState<PendingTest[]>([]);

  // Cert extraction state
  const [extractionResult, setExtractionResult] = useState<ExtractionResponse | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: dogsData } = useDogs({
    ownedOnly: true,
    search: dogSearch || undefined,
    page: 1,
    sortBy: "registered_name",
    sortDir: "asc",
  });
  const userDogs = dogsData?.data ?? [];

  const { data: testTypesData, isFetching: isLoadingTestTypes } = useQuery({
    queryKey: ["health", "test-types"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ test_types: TestType[] }>("/health/test-types", { token });
    },
  });

  const allTestTypes = testTypesData?.test_types || [];

  // Derive available categories from test type data
  const availableCategories = useMemo(() => {
    const cats = new Set(allTestTypes.map((tt) => tt.category));
    return CATEGORY_ORDER.filter((c) => cats.has(c));
  }, [allTestTypes]);

  // Derive unique orgs for the selected category
  const orgsForCategory = useMemo(() => {
    if (!selectedCategory) return [];
    const seen = new Map<string, GradingOrg>();
    allTestTypes
      .filter((tt) => tt.category === selectedCategory)
      .flatMap((tt) => tt.organizations)
      .forEach((org) => {
        if (!seen.has(org.id)) seen.set(org.id, org);
      });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allTestTypes, selectedCategory]);

  // Test types filtered by category + selected org
  const availableTestTypes = useMemo(() => {
    if (!selectedCategory || !selectedOrg) return [];
    return allTestTypes
      .filter((tt) => tt.category === selectedCategory)
      .filter((tt) => tt.organizations.some((o) => o.id === selectedOrg.id));
  }, [allTestTypes, selectedCategory, selectedOrg]);

  // Test types not yet added in current rows
  const remainingTestTypes = useMemo(() => {
    const usedIds = new Set(testRows.map((r) => r.testTypeId));
    return availableTestTypes.filter((tt) => !usedIds.has(tt.id));
  }, [availableTestTypes, testRows]);

  const resetForm = () => {
    setStep(dogId ? "category" : "dog");
    setSelectedDogId(dogId || initialDogId || "");
    setDogSearch("");
    setSelectedCategory(null);
    setSelectedOrg(null);
    setTestDate("");
    setCertificateNumber("");
    setNotes("");
    setTestRows([]);
    setPendingTests([]);
    setCertificateFile(null);
    setCertificateUrl("");
    setUploading(false);
    setExtractionResult(null);
    setExtractionError(null);
    setScanFile(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
      handleClose();
    },
  });

  // Get the org-specific result schema for a test type
  const getOrgSchema = (testType: TestType) => {
    if (!selectedOrg) return null;
    const orgEntry = testType.organizations.find((o) => o.id === selectedOrg.id);
    return orgEntry?.result_schema ?? null;
  };

  const getEnumOptions = (testType: TestType) => {
    const schema = getOrgSchema(testType);
    if (schema?.type === "enum") return schema.options;
    if (!schema) return testType.result_options;
    return [];
  };

  const addTestRow = () => {
    setTestRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), testTypeId: "", result: "", resultData: {} },
    ]);
  };

  const updateTestRow = (id: string, updates: Partial<TestRow>) => {
    setTestRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const removeTestRow = (id: string) => {
    setTestRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Validate and move to upload step
  const handleContinueToUpload = () => {
    if (!testDate) {
      alert("Please enter a test date");
      return;
    }
    if (testRows.length === 0) {
      alert("Please add at least one test result");
      return;
    }

    const validated: PendingTest[] = [];
    for (const row of testRows) {
      const testType = availableTestTypes.find((tt) => tt.id === row.testTypeId);
      if (!testType) {
        alert("Please select a test type for all rows");
        return;
      }

      const schema = getOrgSchema(testType);
      const isStructured = schema && schema.type !== "enum";

      if (isStructured) {
        const summary = computeResultSummary(row.resultData, schema);
        if (!summary) {
          alert(`Please fill in all result fields for ${testType.name}`);
          return;
        }
        validated.push({
          id: row.id,
          testType,
          result: summary,
          resultData: row.resultData,
        });
      } else {
        if (!row.result) {
          alert(`Please select a result for ${testType.name}`);
          return;
        }
        validated.push({
          id: row.id,
          testType,
          result: row.result,
          resultData: null,
        });
      }
    }

    setPendingTests(validated);
    setStep("upload");
  };

  const handleBatchSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const targetDogId = dogId || selectedDogId;
    if (!targetDogId) {
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
        organization_id: selectedOrg!.id,
        result: t.result,
        result_data: t.resultData,
        test_date: testDate,
        certificate_number: certificateNumber || undefined,
        notes: notes || undefined,
      })),
      certificate_url: finalCertificateUrl,
    });
  };

  // ─── Cert Scan Flow ──────────────────────────────────────────────
  const handleScanCert = async (file: File) => {
    const targetDogId = dogId || selectedDogId;
    if (!targetDogId) {
      alert("Please select a dog first");
      return;
    }

    setScanFile(file);
    setStep("scanning");
    setExtractionError(null);

    try {
      // Render PDF pages to images client-side
      // Render up to 6 pages — covers single certs (1), OFA panels (2-3),
      // Genoscoper/Embark (4-6). Wisdom Panel (16 pages) gets first 6 which
      // contains its full test table.
      const { pages } = await preparePageImages(file, 6);

      // Call extraction API
      const token = await getToken();
      const result = await api.extractCert<ExtractionResponse>(
        targetDogId,
        file,
        pages,
        { token }
      );

      setExtractionResult(result);

      if (result.fallback_to_manual) {
        // Extraction couldn't handle this cert — fall back to manual with cert uploaded
        setCertificateUrl(result.certificate_url);
        setExtractionError(result.fallback_reason || "Could not read this certificate automatically.");
        setStep("category");
      } else {
        setStep("review");
      }
    } catch (err) {
      console.error("Cert extraction failed:", err);
      setExtractionError(
        err instanceof Error ? err.message : "Certificate extraction failed. Please try manual entry."
      );
      setStep("category");
    }
  };

  const handleExtractionSubmit = (
    clearances: SubmitClearance[],
    certUrl: string,
    submissionNotes: string
  ) => {
    const targetDogId = dogId || selectedDogId;
    if (!targetDogId) return;

    submitBatch.mutate({
      clearances: clearances.map((c) => ({
        ...c,
        notes: submissionNotes || undefined,
      })),
      certificate_url: certUrl,
    });
  };

  const handleFallbackToManual = (certUrl: string) => {
    setCertificateUrl(certUrl);
    setExtractionResult(null);
    setStep("category");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {step !== "dog" && step !== "category" && step !== "scanning" && (
              <button
                type="button"
                onClick={() => {
                  if (step === "upload") {
                    setStep("results");
                  } else if (step === "results") {
                    setSelectedOrg(null);
                    setTestRows([]);
                    setStep("category");
                  } else if (step === "review") {
                    setExtractionResult(null);
                    setStep("category");
                  }
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {step === "dog" && "Add Health Certificate"}
              {step === "category" && "What type of certificate?"}
              {step === "results" && (
                <>
                  {CATEGORY_CONFIG[selectedCategory!]?.label}
                  {selectedOrg && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      via {selectedOrg.name}
                    </span>
                  )}
                </>
              )}
              {step === "upload" && "Upload Certificate"}
              {step === "scanning" && "Scanning Certificate"}
              {step === "review" && "Review Extracted Data"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Dog selection */}
        {step === "dog" && (
          <div className="space-y-3">
            <div className="p-3 border rounded-lg bg-gray-50">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Select Dog *
              </label>
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
            <button
              type="button"
              onClick={() => {
                if (!selectedDogId) {
                  alert("Please select a dog");
                  return;
                }
                setStep("category");
              }}
              className="bg-purple-600 text-white py-2 px-4 rounded-lg text-sm hover:bg-purple-700 w-full"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step: Category selection */}
        {step === "category" && (
          <div className="space-y-4">
            {/* Scan certificate option */}
            <div>
              <label
                htmlFor="cert-scan-input"
                className="flex items-center gap-3 p-4 border-2 border-dashed border-purple-300 rounded-xl cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-colors"
              >
                <ScanLine className="w-8 h-8 text-purple-600 shrink-0" />
                <div>
                  <span className="font-medium text-sm text-gray-900 block">
                    Scan Certificate
                  </span>
                  <span className="text-xs text-gray-500">
                    Upload a PDF or photo and we'll read it automatically
                  </span>
                </div>
                <input
                  id="cert-scan-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleScanCert(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {/* Extraction error banner */}
            {extractionError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                {extractionError} You can enter the details manually below.
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-xs text-gray-400">or enter manually</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* Category buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {availableCategories.map((cat) => {
                const config = CATEGORY_CONFIG[cat];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedOrg(null);
                      setTestRows([]);
                      setStep("results");
                    }}
                    className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-colors"
                  >
                    <Icon className="w-8 h-8 text-purple-600" />
                    <span className="font-medium text-sm text-gray-900">{config.label}</span>
                    <span className="text-xs text-gray-500 text-center">{config.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step: Scanning (loading state) */}
        {step === "scanning" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
            <p className="text-sm text-gray-600">Reading certificate...</p>
            <p className="text-xs text-gray-400">
              {scanFile?.name}
            </p>
          </div>
        )}

        {/* Step: Review extraction drafts */}
        {step === "review" && extractionResult && (
          <CertDraftReview
            extraction={extractionResult}
            allTestTypes={allTestTypes}
            onSubmit={handleExtractionSubmit}
            onFallbackToManual={handleFallbackToManual}
          />
        )}

        {/* Step: Results entry */}
        {step === "results" && selectedCategory && (
          <div className="space-y-4">
            {/* Org typeahead */}
            <OrgTypeahead
              organizations={orgsForCategory}
              value={selectedOrg}
              isLoading={isLoadingTestTypes}
              onChange={(org) => {
                setSelectedOrg(org);
                // Reset test rows when org changes since available tests differ
                setTestRows([]);
              }}
            />

            {selectedOrg && (
              <>
                {/* Shared fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Test Date *
                    </label>
                    <input
                      type="date"
                      value={testDate}
                      onChange={(e) => setTestDate(e.target.value)}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Certificate #
                    </label>
                    <input
                      type="text"
                      value={certificateNumber}
                      onChange={(e) => setCertificateNumber(e.target.value)}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm"
                      placeholder="e.g., OFA123456"
                    />
                  </div>
                </div>

                {/* Test result rows */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Test Results ({testRows.length})
                  </div>

                  {testRows.map((row, index) => {
                    const testType = availableTestTypes.find((tt) => tt.id === row.testTypeId);
                    const schema = testType ? getOrgSchema(testType) : null;
                    const enumOptions = testType ? getEnumOptions(testType) : [];

                    // Show test types not used by other rows (but keep current row's selection available)
                    const usedByOthers = new Set(
                      testRows.filter((r) => r.id !== row.id).map((r) => r.testTypeId)
                    );
                    const selectableTestTypes = availableTestTypes.filter(
                      (tt) => !usedByOthers.has(tt.id)
                    );

                    return (
                      <div
                        key={row.id}
                        className="border rounded-lg p-3 bg-gray-50 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">
                            Test {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeTestRow(row.id)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Test Type *
                          </label>
                          <select
                            value={row.testTypeId}
                            onChange={(e) => {
                              updateTestRow(row.id, {
                                testTypeId: e.target.value,
                                result: "",
                                resultData: {},
                              });
                            }}
                            className="w-full px-2 py-1.5 border rounded-lg text-sm"
                          >
                            <option value="">Select test...</option>
                            {selectableTestTypes.map((tt) => (
                              <option key={tt.id} value={tt.id}>
                                {tt.name} ({tt.short_name})
                              </option>
                            ))}
                          </select>
                        </div>

                        {testType && (
                          <ResultFormRouter
                            schema={schema}
                            enumOptions={enumOptions}
                            resultValue={row.result}
                            resultData={row.resultData}
                            onResultChange={(v) => updateTestRow(row.id, { result: v })}
                            onResultDataChange={(v) => updateTestRow(row.id, { resultData: v })}
                          />
                        )}
                      </div>
                    );
                  })}

                  {remainingTestTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={addTestRow}
                      className="flex items-center gap-1.5 border border-dashed border-purple-300 text-purple-600 py-2 px-4 rounded-lg text-sm hover:bg-purple-50 w-full justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      Add Test
                    </button>
                  )}

                  {testRows.length === 0 && (
                    <button
                      type="button"
                      onClick={addTestRow}
                      className="flex items-center gap-1.5 bg-purple-600 text-white py-2 px-4 rounded-lg text-sm hover:bg-purple-700 w-full justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      Add First Test
                    </button>
                  )}
                </div>

                {/* Continue button */}
                {testRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleContinueToUpload}
                    className="bg-purple-600 text-white py-2 px-4 rounded-lg text-sm hover:bg-purple-700 w-full"
                  >
                    Continue to Upload ({testRows.length} test{testRows.length !== 1 ? "s" : ""})
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Step: Upload & Submit */}
        {step === "upload" && (
          <form onSubmit={handleBatchSubmit} className="space-y-4">
            {/* Summary of pending tests */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Tests to Submit ({pendingTests.length})
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
                      <span className="text-gray-600">{t.result}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {selectedOrg?.name} &middot; {testDate}
                {certificateNumber && ` · #${certificateNumber}`}
              </div>
            </div>

            {/* File upload */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Certificate File
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
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
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-2 py-1.5 border rounded-lg text-sm"
                rows={2}
                placeholder="Any additional notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep("results")}
                className="text-sm text-purple-600 hover:underline"
              >
                &larr; Back to results
              </button>
              <button
                type="submit"
                disabled={submitBatch.isPending || uploading}
                className="bg-purple-600 text-white py-2 px-4 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex-1"
              >
                {uploading
                  ? "Uploading..."
                  : submitBatch.isPending
                    ? "Submitting..."
                    : `Submit ${pendingTests.length} Test${pendingTests.length !== 1 ? "s" : ""}`}
              </button>
            </div>
            {submitBatch.isError && (
              <p className="text-red-600 text-sm">
                {(submitBatch.error as { status?: number })?.status === 409
                  ? "One or more of these tests already exists for this dog. Go back and adjust the test type, organization, or date."
                  : "Something went wrong submitting. Please try again."}
              </p>
            )}
          </form>
        )}

        {/* Show batch submit errors on review step too */}
        {step === "review" && submitBatch.isError && (
          <p className="text-red-600 text-sm mt-2">
            {(submitBatch.error as { status?: number })?.status === 409
              ? "One or more of these tests already exists for this dog."
              : "Something went wrong submitting. Please try again."}
          </p>
        )}
      </div>
    </div>
  );
}
