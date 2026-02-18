/**
 * Admin page for approving/rejecting pending dog ownership transfers.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { usePendingTransfers, useApproveTransfer, useRejectTransfer } from "@/hooks/useDogs";
import type { DogOwnershipTransfer } from "@breed-club/shared";

const REASON_LABELS: Record<string, string> = {
  sale: "Sale",
  return: "Return",
  gift: "Gift",
  co_ownership: "Co-ownership",
  other: "Other",
};

function TransferCard({
  transfer,
  onApprove,
  onReject,
}: {
  transfer: DogOwnershipTransfer;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link
            to={`/dogs/${transfer.dog?.id}`}
            className="text-lg font-semibold text-purple-600 hover:underline"
          >
            {transfer.dog?.registered_name}
          </Link>
          {transfer.dog?.call_name && (
            <span className="text-gray-600 ml-2">"{transfer.dog.call_name}"</span>
          )}
        </div>
        <div className="text-sm text-gray-500">
          Requested {new Date(transfer.created_at).toLocaleDateString()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 mb-4">
        <div>
          <div className="text-xs text-gray-600">Current Owner</div>
          <div className="font-medium">{transfer.fromOwner?.full_name || "None"}</div>
          {transfer.fromOwner?.kennel_name && (
            <div className="text-sm text-gray-600">{transfer.fromOwner.kennel_name}</div>
          )}
        </div>
        <div>
          <div className="text-xs text-gray-600">New Owner</div>
          <div className="font-medium">{transfer.toOwner?.full_name}</div>
          {transfer.toOwner?.kennel_name && (
            <div className="text-sm text-gray-600">{transfer.toOwner.kennel_name}</div>
          )}
        </div>
      </div>

      {transfer.reason && (
        <div className="text-sm mb-2">
          <span className="text-gray-600">Reason:</span>{" "}
          <span className="font-medium">{REASON_LABELS[transfer.reason] || transfer.reason}</span>
        </div>
      )}

      {transfer.notes && (
        <div className="text-sm mb-4">
          <span className="text-gray-600">Notes:</span>{" "}
          <span>{transfer.notes}</span>
        </div>
      )}

      <div className="flex gap-3">
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
        <Link
          to={`/dogs/${transfer.dog?.id}`}
          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          View Dog
        </Link>
      </div>
    </div>
  );
}

export function TransferQueuePage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePendingTransfers(page);
  const approveMutation = useApproveTransfer();
  const rejectMutation = useRejectTransfer();

  const transfers = data?.data || [];
  const meta = data?.meta;

  const handleApprove = async (id: string) => {
    if (confirm("Approve this ownership transfer? The dog's owner will be updated.")) {
      await approveMutation.mutateAsync(id);
    }
  };

  const handleReject = async (id: string) => {
    if (confirm("Reject this ownership transfer?")) {
      await rejectMutation.mutateAsync(id);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/admin" className="text-sm text-purple-600 hover:underline">
          ← Back to admin
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ownership Transfer Queue</h1>
        <p className="text-gray-600 mt-1">Review and approve pending dog ownership transfers.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : transfers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No pending ownership transfers.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {transfers.map((transfer: DogOwnershipTransfer) => (
            <TransferCard
              key={transfer.id}
              transfer={transfer}
              onApprove={() => handleApprove(transfer.id)}
              onReject={() => handleReject(transfer.id)}
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
