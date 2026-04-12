/**
 * HealthPage - view health clearances for a single dog.
 */

import { Fragment, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import { useDog } from "@/hooks/useDogs";
import { useDeleteClearance, useUpdateClearance } from "@/hooks/useHealthClearances";
import { formatDate } from "@/lib/utils";
import { AddHealthCertificateModal } from "@/components/health/AddHealthCertificateModal";

interface Clearance {
  id: string;
  result: string;
  result_data?: Record<string, unknown> | null;
  result_score?: number | null;
  result_score_left?: number | null;
  result_score_right?: number | null;
  test_date: string;
  certificate_number?: string | null;
  certificate_url?: string | null;
  is_preliminary?: boolean;
  application_number?: string | null;
  status: string;
  verified_at?: string;
  notes?: string;
  test_type: {
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
}

interface EditClearanceModalProps {
  clearance: Clearance;
  dogId: string;
  onClose: () => void;
}

function EditClearanceModal({ clearance, dogId, onClose }: EditClearanceModalProps) {
  const { getToken } = useAuth();
  const updateClearance = useUpdateClearance();
  const [result, setResult] = useState(clearance.result);
  const [testDate, setTestDate] = useState(clearance.test_date);
  const [certificateNumber, setCertificateNumber] = useState(clearance.certificate_number || "");
  const [notes, setNotes] = useState(clearance.notes || "");
  const [certificateUrl, setCertificateUrl] = useState("");
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    let uploadedCertificate = certificateUrl || undefined;
    if (certificateFile) {
      try {
        setUploading(true);
        const token = await getToken();
        const uploadResult = await api.upload<{ key: string }>(
          "/uploads/certificate",
          certificateFile,
          { token }
        );
        uploadedCertificate = uploadResult.key;
      } catch {
        alert("Failed to upload certificate file.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    updateClearance.mutate(
      {
        dogId,
        clearanceId: clearance.id,
        payload: {
          result,
          test_date: testDate,
          certificate_number: certificateNumber || undefined,
          certificate_url: uploadedCertificate,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl w-full max-w-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Edit Clearance</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>
        <p className="text-sm text-gray-600">
          {clearance.test_type.name} · {clearance.organization.name}
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Result</label>
          <input
            value={result}
            onChange={(e) => setResult(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Test Date</label>
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Certificate #</label>
            <input
              value={certificateNumber}
              onChange={(e) => setCertificateNumber(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Replace Certificate</label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => {
              setCertificateFile(e.target.files?.[0] || null);
              if (e.target.files?.[0]) setCertificateUrl("");
            }}
            className="w-full text-sm"
          />
          {!certificateFile && (
            <input
              type="url"
              value={certificateUrl}
              onChange={(e) => setCertificateUrl(e.target.value)}
              placeholder="or certificate URL"
              className="w-full mt-2 px-3 py-2 border rounded-lg"
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            rows={2}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={uploading || updateClearance.isPending}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : updateClearance.isPending ? "Saving..." : "Save Changes"}
          </button>
          {updateClearance.isError && (
            <span className="text-sm text-red-600">Failed to save changes.</span>
          )}
        </div>
      </form>
    </div>
  );
}

export function HealthPage() {
  const { dogId } = useParams<{ dogId: string }>();
  const { getToken } = useAuth();
  const { data: dogData } = useDog(dogId);
  const dog = dogData?.dog;
  const canManage = dogData?.canManageClearances ?? false;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<Clearance | null>(null);
  const deleteClearance = useDeleteClearance();

  const { data: clearancesData, isLoading } = useQuery({
    queryKey: ["dogs", dogId, "clearances"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<{ clearances: Clearance[] }>(`/health/dogs/${dogId}/clearances`, { token });
    },
    enabled: !!dogId,
  });

  const clearances = clearancesData?.clearances || [];

  const clearancesByCategory = useMemo(() => {
    return clearances.reduce(
      (acc, c) => {
        const cat = c.test_type.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(c);
        return acc;
      },
      {} as Record<string, Clearance[]>
    );
  }, [clearances]);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/dogs/${dogId}`} className="text-sm text-purple-600 hover:underline shrink-0">
          &larr; Back
        </Link>
        <h1 className="text-lg font-bold text-gray-900 truncate">
          Health Clearances{dog ? ` — ${dog.registered_name || dog.call_name || ""}` : ""}
        </h1>
        {canManage && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="ml-auto shrink-0 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700"
          >
            + Add Clearance
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading && <p className="text-gray-500 text-sm p-4">Loading clearances...</p>}
        {!isLoading && clearances.length === 0 && (
          <p className="text-gray-500 text-sm p-4">No clearances submitted yet.</p>
        )}
        {!isLoading && clearances.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Test</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Org</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cert</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(clearancesByCategory).map(([category, items]) => (
                <Fragment key={category}>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td
                      colSpan={8}
                      className="py-1 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {category}
                    </td>
                  </tr>
                  {items.map((c) => {
                    const certUrl = c.certificate_url
                      ? c.certificate_url.startsWith("http")
                        ? c.certificate_url
                        : `${import.meta.env.VITE_API_URL || "/api"}/uploads/certificate/${c.certificate_url}`
                      : null;
                    const scoreDisplay =
                      c.result_score != null
                        ? `${c.result_score}`
                        : c.result_score_left != null && c.result_score_right != null
                          ? `L${c.result_score_left}/R${c.result_score_right}`
                          : "";
                    return (
                      <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-3 font-medium">{c.test_type.short_name}</td>
                        <td className="py-1.5 px-3">{c.result}</td>
                        <td className="py-1.5 px-3 text-purple-700 text-xs font-medium">{scoreDisplay}</td>
                        <td className="py-1.5 px-3 text-gray-500 text-xs">{c.organization.name}</td>
                        <td className="py-1.5 px-3 text-gray-500 text-xs">{formatDate(c.test_date)}</td>
                         <td className="py-1.5 px-3">
                           <div className="flex items-center gap-1 flex-wrap">
                             <span
                               className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                 c.status === "approved"
                                   ? "bg-green-100 text-green-800"
                                   : c.status === "rejected"
                                     ? "bg-red-100 text-red-800"
                                     : "bg-yellow-100 text-yellow-800"
                               }`}
                             >
                               {c.status === "approved"
                                 ? "Verified"
                                 : c.status === "rejected"
                                   ? "Rejected"
                                   : "Pending"}
                             </span>
                             {c.is_preliminary && (
                               <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                 Prelim
                               </span>
                             )}
                           </div>
                         </td>
                         <td className="py-1.5 px-3">
                           {certUrl ? (
                             <a
                               href={certUrl}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="text-purple-600 hover:underline text-xs"
                             >
                               View
                             </a>
                           ) : c.application_number ? (
                             <span className="text-gray-500 text-xs" title="OFA Application #">{c.application_number}</span>
                           ) : c.certificate_number ? (
                             <span className="text-gray-500 text-xs">{c.certificate_number}</span>
                           ) : null}
                         </td>
                        <td className="py-1.5 px-3">
                          {c.status === "pending" ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditing(c)}
                                className="text-purple-600 hover:underline text-xs"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  if (!dogId) return;
                                  const confirmed = window.confirm(
                                    `Delete ${c.test_type.short_name} clearance from ${formatDate(c.test_date)}?`
                                  );
                                  if (!confirmed) return;
                                  deleteClearance.mutate({ dogId, clearanceId: c.id });
                                }}
                                className="text-red-600 hover:underline text-xs"
                              >
                                Delete
                              </button>
                            </div>
                          ) : c.status === "rejected" ? (
                            <button
                              onClick={() => {
                                if (!dogId) return;
                                const confirmed = window.confirm(
                                  `Delete rejected ${c.test_type.short_name} clearance from ${formatDate(c.test_date)}?`
                                );
                                if (!confirmed) return;
                                deleteClearance.mutate({ dogId, clearanceId: c.id });
                              }}
                              className="text-red-600 hover:underline text-xs"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddHealthCertificateModal open={isAddOpen} onClose={() => setIsAddOpen(false)} dogId={dogId} />
      {editing && dogId && (
        <EditClearanceModal
          clearance={editing}
          dogId={dogId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
