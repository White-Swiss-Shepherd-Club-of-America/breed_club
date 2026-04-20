/**
 * HealthQueuePage - Admin page for verifying pending health clearances
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { PdfViewer } from "../../components/PdfViewer";
import { formatDate } from "../../lib/utils";

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
  result_score?: number | null;
  result_score_left?: number | null;
  result_score_right?: number | null;
  test_date?: string;
  certificate_number?: string | null;
  certificate_url?: string;
  is_preliminary?: boolean;
  application_number?: string | null;
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

function AuthenticatedImage({
  src,
  token,
  className,
  alt,
}: {
  src: string;
  token: string | null;
  className?: string;
  alt?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let objectUrl: string | null = null;
    fetch(src, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);
  if (!blobUrl) return <p className="text-sm text-gray-400">Loading...</p>;
  return <img src={blobUrl} alt={alt} className={className} />;
}

export function HealthQueuePanel() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;
  const [authToken, setAuthToken] = useState<string | null>(null);
  useEffect(() => {
    getToken().then((t) => setAuthToken(t));
  }, [getToken]);
  const httpHeaders: Record<string, string> | undefined = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : undefined;

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

  // Score overrides per clearance (collapsible)
  const [scoreOverrides, setScoreOverrides] = useState<Record<string, {
    result_score?: number | null;
    result_score_left?: number | null;
    result_score_right?: number | null;
  }>>({});
  const [showOverride, setShowOverride] = useState<Record<string, boolean>>({});

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (clearanceId: string) => {
      const token = await getToken();
      const overrides = scoreOverrides[clearanceId];
      return api.post(`/admin/clearances/${clearanceId}/approve`, overrides || {}, { token });
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
    <div>
      {meta && (
        <div className="text-sm text-gray-600 mb-4">
          {meta.total} pending clearance{meta.total !== 1 ? "s" : ""}
        </div>
      )}

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
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-semibold text-green-600">{clearance.result}</p>
                          {clearance.is_preliminary && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                              Prelim
                            </span>
                          )}
                        </div>
                        {clearance.is_preliminary && clearance.application_number && (
                          <p className="text-xs text-gray-500">App #{clearance.application_number}</p>
                        )}
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
                            ? formatDate(clearance.test_date)
                            : "Not provided"}
                        </p>
                      </div>
                    </div>

                    {/* Score display + override */}
                    {(clearance.result_score != null || clearance.result_score_left != null) && (
                      <div className="mt-3 border-t pt-3">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Score</p>
                            {clearance.result_score != null && (
                              <p className="text-lg font-semibold text-purple-600">{clearance.result_score}/100</p>
                            )}
                            {clearance.result_score_left != null && (
                              <p className="text-lg font-semibold text-purple-600">
                                L: {clearance.result_score_left}, R: {clearance.result_score_right}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowOverride((prev) => ({ ...prev, [clearance.id]: !prev[clearance.id] }))}
                            className="text-xs text-purple-600 hover:underline"
                          >
                            {showOverride[clearance.id] ? "Hide override" : "Override score"}
                          </button>
                        </div>
                        {showOverride[clearance.id] && (
                          <div className="mt-2 flex items-center gap-3">
                            {clearance.result_score != null && (
                              <label className="flex items-center gap-1 text-xs">
                                Score:
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={scoreOverrides[clearance.id]?.result_score ?? ""}
                                  onChange={(e) => setScoreOverrides((prev) => ({
                                    ...prev,
                                    [clearance.id]: { ...prev[clearance.id], result_score: e.target.value ? parseInt(e.target.value) : null },
                                  }))}
                                  placeholder={String(clearance.result_score)}
                                  className="w-16 px-1 py-0.5 border rounded text-xs text-center"
                                />
                              </label>
                            )}
                            {clearance.result_score_left != null && (
                              <>
                                <label className="flex items-center gap-1 text-xs">
                                  L:
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={scoreOverrides[clearance.id]?.result_score_left ?? ""}
                                    onChange={(e) => setScoreOverrides((prev) => ({
                                      ...prev,
                                      [clearance.id]: { ...prev[clearance.id], result_score_left: e.target.value ? parseInt(e.target.value) : null },
                                    }))}
                                    placeholder={String(clearance.result_score_left)}
                                    className="w-16 px-1 py-0.5 border rounded text-xs text-center"
                                  />
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                  R:
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={scoreOverrides[clearance.id]?.result_score_right ?? ""}
                                    onChange={(e) => setScoreOverrides((prev) => ({
                                      ...prev,
                                      [clearance.id]: { ...prev[clearance.id], result_score_right: e.target.value ? parseInt(e.target.value) : null },
                                    }))}
                                    placeholder={String(clearance.result_score_right)}
                                    className="w-16 px-1 py-0.5 border rounded text-xs text-center"
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

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
                          <AuthenticatedImage
                            src={getCertificateUrl(clearance.certificate_url)}
                            token={authToken}
                            alt="Certificate"
                            className="max-w-md max-h-64 rounded border object-contain"
                          />
                        ) : (
                          <div>
                            <PdfViewer
                              url={getCertificateUrl(clearance.certificate_url)}
                              httpHeaders={httpHeaders}
                            />
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

// ─── Condition Queue Panel ────────────────────────────────────────────────────

interface PendingCondition {
  id: string;
  dog_id: string;
  dog_registered_name: string;
  dog_call_name?: string | null;
  condition_type_id: string | null;
  condition_name: string;
  category: string | null;
  diagnosis_date?: string | null;
  resolved_date?: string | null;
  medical_severity?: string | null;
  breeding_impact?: string | null;
  status: string;
  notes?: string | null;
  reported_by?: string | null;
  created_at: string;
}

const BREEDING_IMPACT_LABELS: Record<string, string> = {
  informational: "Informational",
  advisory: "Advisory",
  disqualifying: "Disqualifying",
};

const MEDICAL_SEVERITY_LABELS: Record<string, string> = {
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
};

function ConditionQueuePanel() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "conditions", "queue"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ conditions: PendingCondition[] }>("/admin/health-conditions/queue", { token });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post(`/admin/health-conditions/${id}/approve`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "conditions", "queue"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.post(`/admin/health-conditions/${id}/reject`, {}, { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "conditions", "queue"] });
    },
  });

  const conditions = data?.conditions ?? [];

  return (
    <div>
      <div className="text-sm text-gray-600 mb-4">
        {isLoading ? "Loading..." : `${conditions.length} pending condition${conditions.length !== 1 ? "s" : ""}`}
      </div>

      {!isLoading && conditions.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No pending conditions to review.</p>
        </div>
      )}

      {conditions.map((cond) => (
        <div key={cond.id} className="bg-white rounded-lg shadow mb-4 overflow-hidden">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/dogs/${cond.dog_id}/health`}
                    className="text-base font-semibold text-purple-700 hover:underline"
                  >
                    {cond.dog_registered_name}
                  </Link>
                  {cond.dog_call_name && (
                    <span className="text-sm text-gray-500">({cond.dog_call_name})</span>
                  )}
                </div>

                <div className="mt-2">
                  <span className="font-medium text-gray-900">{cond.condition_name}</span>
                  {cond.category && (
                    <span className="ml-2 text-xs text-gray-500 capitalize">{cond.category}</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                  {cond.diagnosis_date && (
                    <span>Diagnosed: {formatDate(cond.diagnosis_date)}</span>
                  )}
                  {cond.resolved_date && (
                    <span>Resolved: {formatDate(cond.resolved_date)}</span>
                  )}
                  {cond.medical_severity && (
                    <span>Medical: <strong>{MEDICAL_SEVERITY_LABELS[cond.medical_severity] ?? cond.medical_severity}</strong></span>
                  )}
                  {cond.breeding_impact && (
                    <span>Breeding: <strong>{BREEDING_IMPACT_LABELS[cond.breeding_impact] ?? cond.breeding_impact}</strong></span>
                  )}
                </div>

                {cond.notes && (
                  <p className="mt-2 text-sm text-gray-600 italic">{cond.notes}</p>
                )}

                <p className="mt-2 text-xs text-gray-400">
                  Reported {formatDate(cond.created_at)}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    if (window.confirm("Approve this reported condition?")) {
                      approveMutation.mutate(cond.id);
                    }
                  }}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Reject this reported condition?")) {
                      rejectMutation.mutate(cond.id);
                    }
                  }}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HealthQueuePage() {
  const [tab, setTab] = useState<"clearances" | "conditions">("clearances");

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <Link to="/admin" className="text-sm text-purple-600 hover:underline">
          ← Back to admin
        </Link>
      </div>
      <h1 className="text-3xl font-bold mb-6">Health Verification Queue</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab("clearances")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "clearances"
              ? "border-purple-600 text-purple-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Clearances
        </button>
        <button
          onClick={() => setTab("conditions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "conditions"
              ? "border-purple-600 text-purple-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Reported Conditions
        </button>
      </div>

      {tab === "clearances" ? <HealthQueuePanel /> : <ConditionQueuePanel />}
    </div>
  );
}
