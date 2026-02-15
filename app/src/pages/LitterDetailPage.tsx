/**
 * Litter detail page with pup management.
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useLitter, useAddPup, useUpdatePup, useSellPup } from "@/hooks/useLitters";
import type { LitterPup } from "@breed-club/shared";

function AddPupModal({
  litterId,
  onClose,
  onSuccess,
}: {
  litterId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    call_name: "",
    sex: "" as "male" | "female" | "",
    color: "",
    coat_type: "",
    notes: "",
  });
  const addPup = useAddPup(litterId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addPup.mutateAsync({
        ...formData,
        sex: formData.sex || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to add pup:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Add Pup</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Call Name</label>
            <input
              type="text"
              value={formData.call_name}
              onChange={(e) => setFormData({ ...formData, call_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
            <select
              value={formData.sex}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value as "male" | "female" })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <input
              type="text"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Coat Type</label>
            <input
              type="text"
              value={formData.coat_type}
              onChange={(e) => setFormData({ ...formData, coat_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={addPup.isPending}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {addPup.isPending ? "Adding..." : "Add Pup"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SellPupModal({
  litterId,
  pup,
  onClose,
  onSuccess,
}: {
  litterId: string;
  pup: LitterPup;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    buyer_name: "",
    buyer_email: "",
    registered_name: "",
  });
  const sellPup = useSellPup(litterId, pup.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sellPup.mutateAsync(formData);
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to sell pup:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Sell Pup: {pup.call_name || "Unnamed"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Name *</label>
            <input
              type="text"
              required
              value={formData.buyer_name}
              onChange={(e) => setFormData({ ...formData, buyer_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Email *</label>
            <input
              type="email"
              required
              value={formData.buyer_email}
              onChange={(e) => setFormData({ ...formData, buyer_email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Registered Name *
            </label>
            <input
              type="text"
              required
              value={formData.registered_name}
              onChange={(e) => setFormData({ ...formData, registered_name: e.target.value })}
              placeholder="Full registered name for the pup"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            This will create a buyer contact, create a dog record (pending approval), and mark the
            pup as sold.
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={sellPup.isPending}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {sellPup.isPending ? "Selling..." : "Sell Pup"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LitterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: litter, isLoading, error } = useLitter(id);
  const [showAddPup, setShowAddPup] = useState(false);
  const [sellPupTarget, setSellPupTarget] = useState<LitterPup | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-600">Loading litter...</div>
      </div>
    );
  }

  if (error || !litter) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load litter. Please try again.</p>
        </div>
      </div>
    );
  }

  const pups = litter.pups || [];
  const availablePups = pups.filter((p) => p.status === "available").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link to="/app/litters" className="text-gray-600 hover:text-gray-900 mb-2 inline-block">
          ← Back to Litters
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {litter.sire?.call_name || litter.sire?.registered_name || "Unknown"} x{" "}
              {litter.dam?.call_name || litter.dam?.registered_name || "Unknown"}
            </h1>
            <div className="flex items-center gap-2 mt-2">
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
          {litter.approved && (
            <button
              onClick={() => setShowAddPup(true)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
            >
              Add Pup
            </button>
          )}
        </div>
      </div>

      {!litter.approved && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            This litter is pending approval. You can add pups after it's approved.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Litter Details</h2>
          <dl className="space-y-2 text-sm">
            {litter.expected_date && (
              <div>
                <dt className="font-medium text-gray-700">Expected Date</dt>
                <dd className="text-gray-600">{new Date(litter.expected_date).toLocaleDateString()}</dd>
              </div>
            )}
            {litter.whelp_date && (
              <div>
                <dt className="font-medium text-gray-700">Whelp Date</dt>
                <dd className="text-gray-600">{new Date(litter.whelp_date).toLocaleDateString()}</dd>
              </div>
            )}
            {litter.num_puppies_born !== null && (
              <div>
                <dt className="font-medium text-gray-700">Puppies Born</dt>
                <dd className="text-gray-600">{litter.num_puppies_born}</dd>
              </div>
            )}
            {litter.num_puppies_survived !== null && (
              <div>
                <dt className="font-medium text-gray-700">Puppies Survived</dt>
                <dd className="text-gray-600">{litter.num_puppies_survived}</dd>
              </div>
            )}
            {litter.notes && (
              <div>
                <dt className="font-medium text-gray-700">Notes</dt>
                <dd className="text-gray-600">{litter.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Parents</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-700 mb-1">Sire</h3>
              {litter.sire ? (
                <Link
                  to={`/app/dogs/${litter.sire.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {litter.sire.call_name || litter.sire.registered_name}
                </Link>
              ) : (
                <p className="text-gray-500">Not specified</p>
              )}
            </div>
            <div>
              <h3 className="font-medium text-gray-700 mb-1">Dam</h3>
              {litter.dam ? (
                <Link
                  to={`/app/dogs/${litter.dam.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {litter.dam.call_name || litter.dam.registered_name}
                </Link>
              ) : (
                <p className="text-gray-500">Not specified</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">
          Pups ({availablePups} available of {pups.length} total)
        </h2>
        {pups.length === 0 ? (
          <p className="text-gray-600">No pups added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Sex
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Color
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Buyer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pups.map((pup) => (
                  <tr key={pup.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {pup.call_name || "Unnamed"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pup.sex || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pup.color || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          pup.status === "available"
                            ? "bg-green-100 text-green-800"
                            : pup.status === "sold"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {pup.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pup.buyer?.full_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {pup.status === "available" && (
                        <button
                          onClick={() => setSellPupTarget(pup)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Sell
                        </button>
                      )}
                      {pup.status === "sold" && pup.dog_id && (
                        <Link
                          to={`/app/dogs/${pup.dog_id}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          View Dog
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddPup && (
        <AddPupModal
          litterId={litter.id}
          onClose={() => setShowAddPup(false)}
          onSuccess={() => {
            // Success handled by query invalidation
          }}
        />
      )}

      {sellPupTarget && (
        <SellPupModal
          litterId={litter.id}
          pup={sellPupTarget}
          onClose={() => setSellPupTarget(null)}
          onSuccess={() => {
            // Success handled by query invalidation
          }}
        />
      )}
    </div>
  );
}
