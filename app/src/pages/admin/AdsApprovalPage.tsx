/**
 * Admin page for reviewing and approving litter ads.
 */

import { useState } from "react";
import { useAdminAds, useReviewAd } from "@/hooks/useAds";
import { Check, XCircle, RotateCcw } from "lucide-react";
import type { LitterAd } from "@breed-club/shared";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "revision_requested", label: "Revision Requested" },
  { value: "expired", label: "Expired" },
  { value: "archived", label: "Archived" },
];

export function AdsApprovalPage() {
  const [statusFilter, setStatusFilter] = useState("submitted");
  const { data, isLoading } = useAdminAds(statusFilter || undefined);

  const ads = data?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Litter Ad Review</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass + " w-48"}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {!isLoading && ads.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No ads to review.</p>
        </div>
      )}

      <div className="space-y-4">
        {ads.map((ad) => (
          <ReviewCard key={ad.id} ad={ad} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ ad }: { ad: LitterAd }) {
  const reviewAd = useReviewAd(ad.id);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socialResults, setSocialResults] = useState<unknown[] | null>(null);

  const isSubmitted = ad.status === "submitted";
  const contact = (ad as any).member?.contact;
  const kennel = contact?.kennel_name;
  const breederName = contact?.full_name;

  const handleAction = async (action: "approve" | "reject" | "request_revision") => {
    setError(null);
    try {
      const result = await reviewAd.mutateAsync({
        action,
        revision_notes: action === "request_revision" ? revisionNotes : null,
      });
      if (action === "approve" && result.social_posts) {
        setSocialResults(result.social_posts as unknown[]);
      }
      setShowRevisionForm(false);
    } catch (err: any) {
      setError(err?.error?.message || err?.message || "Failed to review ad");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex">
        {ad.image_url && (
          <img
            src={ad.image_url}
            alt={ad.title}
            className="w-40 h-40 object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{ad.title}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {kennel && <span className="font-medium">{kennel}</span>}
                {kennel && breederName && " — "}
                {breederName}
                {contact?.state && `, ${contact.state}`}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Submitted {new Date(ad.created_at).toLocaleDateString()}
              </p>
            </div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                ad.status === "submitted"
                  ? "bg-yellow-100 text-yellow-700"
                  : ad.status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {ad.status}
            </span>
          </div>

          {ad.description && (
            <p className="mt-2 text-sm text-gray-600">{ad.description}</p>
          )}

          {ad.contact_url && (
            <p className="mt-1 text-xs text-blue-600 truncate">{ad.contact_url}</p>
          )}

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          {socialResults && socialResults.length > 0 && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
              <strong>Social posts:</strong>{" "}
              {(socialResults as any[]).map((r, i) => (
                <span key={i} className={r.status === "posted" ? "text-green-600" : "text-red-600"}>
                  {r.platform}: {r.status}
                  {r.error_message && ` (${r.error_message})`}
                  {i < socialResults.length - 1 && ", "}
                </span>
              ))}
            </div>
          )}

          {isSubmitted && (
            <div className="mt-3">
              {showRevisionForm ? (
                <div className="space-y-2">
                  <textarea
                    value={revisionNotes}
                    onChange={(e) => setRevisionNotes(e.target.value)}
                    placeholder="Explain what needs to be changed..."
                    rows={2}
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction("request_revision")}
                      disabled={reviewAd.isPending || !revisionNotes.trim()}
                      className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50"
                    >
                      {reviewAd.isPending ? "Sending..." : "Send Revision Request"}
                    </button>
                    <button
                      onClick={() => setShowRevisionForm(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction("approve")}
                    disabled={reviewAd.isPending}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => setShowRevisionForm(true)}
                    disabled={reviewAd.isPending}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-700 text-sm rounded-lg hover:bg-orange-200 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Request Revision
                  </button>
                  <button
                    onClick={() => handleAction("reject")}
                    disabled={reviewAd.isPending}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          )}

          {ad.status === "active" && (
            <div className="mt-2 flex gap-4 text-xs text-gray-400">
              <span>{ad.impression_count} impressions</span>
              <span>{ad.click_count} clicks</span>
              {ad.expires_at && (
                <span>Expires {new Date(ad.expires_at).toLocaleDateString()}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
