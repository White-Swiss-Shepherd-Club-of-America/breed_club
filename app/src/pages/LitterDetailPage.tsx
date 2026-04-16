/**
 * Litter detail page with pup management.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useLitter, useAddPup, useUpdatePup, useSellPup, useUpdateLitter, useDeleteLitter } from "@/hooks/useLitters";
import { useDogs } from "@/hooks/useDogs";
import { useClub } from "@/hooks/useClub";
import { useSearchContacts } from "@/hooks/useContacts";
import type { LitterPup, Contact, Litter, Dog } from "@breed-club/shared";
import { formatDate } from "@/lib/utils";

function EditLitterModal({
  litter,
  onClose,
  onSuccess,
}: {
  litter: Litter;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const updateLitter = useUpdateLitter(litter.id);
  const { data: maleData } = useDogs({ sex: "male" });
  const { data: ownedData } = useDogs({ ownedOnly: true });

  const males = maleData?.data ?? [];
  const ownedFemales = useMemo(
    () => (ownedData?.data ?? []).filter((d: Dog) => d.sex === "female"),
    [ownedData]
  );

  const [formData, setFormData] = useState({
    sire_id: litter.sire_id || "",
    dam_id: litter.dam_id || "",
    whelp_date: litter.whelp_date || "",
    litter_name: litter.litter_name || "",
    num_males: litter.num_males?.toString() || "",
    num_females: litter.num_females?.toString() || "",
    notes: litter.notes || "",
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

  const dogLabel = (d: Dog) =>
    d.call_name ? `${d.registered_name} (${d.call_name})` : d.registered_name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateLitter.mutateAsync({
        sire_id: formData.sire_id || undefined,
        dam_id: formData.dam_id || undefined,
        whelp_date: formData.whelp_date || undefined,
        litter_name: formData.litter_name || undefined,
        num_males: formData.num_males ? parseInt(formData.num_males) : undefined,
        num_females: formData.num_females ? parseInt(formData.num_females) : undefined,
        notes: formData.notes || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update litter";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Edit Litter</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              disabled={updateLitter.isPending}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {updateLitter.isPending ? "Saving..." : "Save Changes"}
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
  const { data: clubData } = useClub();

  const breedColors = clubData?.club?.breed_colors ?? [];
  const breedCoatTypes = clubData?.club?.breed_coat_types ?? [];
  const showColorField = breedColors.length !== 1;
  const showCoatTypeField = breedCoatTypes.length !== 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addPup.mutateAsync({
        ...formData,
        sex: formData.sex || undefined,
        // Auto-fill single-option fields for pups too
        color: !showColorField && breedColors.length === 1 ? breedColors[0] : formData.color || undefined,
        coat_type: !showCoatTypeField && breedCoatTypes.length === 1 ? breedCoatTypes[0] : formData.coat_type || undefined,
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

          {showColorField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color <span className="text-gray-400">(optional)</span>
              </label>
              {breedColors.length > 1 ? (
                <select
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select...</option>
                  {breedColors.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                />
              )}
            </div>
          )}

          {showCoatTypeField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Coat Type <span className="text-gray-400">(optional)</span>
              </label>
              {breedCoatTypes.length > 1 ? (
                <select
                  value={formData.coat_type}
                  onChange={(e) => setFormData({ ...formData, coat_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select...</option>
                  {breedCoatTypes.map((ct) => (
                    <option key={ct} value={ct}>{ct}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.coat_type}
                  onChange={(e) => setFormData({ ...formData, coat_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                />
              )}
            </div>
          )}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [registeredName, setRegisteredName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: searchResults } = useSearchContacts(debouncedQuery);
  const sellPup = useSellPup(litterId, pup.id);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Show dropdown when we have results
  useEffect(() => {
    if (debouncedQuery.length >= 2 && !selectedContact) {
      setShowDropdown(true);
    }
  }, [debouncedQuery, selectedContact]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const contacts = searchResults?.data ?? [];

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSearchQuery(contact.full_name);
    setShowDropdown(false);
    setShowCreateNew(false);
  };

  const handleCreateNew = () => {
    setSelectedContact(null);
    setShowCreateNew(true);
    setShowDropdown(false);
  };

  const handleClearSelection = () => {
    setSelectedContact(null);
    setSearchQuery("");
    setShowCreateNew(false);
  };

  const isValid = registeredName && (selectedContact || (showCreateNew && buyerName && buyerEmail));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedContact) {
        await sellPup.mutateAsync({
          buyer_contact_id: selectedContact.id,
          registered_name: registeredName,
        });
      } else {
        await sellPup.mutateAsync({
          buyer_name: buyerName,
          buyer_email: buyerEmail,
          registered_name: registeredName,
        });
      }
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
          {/* Contact search */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Buyer *</label>
            {selectedContact ? (
              <div className="flex items-center justify-between px-3 py-2 border border-green-300 bg-green-50 rounded-lg">
                <div>
                  <span className="font-medium">{selectedContact.full_name}</span>
                  {selectedContact.email && (
                    <span className="text-sm text-gray-500 ml-2">{selectedContact.email}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (showCreateNew) setShowCreateNew(false);
                  }}
                  placeholder="Search contacts by name or email..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                />
                {showDropdown && debouncedQuery.length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {contacts.length > 0 ? (
                      contacts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectContact(c)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          <div className="font-medium text-sm">{c.full_name}</div>
                          {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">No contacts found</div>
                    )}
                    <button
                      type="button"
                      onClick={handleCreateNew}
                      className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-200 font-medium"
                    >
                      + Create new buyer
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Create new buyer fields */}
          {showCreateNew && !selectedContact && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Name *</label>
                <input
                  type="text"
                  required
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Email *</label>
                <input
                  type="email"
                  required
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Registered Name *
            </label>
            <input
              type="text"
              required
              value={registeredName}
              onChange={(e) => setRegisteredName(e.target.value)}
              placeholder="Full registered name for the pup"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            {selectedContact
              ? "This will assign the pup to the selected contact, create a dog record (pending approval), and mark the pup as sold."
              : "This will create a buyer contact, create a dog record (pending approval), and mark the pup as sold."}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={sellPup.isPending || !isValid}
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
  const navigate = useNavigate();
  const { data: litter, isLoading, error } = useLitter(id);
  const deleteLitter = useDeleteLitter(id ?? "");
  const [showAddPup, setShowAddPup] = useState(false);
  const [showEditLitter, setShowEditLitter] = useState(false);
  const [sellPupTarget, setSellPupTarget] = useState<LitterPup | null>(null);

  const handleDeleteLitter = async () => {
    if (!confirm("Are you sure you want to delete this litter? This cannot be undone.")) return;
    await deleteLitter.mutateAsync();
    navigate("/litters");
  };

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
        <Link to="/litters" className="text-gray-600 hover:text-gray-900 mb-2 inline-block">
          ← Back to Litters
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {litter.sire?.call_name || litter.sire?.registered_name || "Unknown"} x{" "}
              {litter.dam?.call_name || litter.dam?.registered_name || "Unknown"}
            </h1>
            {litter.litter_name && (
              <p className="text-lg text-gray-500 mt-1">Litter: {litter.litter_name}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  litter.approved
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {litter.approved ? "Approved" : "Pending Approval"}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            {!litter.approved && (
              <>
                <button
                  onClick={handleDeleteLitter}
                  disabled={deleteLitter.isPending}
                  className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                >
                  {deleteLitter.isPending ? "Deleting..." : "Delete Litter"}
                </button>
                <button
                  onClick={() => setShowEditLitter(true)}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Edit Litter
                </button>
              </>
            )}
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
      </div>

      {litter.sire_approval_status === "pending" && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-orange-800">
            Awaiting sire owner approval. The owner of the sire has been notified.
          </p>
        </div>
      )}

      {litter.sire_approval_status === "rejected" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">
            The sire owner has rejected the use of their sire for this litter.
          </p>
        </div>
      )}

      {!litter.approved && litter.sire_approval_status !== "pending" && litter.sire_approval_status !== "rejected" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            This litter is pending club approval. You can add pups after it's approved.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Litter Details</h2>
          <dl className="space-y-2 text-sm">
            {litter.whelp_date && (
              <div>
                <dt className="font-medium text-gray-700">Whelp Date</dt>
                <dd className="text-gray-600">{formatDate(litter.whelp_date)}</dd>
              </div>
            )}
            {litter.num_males != null && (
              <div>
                <dt className="font-medium text-gray-700">Males</dt>
                <dd className="text-gray-600">{litter.num_males}</dd>
              </div>
            )}
            {litter.num_females != null && (
              <div>
                <dt className="font-medium text-gray-700">Females</dt>
                <dd className="text-gray-600">{litter.num_females}</dd>
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
                  to={`/dogs/${litter.sire.id}`}
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
                  to={`/dogs/${litter.dam.id}`}
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
                          to={`/dogs/${pup.dog_id}`}
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

      {showEditLitter && (
        <EditLitterModal
          litter={litter}
          onClose={() => setShowEditLitter(false)}
          onSuccess={() => {}}
        />
      )}

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
