import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import { AddClearanceModal } from "@/components/AddClearanceModal";
import {
  type BreedingStatusFilter,
  type ClearanceSortBy,
  type ClearanceSortDir,
  type ClearanceStatusFilter,
  type MyClearance,
  useMyClearances,
  useUpdateClearance,
} from "@/hooks/useHealthClearances";
import { formatDate } from "@/lib/utils";
import { ratingBgClass } from "@/lib/health-colors";

interface EditClearanceModalProps {
  clearance: MyClearance;
  onClose: () => void;
}

function EditClearanceModal({ clearance, onClose }: EditClearanceModalProps) {
  const { getToken } = useAuth();
  const updateClearance = useUpdateClearance();
  const [result, setResult] = useState(clearance.result);
  const [testDate, setTestDate] = useState(clearance.test_date);
  const [certificateNumber, setCertificateNumber] = useState(clearance.certificate_number || "");
  const [notes, setNotes] = useState(clearance.notes || "");
  const [certificateUrl, setCertificateUrl] = useState("");
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = async (e: FormEvent) => {
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
        dogId: clearance.dog_id,
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
      <form
        onSubmit={submit}
        className="bg-white rounded-lg shadow-xl w-full max-w-xl p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Edit Clearance</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>

        <p className="text-sm text-gray-600">
          {clearance.dog.registered_name} · {clearance.test_type.name}
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

export function HealthClearancesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<MyClearance | null>(null);
  const [collapsedByDog, setCollapsedByDog] = useState<Record<string, boolean>>({});
  const dogIdForAdd = searchParams.get("dog") || undefined;

  const status = (searchParams.get("status") as ClearanceStatusFilter) || "all";
  const breedingStatus =
    (searchParams.get("breeding_status") as BreedingStatusFilter) || "all";
  const sortBy = (searchParams.get("sort_by") as ClearanceSortBy) || "created_at";
  const sortDir = (searchParams.get("sort_dir") as ClearanceSortDir) || "desc";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = Math.max(1, Number(searchParams.get("limit") || "20"));

  const { data, isLoading } = useMyClearances({
    status,
    breedingStatus,
    sortBy,
    sortDir,
    page,
    limit,
  });
  const clearances = data?.clearances || [];
  const dogsList = data?.dogs || [];
  const meta = data?.meta;

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setIsAddOpen(true);
    }
  }, [searchParams]);

  const grouped = useMemo(() => {
    const byDog = new Map<string, MyClearance[]>();
    for (const clearance of clearances) {
      const list = byDog.get(clearance.dog.id);
      if (list) list.push(clearance);
      else byDog.set(clearance.dog.id, [clearance]);
    }
    return dogsList.map((dog) => ({ dog, items: byDog.get(dog.id) || [] }));
  }, [clearances, dogsList]);

  useEffect(() => {
    setCollapsedByDog((prev) => {
      const next = { ...prev };
      for (const group of grouped) {
        if (next[group.dog.id] === undefined) {
          next[group.dog.id] = true;
        }
      }
      return next;
    });
  }, [grouped]);

  const updateParams = (
    next: Partial<Record<"status" | "breeding_status" | "sort_by" | "sort_dir" | "add" | "page" | "limit" | "dog", string>>
  ) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    setSearchParams(params, { replace: true });
  };

  const closeAddModal = () => {
    setIsAddOpen(false);
    const params = new URLSearchParams(searchParams);
    params.delete("add");
    params.delete("dog");
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">My Health Clearances</h1>
        {grouped.length > 0 && (
          <>
            <button
              onClick={() =>
                setCollapsedByDog(
                  Object.fromEntries(grouped.map((group) => [group.dog.id, false]))
                )
              }
              className="ml-auto text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-white"
            >
              Expand all
            </button>
            <button
              onClick={() =>
                setCollapsedByDog(
                  Object.fromEntries(grouped.map((group) => [group.dog.id, true]))
                )
              }
              className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-white"
            >
              Collapse all
            </button>
          </>
        )}
        <button
          onClick={() => {
            setIsAddOpen(true);
            updateParams({ add: "1" });
          }}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
        >
          Add Health Clearance
        </button>
      </div>

      <p className="text-gray-600 mb-4">
        Submitted clearances grouped by dog. Approved records are locked from editing.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Dog Status</label>
          <select
            value={breedingStatus}
            onChange={(e) =>
              updateParams({ breeding_status: e.target.value, add: "", page: "1" })
            }
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="breeding">Breeding</option>
            <option value="retired">Retired</option>
            <option value="altered">Altered</option>
            <option value="not_published">Not Published</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Clearance Status</label>
          <select
            value={status}
            onChange={(e) => updateParams({ status: e.target.value, add: "", page: "1" })}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => updateParams({ sort_by: e.target.value, add: "", page: "1" })}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="created_at">Submitted</option>
            <option value="test_date">Test Date</option>
            <option value="status">Status</option>
            <option value="dog_name">Dog Name</option>
            <option value="test_type">Test Type</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Direction</label>
          <select
            value={sortDir}
            onChange={(e) => updateParams({ sort_dir: e.target.value, add: "", page: "1" })}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Per page</label>
          <select
            value={String(limit)}
            onChange={(e) => updateParams({ limit: e.target.value, page: "1" })}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-gray-500">Loading clearances...</p>}
      {!isLoading && grouped.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500">
          No submitted clearances found.
        </div>
      )}

      <div className="space-y-4">
        {grouped.map((group) => (
          <section key={group.dog.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/dogs/${group.dog.id}`}
                    className="font-semibold text-gray-900 hover:text-purple-700 hover:underline"
                  >
                    {group.dog.registered_name}
                  </Link>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ratingBgClass(group.dog.health_rating)}`}>
                    {group.dog.health_rating?.score ?? "N/A"}
                  </span>
                  <span className="text-xs text-gray-500">({group.items.length})</span>
                </div>
                {group.dog.call_name && <p className="text-xs text-gray-500">"{group.dog.call_name}"</p>}
              </div>
              <button
                onClick={() =>
                  setCollapsedByDog((prev) => ({ ...prev, [group.dog.id]: !prev[group.dog.id] }))
                }
                className="ml-auto text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-white"
              >
                {collapsedByDog[group.dog.id] ? "Expand" : "Collapse"}
              </button>
              <Link
                to={`/health/${group.dog.id}`}
                className="ml-3 text-sm text-purple-600 hover:underline"
              >
                Open dog health page
              </Link>
            </div>

            {!collapsedByDog[group.dog.id] && group.items.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500 flex items-center justify-between">
                <span>No clearances submitted yet.</span>
                <button
                  onClick={() => {
                    setIsAddOpen(true);
                    updateParams({ add: "1", dog: group.dog.id });
                  }}
                  className="text-purple-600 hover:underline text-sm"
                >
                  Add Health Clearance
                </button>
              </div>
            )}
            {!collapsedByDog[group.dog.id] && group.items.length > 0 && (
              <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500">Test</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500">Result</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500">Org</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500">Date</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500">Status</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500">Certificate</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((clearance) => {
                  const certUrl = clearance.certificate_url
                    ? clearance.certificate_url.startsWith("http")
                      ? clearance.certificate_url
                      : `${import.meta.env.VITE_API_URL || "/api"}/uploads/certificate/${clearance.certificate_url}`
                    : null;
                  return (
                    <tr key={clearance.id} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{clearance.test_type.short_name}</div>
                        <div className="text-xs text-gray-500">{clearance.test_type.category}</div>
                      </td>
                      <td className="px-3 py-2">{clearance.result}</td>
                      <td className="px-3 py-2 text-gray-600">{clearance.organization.name}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(clearance.test_date)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            clearance.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : clearance.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {clearance.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {certUrl ? (
                          <a
                            href={certUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:underline"
                          >
                            View
                          </a>
                        ) : clearance.certificate_number ? (
                          <span className="text-xs text-gray-500">{clearance.certificate_number}</span>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {clearance.can_edit ? (
                          <button
                            onClick={() => setEditing(clearance)}
                            className="text-purple-600 hover:underline"
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Locked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            )}
          </section>
        ))}
      </div>

      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => updateParams({ page: String(Math.max(1, meta.page - 1)) })}
            disabled={meta.page <= 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {meta.page} of {meta.pages} ({meta.total} dogs)
          </span>
          <button
            onClick={() => updateParams({ page: String(Math.min(meta.pages, meta.page + 1)) })}
            disabled={meta.page >= meta.pages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      <AddClearanceModal open={isAddOpen} onClose={closeAddModal} initialDogId={dogIdForAdd} />
      {editing && <EditClearanceModal clearance={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
