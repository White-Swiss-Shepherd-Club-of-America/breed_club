/**
 * Create litter page for breeders.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useDogs } from "@/hooks/useDogs";
import { useCreateLitter } from "@/hooks/useLitters";
import type { Dog } from "@breed-club/shared";

export function LitterCreatePage() {
  const navigate = useNavigate();
  const { member } = useCurrentMember();
  const createLitter = useCreateLitter();

  // Fetch all approved males for sire dropdown
  const { data: maleData } = useDogs({ sex: "male" });
  // Fetch user's own dogs for dam dropdown
  const { data: ownedData } = useDogs({ ownedOnly: true });

  const males = maleData?.data ?? [];
  const ownedFemales = useMemo(
    () => (ownedData?.data ?? []).filter((d: Dog) => d.sex === "female"),
    [ownedData]
  );

  const [formData, setFormData] = useState({
    sire_id: "",
    dam_id: "",
    whelp_date: "",
    litter_name: "",
    num_males: "",
    num_females: "",
    notes: "",
  });
  const [sireSearch, setSireSearch] = useState("");
  const [damSearch, setDamSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredMales = useMemo(() => {
    if (!sireSearch) return males;
    const q = sireSearch.toLowerCase();
    return males.filter(
      (d: Dog) =>
        d.registered_name.toLowerCase().includes(q) ||
        (d.call_name && d.call_name.toLowerCase().includes(q))
    );
  }, [males, sireSearch]);

  const filteredFemales = useMemo(() => {
    if (!damSearch) return ownedFemales;
    const q = damSearch.toLowerCase();
    return ownedFemales.filter(
      (d: Dog) =>
        d.registered_name.toLowerCase().includes(q) ||
        (d.call_name && d.call_name.toLowerCase().includes(q))
    );
  }, [ownedFemales, damSearch]);

  // Check if selected sire is owned by someone else
  const selectedSire = males.find((d: Dog) => d.id === formData.sire_id);
  const sireNeedsApproval =
    selectedSire &&
    member?.contact_id &&
    selectedSire.owner_id !== member.contact_id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await createLitter.mutateAsync({
        sire_id: formData.sire_id || undefined,
        dam_id: formData.dam_id || undefined,
        whelp_date: formData.whelp_date || undefined,
        litter_name: formData.litter_name || undefined,
        num_males: formData.num_males ? parseInt(formData.num_males) : undefined,
        num_females: formData.num_females ? parseInt(formData.num_females) : undefined,
        notes: formData.notes || undefined,
      });
      navigate("/litters");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create litter";
      setError(message);
    }
  };

  const dogLabel = (d: Dog) =>
    d.call_name ? `${d.registered_name} (${d.call_name})` : d.registered_name;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Register New Litter</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {sireNeedsApproval && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-800">
            The selected sire is owned by another member. They will need to approve the
            use of their sire before this litter can be fully approved.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sire */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sire</label>
          <input
            type="text"
            placeholder="Search males..."
            value={sireSearch}
            onChange={(e) => setSireSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 mb-1"
          />
          <select
            value={formData.sire_id}
            onChange={(e) => setFormData({ ...formData, sire_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            size={Math.min(filteredMales.length + 1, 6)}
          >
            <option value="">No sire selected</option>
            {filteredMales.map((d: Dog) => (
              <option key={d.id} value={d.id}>
                {dogLabel(d)}
              </option>
            ))}
          </select>
        </div>

        {/* Dam */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dam</label>
          <input
            type="text"
            placeholder="Search your females..."
            value={damSearch}
            onChange={(e) => setDamSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 mb-1"
          />
          <select
            value={formData.dam_id}
            onChange={(e) => setFormData({ ...formData, dam_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            size={Math.min(filteredFemales.length + 1, 6)}
          >
            <option value="">No dam selected</option>
            {filteredFemales.map((d: Dog) => (
              <option key={d.id} value={d.id}>
                {dogLabel(d)}
              </option>
            ))}
          </select>
        </div>

        {/* Whelp Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Whelp Date</label>
          <input
            type="date"
            value={formData.whelp_date}
            onChange={(e) => setFormData({ ...formData, whelp_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Litter Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Litter Name</label>
          <input
            type="text"
            value={formData.litter_name}
            onChange={(e) => setFormData({ ...formData, litter_name: e.target.value })}
            placeholder="e.g. A, B, Spring 2026"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Num Males / Num Females */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Males</label>
            <input
              type="number"
              min="0"
              value={formData.num_males}
              onChange={(e) => setFormData({ ...formData, num_males: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Females</label>
            <input
              type="number"
              min="0"
              value={formData.num_females}
              onChange={(e) => setFormData({ ...formData, num_females: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        {/* Notes */}
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
            disabled={createLitter.isPending}
            className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {createLitter.isPending ? "Registering..." : "Register Litter"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/litters")}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
