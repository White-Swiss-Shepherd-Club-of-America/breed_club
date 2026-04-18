import { AlertTriangle } from "lucide-react";

export interface ClearanceForDelete {
  id: string;
  dog_id: string;
  result: string;
  test_date: string;
  test_type?: { name: string; short_name: string } | null;
}

interface Props {
  clearance: ClearanceForDelete;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function AdminDeleteClearanceModal({ clearance, onClose, onConfirm, isDeleting }: Props) {
  const testName = clearance.test_type?.name ?? clearance.test_type?.short_name ?? "Health Clearance";
  const date = clearance.test_date
    ? new Date(clearance.test_date + "T00:00:00").toLocaleDateString()
    : "";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
          <h3 className="text-lg font-semibold text-gray-900">Delete Health Clearance</h3>
        </div>
        <p className="text-sm text-gray-600 mb-2">
          This will permanently delete the{" "}
          <span className="font-medium">{testName}</span> clearance{date ? ` from ${date}` : ""}
          {clearance.result ? ` (${clearance.result})` : ""}.
        </p>
        <p className="text-sm text-gray-600 mb-6">
          The dog's health rating will be recalculated. This action cannot be undone.
        </p>
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
            disabled={isDeleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Delete Clearance"}
          </button>
        </div>
      </div>
    </div>
  );
}
