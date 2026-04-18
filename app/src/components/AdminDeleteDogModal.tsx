import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAdminDogDeletePreview } from "@/hooks/useDogs";

interface Props {
  dogId: string;
  dogName: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function AdminDeleteDogModal({ dogId, dogName, onClose, onConfirm, isDeleting }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const { data: preview, isLoading: previewLoading } = useAdminDogDeletePreview(dogId, true);

  const confirmed = confirmText.trim().toLowerCase() === dogName.trim().toLowerCase();
  const counts = preview?.counts;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
          <h3 className="text-lg font-semibold text-gray-900">Permanently Delete Dog</h3>
        </div>

        <p className="text-sm text-gray-700 mb-3">
          You are about to permanently delete{" "}
          <span className="font-semibold">{dogName}</span>.
        </p>

        {previewLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
            Checking related records...
          </div>
        ) : counts ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm space-y-1">
            <p className="font-medium text-red-800 mb-2">The following will be permanently deleted:</p>
            {counts.clearances > 0 && (
              <p className="text-red-700">• {counts.clearances} health clearance{counts.clearances !== 1 ? "s" : ""}</p>
            )}
            {counts.registrations > 0 && (
              <p className="text-red-700">• {counts.registrations} registration{counts.registrations !== 1 ? "s" : ""}</p>
            )}
            {counts.conditions > 0 && (
              <p className="text-red-700">• {counts.conditions} health condition{counts.conditions !== 1 ? "s" : ""}</p>
            )}
            {counts.transfers > 0 && (
              <p className="text-red-700">• {counts.transfers} ownership transfer record{counts.transfers !== 1 ? "s" : ""}</p>
            )}
            {counts.litters > 0 && (
              <p className="text-orange-700">
                • {counts.litters} litter{counts.litters !== 1 ? "s" : ""} will have sire/dam reference cleared
              </p>
            )}
            {counts.pups > 0 && (
              <p className="text-orange-700">
                • {counts.pups} litter pup record{counts.pups !== 1 ? "s" : ""} will be unlinked
              </p>
            )}
            {counts.children > 0 && (
              <p className="text-orange-700">
                • {counts.children} dog{counts.children !== 1 ? "s" : ""} will have parent reference cleared
              </p>
            )}
            {Object.values(counts).every((v) => v === 0) && (
              <p className="text-gray-600">No related records found.</p>
            )}
          </div>
        ) : null}

        <p className="text-sm text-gray-600 mb-4">
          <span className="font-medium text-red-700">This action cannot be undone.</span> To confirm,
          type the dog's registered name below:
        </p>

        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={dogName}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
          autoFocus
        />

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || isDeleting || previewLoading}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? "Deleting..." : "Delete Dog"}
          </button>
        </div>
      </div>
    </div>
  );
}
