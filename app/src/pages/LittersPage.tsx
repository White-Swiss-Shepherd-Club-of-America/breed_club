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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">My Litters</h1>
        <Link
          to="/litters/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
        >
          Register New Litter
        </Link>
      </div>

      {litters.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">You haven't registered any litters yet.</p>
          <Link
            to="/litters/new"
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
                to={`/litters/${litter.id}`}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition"
              >
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {litter.sire?.call_name || litter.sire?.registered_name || "Unknown"} x{" "}
                      {litter.dam?.call_name || litter.dam?.registered_name || "Unknown"}
                    </h3>
                  </div>
                  {litter.litter_name && (
                    <p className="text-sm text-gray-500 mb-2">Litter: {litter.litter_name}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        litter.approved
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {litter.approved ? "Approved" : "Pending Approval"}
                    </span>
                    {litter.sire_approval_status === "pending" && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                        Awaiting Sire Approval
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  {litter.whelp_date && (
                    <p>
                      <span className="font-medium">Whelped:</span>{" "}
                      {formatDate(litter.whelp_date)}
                    </p>
                  )}
                  {(litter.num_males != null || litter.num_females != null) && (
                    <p>
                      <span className="font-medium">Pups:</span>{" "}
                      {litter.num_males ?? 0} males, {litter.num_females ?? 0} females
                    </p>
                  )}
                  {totalPups > 0 && (
                    <p>
                      <span className="font-medium">Registered:</span> {availablePups} available of{" "}
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
