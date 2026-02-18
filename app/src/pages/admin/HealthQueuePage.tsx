/**
 * HealthQueuePage - Admin page for verifying pending health clearances
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { PdfViewer } from "../../components/PdfViewer";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getCertificateUrl(urlOrKey: string): string {
  return urlOrKey.startsWith("http") ? urlOrKey : `${API_BASE}/uploads/certificate/${urlOrKey}`;
}

function isImageUrl(urlOrKey: string): boolean {
  return /\.(jpg|jpeg|png)$/i.test(urlOrKey);
}

interface Clearance {
  id: string;
  result: string;
  result_data?: Record<string, unknown> | null;
  result_detail?: string;
  test_date?: string;
  certificate_number?: string;
  certificate_url?: string;
  status: string;
  notes?: string;
  created_at: string;
  dog: {
    id: string;
    registered_name: string;
    call_name?: string;
    photo_url?: string;
    owner?: {
      id: string;
      full_name: string;
      email?: string;
    };
  };
  healthTestType: {
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
  submitter?: {
    id: string;
    contact: {
      full_name: string;
      email?: string;
    };
  };
}

interface PaginatedResponse {
  data: Clearance[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

function ResultDataSummary({ data }: { data: Record<string, unknown> }) {
  const left = data.left as Record<string, unknown> | undefined;
  const right = data.right as Record<string, unknown> | undefined;
  const total = data.total as number | undefined;

  if (!left || !right) return null;

  const keys = Object.keys(left).filter((k) => k !== "total");

  return (
    <div className="mt-1 text-xs text-gray-600">
      <table className="border-collapse">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-normal pr-3" />
            <th className="text-center font-normal px-2">R</th>
            <th className="text-center font-normal px-2">L</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key}>
              <td className="pr-3">{key.replace(/_/g, " ")}</td>
              <td className="text-center px-2">{String((right as Record<string, unknown>)[key] ?? "-")}</td>
              <td className="text-center px-2">{String((left as Record<string, unknown>)[key] ?? "-")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total != null && (
        <p className="font-semibold mt-1">Total: {total}</p>
      )}
    </div>
  );
}

export function HealthQueuePage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  // Fetch pending clearances
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "clearances", "pending", page],
    queryFn: async () => {
      const token = await getToken();
      return api.get<PaginatedResponse>("/admin/clearances/pending", {
        token,
        params: { page, limit },
      });
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (clearanceId: string) => {
      const token = await getToken();
      return api.post(`/admin/clearances/${clearanceId}/approve`, undefined, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "clearances", "pending"] });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (clearanceId: string) => {
      const token = await getToken();
      return api.post(`/admin/clearances/${clearanceId}/reject`, undefined, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "clearances", "pending"] });
    },
  });

  const handleApprove = (clearanceId: string) => {
    if (window.confirm("Approve this clearance?")) {
      approveMutation.mutate(clearanceId);
    }
  };

  const handleReject = (clearanceId: string) => {
    if (window.confirm("Reject this clearance? This action cannot be undone.")) {
      rejectMutation.mutate(clearanceId);
    }
  };

  const clearances = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <Link to="/app/admin" className="text-sm text-purple-600 hover:underline">
          ← Back to admin
        </Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Health Clearance Verification Queue</h1>
        {meta && (
          <div className="text-sm text-gray-600">
            {meta.total} pending clearance{meta.total !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">Loading clearances...</p>
        </div>
      )}

      {!isLoading && clearances.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No pending clearances to verify.</p>
        </div>
      )}

      {!isLoading && clearances.length > 0 && (
        <div className="space-y-4">
          {clearances.map((clearance) => (
            <div key={clearance.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex gap-6">
                {/* Dog Photo */}
                <div className="flex-shrink-0">
                  <img
                    src={
                      clearance.dog.photo_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(clearance.dog.registered_name)}&size=100&background=655e7a&color=fff`
                    }
                    alt={clearance.dog.registered_name}
                    className="w-24 h-24 rounded-lg object-cover"
                  />
                </div>

                {/* Clearance Details */}
                <div className="flex-grow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <Link
                        to={`/app/registry/${clearance.dog.id}`}
                        className="text-xl font-semibold text-purple-600 hover:underline"
                      >
                        {clearance.dog.registered_name}
                      </Link>
                      {clearance.dog.call_name && (
                        <span className="text-gray-600 ml-2">"{clearance.dog.call_name}"</span>
                      )}
                      {clearance.dog.owner && (
                        <p className="text-sm text-gray-600 mt-1">
                          Owner: {clearance.dog.owner.full_name}
                          {clearance.dog.owner.email && ` (${clearance.dog.owner.email})`}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Submitted {new Date(clearance.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Test Info */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Test Type</p>
                        <p className="text-lg font-semibold">{clearance.healthTestType.name}</p>
                        <p className="text-sm text-gray-600">
                          {clearance.healthTestType.category}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Organization</p>
                        <p className="text-lg font-semibold">{clearance.organization.name}</p>
                        <p className="text-sm text-gray-600">{clearance.organization.type}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Result</p>
                        <p className="text-lg font-semibold text-green-600">{clearance.result}</p>
                        {clearance.result_data && (
                          <ResultDataSummary data={clearance.result_data} />
                        )}
                        {clearance.result_detail && (
                          <p className="text-sm text-gray-600">{clearance.result_detail}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Test Date</p>
                        <p className="text-lg">
                          {clearance.test_date
                            ? new Date(clearance.test_date).toLocaleDateString()
                            : "Not provided"}
                        </p>
                      </div>
                    </div>

                    {clearance.certificate_number && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-700">Certificate Number</p>
                        <p className="text-md">{clearance.certificate_number}</p>
                      </div>
                    )}

                    {clearance.certificate_url && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">Certificate</p>
                        {isImageUrl(clearance.certificate_url) ? (
                          <a
                            href={getCertificateUrl(clearance.certificate_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={getCertificateUrl(clearance.certificate_url)}
                              alt="Certificate"
                              className="max-w-md max-h-64 rounded border object-contain"
                            />
                          </a>
                        ) : (
                          <div>
                            <PdfViewer url={getCertificateUrl(clearance.certificate_url)} />
                            <a
                              href={getCertificateUrl(clearance.certificate_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-purple-600 hover:underline mt-1 inline-block"
                            >
                              Open in new tab →
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {clearance.notes && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-700">Notes</p>
                        <p className="text-sm text-gray-600">{clearance.notes}</p>
                      </div>
                    )}

                    {clearance.submitter && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-500">
                          Submitted by {clearance.submitter.contact.full_name}
                          {clearance.submitter.contact.email &&
                            ` (${clearance.submitter.contact.email})`}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(clearance.id)}
                      disabled={approveMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {approveMutation.isPending ? "Approving..." : "Approve"}
                    </button>
                    <button
                      onClick={() => handleReject(clearance.id)}
                      disabled={rejectMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {rejectMutation.isPending ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {meta && meta.pages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2">
                Page {page} of {meta.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page === meta.pages}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
