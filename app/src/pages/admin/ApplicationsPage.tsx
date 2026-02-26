/**
 * Admin applications queue — review membership applications.
 */

import { useState } from "react";
import { useApplicationQueue, useReviewApplication } from "@/hooks/useApplications";
import type { MembershipApplication } from "@breed-club/shared";
import { Check, X, RotateCcw } from "lucide-react";

export function ApplicationsPage() {
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useApplicationQueue(statusFilter, page);
  const reviewMutation = useReviewApplication();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const applications = data?.data ?? [];
  const meta = data?.meta;

  const handleReview = async (
    id: string,
    status: "approved" | "rejected" | "needs_revision"
  ) => {
    await reviewMutation.mutateAsync({
      id,
      status,
      review_notes: reviewNotes || undefined,
      tier: status === "approved" ? "member" : undefined,
    });
    setReviewingId(null);
    setReviewNotes("");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Membership Applications</h1>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6">
        {["submitted", "approved", "rejected", "needs_revision"].map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              statusFilter === status
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {status.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {!isLoading && applications.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No {statusFilter.replace(/_/g, " ")} applications.</p>
        </div>
      )}

      <div className="space-y-4">
        {applications.map((app: MembershipApplication) => (
          <div
            key={app.id}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{app.applicant_name}</h3>
                <p className="text-sm text-gray-600">{app.applicant_email}</p>
                {app.applicant_phone && (
                  <p className="text-sm text-gray-500">{app.applicant_phone}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  Type: {app.membership_type} | Submitted:{" "}
                  {new Date(app.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            {app.notes && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">{app.notes}</p>
              </div>
            )}

            {app.form_data && app.form_data.length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-2">Application Details</p>
                <dl className="space-y-1.5">
                  {app.form_data.map((entry) => (
                    <div key={entry.field_key} className="flex gap-2 text-sm">
                      <dt className="font-medium text-gray-700 shrink-0">{entry.label}:</dt>
                      <dd className="text-gray-600">
                        {Array.isArray(entry.value)
                          ? entry.value.join(", ")
                          : typeof entry.value === "boolean"
                          ? entry.value ? "Yes" : "No"
                          : entry.value || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {app.applicant_address && (
              <p className="mt-2 text-sm text-gray-500">
                Address: {app.applicant_address}
              </p>
            )}

            {app.review_notes && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs font-medium text-blue-600 mb-1">Review Notes</p>
                <p className="text-sm text-blue-800">{app.review_notes}</p>
              </div>
            )}

            {/* Review actions */}
            {statusFilter === "submitted" && (
              <div className="mt-4">
                {reviewingId === app.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Review notes (optional)"
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(app.id, "approved")}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" /> Approve
                      </button>
                      <button
                        onClick={() => handleReview(app.id, "rejected")}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" /> Reject
                      </button>
                      <button
                        onClick={() => handleReview(app.id, "needs_revision")}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50"
                      >
                        <RotateCcw className="h-4 w-4" /> Needs Revision
                      </button>
                      <button
                        onClick={() => {
                          setReviewingId(null);
                          setReviewNotes("");
                        }}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setReviewingId(app.id)}
                    className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                  >
                    Review
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            Page {page} of {meta.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
            disabled={page === meta.pages}
            className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
