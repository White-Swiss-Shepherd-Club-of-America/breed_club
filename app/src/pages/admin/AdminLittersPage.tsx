/**
 * Admin page showing all litters with status filters.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAdminLitters } from "@/hooks/useLitters";
import { formatDate } from "@/lib/utils";
import type { Litter } from "@breed-club/shared";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
] as const;

function StatusBadge({ approved }: { approved: boolean }) {
  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        approved ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
      }`}
    >
      {approved ? "Approved" : "Pending"}
    </span>
  );
}

function SireApprovalBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    not_required: "bg-gray-100 text-gray-600",
    pending: "bg-orange-100 text-orange-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    not_required: "N/A",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || styles.not_required}`}>
      {labels[status] || status}
    </span>
  );
}

export function AdminLittersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminLitters(page, statusFilter);

  const litters = data?.data || [];
  const meta = data?.meta;

  const handleFilterChange = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">All Litters</h1>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleFilterChange(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              statusFilter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : litters.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No litters found.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Sire x Dam
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Litter Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Breeder
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Whelp Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Sire Approval
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {litters.map((litter: Litter) => {
                    const sireLabel =
                      litter.sire?.call_name || litter.sire?.registered_name || "Unknown";
                    const damLabel =
                      litter.dam?.call_name || litter.dam?.registered_name || "Unknown";

                    return (
                      <tr key={litter.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          <Link
                            to={`/litters/${litter.id}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {sireLabel} x {damLabel}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {litter.litter_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {litter.breeder?.kennel_name || litter.breeder?.full_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {litter.whelp_date ? formatDate(litter.whelp_date) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge approved={litter.approved} />
                        </td>
                        <td className="px-4 py-3">
                          <SireApprovalBadge status={litter.sire_approval_status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {meta.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page === meta.pages}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
