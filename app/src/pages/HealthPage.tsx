/**
 * HealthPage - Submit and view health clearances for a dog
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../lib/api";

interface TestType {
  id: string;
  name: string;
  short_name: string;
  category: string;
  result_options: string[];
  organizations: Organization[];
}

interface Organization {
  id: string;
  name: string;
  type: string;
  country?: string;
  website_url?: string;
}

interface Clearance {
  id: string;
  result: string;
  result_detail?: string;
  test_date?: string;
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

export function HealthPage() {
  const { dogId } = useParams<{ dogId: string }>();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [selectedTestType, setSelectedTestType] = useState<TestType | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedResult, setSelectedResult] = useState("");
  const [testDate, setTestDate] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [certificateUrl, setCertificateUrl] = useState("");
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

  // Submit clearance mutation
  const submitClearance = useMutation({
    mutationFn: async (data: {
      health_test_type_id: string;
      organization_id: string;
      result: string;
      test_date?: string;
      certificate_number?: string;
      certificate_url?: string;
      notes?: string;
    }) => {
      const token = await getToken();
      return api.post(`/health/dogs/${dogId}/clearances`, { token, body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dogs", dogId, "clearances"] });
      // Reset form
      setSelectedTestType(null);
      setSelectedOrg(null);
      setSelectedResult("");
      setTestDate("");
      setCertificateNumber("");
      setCertificateUrl("");
      setNotes("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTestType || !selectedOrg || !selectedResult) {
      alert("Please select test type, organization, and result");
      return;
    }

    submitClearance.mutate({
      health_test_type_id: selectedTestType.id,
      organization_id: selectedOrg.id,
      result: selectedResult,
      test_date: testDate || undefined,
      certificate_number: certificateNumber || undefined,
      certificate_url: certificateUrl || undefined,
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
          ← Back to dog profile
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">Health Clearances</h1>

      {/* Submit Clearance Form */}
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
                setSelectedOrg(null); // Reset org selection
                setSelectedResult(""); // Reset result
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

          {/* Result Dropdown (from test type options) */}
          {selectedTestType && (
            <div>
              <label className="block text-sm font-medium mb-1">Result</label>
              <select
                value={selectedResult}
                onChange={(e) => setSelectedResult(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Select result...</option>
                {selectedTestType.result_options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Test Date</label>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
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
            <label className="block text-sm font-medium mb-1">Certificate URL</label>
            <input
              type="url"
              value={certificateUrl}
              onChange={(e) => setCertificateUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="https://..."
            />
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
            disabled={submitClearance.isPending || !selectedTestType || !selectedOrg || !selectedResult}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitClearance.isPending ? "Submitting..." : "Submit Clearance"}
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
                        <div>
                          <h4 className="font-semibold">{clearance.test_type.name}</h4>
                          <p className="text-sm text-gray-600">
                            {clearance.organization.name} • {clearance.result}
                          </p>
                          {clearance.test_date && (
                            <p className="text-sm text-gray-600">
                              Test Date: {new Date(clearance.test_date).toLocaleDateString()}
                            </p>
                          )}
                          {clearance.certificate_number && (
                            <p className="text-sm text-gray-600">
                              Certificate: {clearance.certificate_number}
                            </p>
                          )}
                          {clearance.certificate_url && (
                            <a
                              href={clearance.certificate_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-purple-600 hover:underline"
                            >
                              View Certificate →
                            </a>
                          )}
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
