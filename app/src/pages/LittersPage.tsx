/**
 * Litter management page for breeders.
 * Lists all litters and allows creating new ones.
 */

import { Link } from "react-router-dom";
import { useLitters } from "@/hooks/useLitters";
import { formatDate } from "@/lib/utils";

export function LittersPage() {
  const { data, isLoading, error } = useLitters();
  const litters = data?.data || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-600">Loading litters...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Failed to load litters. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">My Litters</h1>
        <Link
          to="/app/litters/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
        >
          Register New Litter
        </Link>
      </div>

      {litters.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">You haven't registered any litters yet.</p>
          <Link
            to="/app/litters/new"
            className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
          >
            Register Your First Litter
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {litters.map((litter) => {
            const availablePups = litter.pups?.filter((p) => p.status === "available").length || 0;
            const totalPups = litter.pups?.length || 0;

            return (
              <Link
                key={litter.id}
                to={`/app/litters/${litter.id}`}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition"
              >
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {litter.sire?.call_name || litter.sire?.registered_name || "Unknown"} x{" "}
                      {litter.dam?.call_name || litter.dam?.registered_name || "Unknown"}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        litter.approved
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {litter.approved ? "Approved" : "Pending Approval"}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        litter.status === "born"
                          ? "bg-blue-100 text-blue-800"
                          : litter.status === "expected"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {litter.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  {litter.expected_date && (
                    <p>
                      <span className="font-medium">Expected:</span>{" "}
                      {formatDate(litter.expected_date)}
                    </p>
                  )}
                  {litter.whelp_date && (
                    <p>
                      <span className="font-medium">Whelped:</span>{" "}
                      {formatDate(litter.whelp_date)}
                    </p>
                  )}
                  {totalPups > 0 && (
                    <p>
                      <span className="font-medium">Pups:</span> {availablePups} available of{" "}
                      {totalPups} total
                    </p>
                  )}
                  {litter.breeder && (
                    <p>
                      <span className="font-medium">Breeder:</span>{" "}
                      {litter.breeder.kennel_name || litter.breeder.full_name}
                    </p>
                  )}
                </div>

                {litter.notes && (
                  <p className="mt-3 text-sm text-gray-600 line-clamp-2">{litter.notes}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
