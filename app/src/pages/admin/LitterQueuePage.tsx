/**
 * Admin panel for approving/rejecting pending litters.
 */

import { useState } from "react";
import { usePendingLitters, useApproveLitter, useRejectLitter } from "@/hooks/useLitters";
import { formatDate } from "@/lib/utils";
import type { Litter } from "@breed-club/shared";

function LitterCard({
  litter,
  onApprove,
  onReject,
}: {
  litter: Litter;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const sireLabel = litter.sire?.call_name || litter.sire?.registered_name || "Unknown";
  const damLabel = litter.dam?.call_name || litter.dam?.registered_name || "Unknown";

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900">
          {sireLabel} x {damLabel}
        </h3>
        {litter.litter_name && (
          <p className="text-sm text-gray-500">Litter: {litter.litter_name}</p>
        )}

        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {litter.breeder && (
            <div>
              <span className="text-gray-600">Breeder:</span>{" "}
              {litter.breeder.kennel_name || litter.breeder.full_name}
            </div>
          )}
          {litter.whelp_date && (
            <div>
              <span className="text-gray-600">Whelp Date:</span>{" "}
              {formatDate(litter.whelp_date)}
            </div>
          )}
          {litter.num_males != null && (
            <div>
              <span className="text-gray-600">Males:</span> {litter.num_males}
            </div>
          )}
          {litter.num_females != null && (
            <div>
              <span className="text-gray-600">Females:</span> {litter.num_females}
            </div>
          )}
        </div>

        {litter.notes && (
          <p className="mt-2 text-sm text-gray-600">{litter.notes}</p>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={async () => {
            setIsApproving(true);
            await onApprove();
            setIsApproving(false);
          }}
          disabled={isApproving || isRejecting}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {isApproving ? "Approving..." : "Approve"}
        </button>
        <button
          onClick={async () => {
            setIsRejecting(true);
            await onReject();
            setIsRejecting(false);
          }}
          disabled={isApproving || isRejecting}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {isRejecting ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </div>
  );
}

export function LitterQueuePanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePendingLitters(page);
  const approveMutation = useApproveLitter();
  const rejectMutation = useRejectLitter();

  const litters = data?.data || [];
  const meta = data?.meta;

  const handleApprove = async (id: string) => {
    await approveMutation.mutateAsync(id);
  };

  const handleReject = async (id: string) => {
    if (confirm("Are you sure you want to reject this litter?")) {
      await rejectMutation.mutateAsync(id);
    }
  };

  return (
    <div>
      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : litters.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No pending litter registrations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {litters.map((litter: Litter) => (
            <LitterCard
              key={litter.id}
              litter={litter}
              onApprove={() => handleApprove(litter.id)}
              onReject={() => handleReject(litter.id)}
            />
          ))}

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
        </div>
      )}
    </div>
  );
}
