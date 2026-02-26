/**
 * Dog detail page with tab-based layout.
 * Tabs: Overview, Pedigree, Health Records, Progeny.
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDog, useDogPedigree, useDogProgeny, useTransferDog, useAdminUpdateDog } from "@/hooks/useDogs";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useContacts } from "@/hooks/useContacts";
import { PedigreeTree as PedigreeChart } from "@/components/PedigreeTree";
import { CertificateModal } from "@/components/CertificateModal";
import type { Dog, DogRegistration, DogHealthClearance, Contact } from "@breed-club/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = "overview" | "pedigree" | "health" | "progeny";
type SortField = "category" | "test_name" | "date" | "result" | "status";
type SortOrder = "asc" | "desc";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pedigree", label: "Pedigree" },
  { id: "health", label: "Health Records" },
  { id: "progeny", label: "Progeny" },
];

// ─── Transfer Dialog ──────────────────────────────────────────────────────────

function TransferDialog({
  dogId,
  onClose,
  onSuccess,
}: {
  dogId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newOwnerId, setNewOwnerId] = useState<string>();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const { data: contactsData } = useContacts(search);
  const contacts = contactsData?.data || [];
  const selectedContact = contacts.find((c: Contact) => c.id === newOwnerId);
  const transferMutation = useTransferDog();

  const handleTransfer = async () => {
    if (!newOwnerId) return;
    try {
      await transferMutation.mutateAsync({
        dogId,
        new_owner_id: newOwnerId,
        reason: reason || undefined,
        notes: notes || undefined,
      });
      onSuccess();
    } catch {
      // error handled by mutation state
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Transfer Ownership</h3>
        <p className="text-sm text-gray-600">
          Transfer this dog to a new owner. The transfer will require admin approval.
        </p>

        {/* Contact Typeahead */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">New Owner</label>
          <input
            type="text"
            value={search || selectedContact?.full_name || ""}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
              if (!e.target.value) setNewOwnerId(undefined);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search by name, kennel, or email..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {showDropdown && search && contacts.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {contacts.map((contact: Contact) => (
                <button
                  type="button"
                  key={contact.id}
                  onClick={() => {
                    setNewOwnerId(contact.id);
                    setSearch("");
                    setShowDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100"
                >
                  <div className="font-medium">{contact.full_name}</div>
                  {contact.kennel_name && <div className="text-sm text-gray-600">{contact.kennel_name}</div>}
                  {contact.email && <div className="text-xs text-gray-500">{contact.email}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="">Select reason...</option>
            <option value="sale">Sale</option>
            <option value="return">Return</option>
            <option value="gift">Gift</option>
            <option value="co_ownership">Co-ownership</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            rows={3}
            placeholder="Additional details..."
          />
        </div>

        {transferMutation.isError && (
          <p className="text-sm text-red-600">Failed to submit transfer request. Please try again.</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!newOwnerId || transferMutation.isPending}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {transferMutation.isPending ? "Submitting..." : "Request Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ dog, canManageClearances }: { dog: Dog; canManageClearances: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      {/* Metadata Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {dog.sex && (
          <div>
            <span className="text-sm text-gray-500">Sex</span>
            <p className="font-medium capitalize">{dog.sex}</p>
          </div>
        )}
        {dog.date_of_birth && (
          <div>
            <span className="text-sm text-gray-500">Date of Birth</span>
            <p className="font-medium">{new Date(dog.date_of_birth).toLocaleDateString()}</p>
          </div>
        )}
        {dog.date_of_death && (
          <div>
            <span className="text-sm text-gray-500">Date of Death</span>
            <p className="font-medium">{new Date(dog.date_of_death).toLocaleDateString()}</p>
          </div>
        )}
        {dog.color && (
          <div>
            <span className="text-sm text-gray-500">Color</span>
            <p className="font-medium">{dog.color}</p>
          </div>
        )}
        {dog.coat_type && (
          <div>
            <span className="text-sm text-gray-500">Coat Type</span>
            <p className="font-medium">{dog.coat_type}</p>
          </div>
        )}
        {dog.microchip_number && (
          <div>
            <span className="text-sm text-gray-500">Microchip</span>
            <p className="font-medium">{dog.microchip_number}</p>
          </div>
        )}
      </div>

      {/* Owner & Breeder */}
      <div className="grid grid-cols-2 gap-4">
        {dog.owner && (
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Owner</h3>
            <p className="font-medium">{dog.owner.full_name}</p>
            {dog.owner.kennel_name && <p className="text-sm text-gray-600">{dog.owner.kennel_name}</p>}
            {dog.owner.email && <p className="text-sm text-gray-600">{dog.owner.email}</p>}
          </div>
        )}
        {dog.breeder && (
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Breeder</h3>
            <p className="font-medium">{dog.breeder.full_name}</p>
            {dog.breeder.kennel_name && <p className="text-sm text-gray-600">{dog.breeder.kennel_name}</p>}
            {dog.breeder.email && <p className="text-sm text-gray-600">{dog.breeder.email}</p>}
          </div>
        )}
      </div>

      {/* Registrations */}
      {dog.registrations && dog.registrations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">External Registrations</h3>
          <div className="space-y-2">
            {dog.registrations.map((reg: DogRegistration) => (
              <div key={reg.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{reg.organization?.name}</span>
                  <span className="ml-3 text-gray-600">#{reg.registration_number}</span>
                </div>
                {reg.registration_url && (
                  <a
                    href={reg.registration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-700 hover:text-gray-900 underline"
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parents */}
      {(dog.sire || dog.dam) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Parents</h3>
          <div className="grid grid-cols-2 gap-4">
            {dog.sire && (
              <Link to={`/dogs/${dog.sire.id}`} className="p-4 border border-gray-200 rounded-lg hover:shadow transition">
                <h4 className="text-sm text-gray-500 mb-1">Sire</h4>
                <p className="font-medium">{dog.sire.registered_name}</p>
                {dog.sire.call_name && <p className="text-sm text-gray-600">&ldquo;{dog.sire.call_name}&rdquo;</p>}
              </Link>
            )}
            {dog.dam && (
              <Link to={`/dogs/${dog.dam.id}`} className="p-4 border border-gray-200 rounded-lg hover:shadow transition">
                <h4 className="text-sm text-gray-500 mb-1">Dam</h4>
                <p className="font-medium">{dog.dam.registered_name}</p>
                {dog.dam.call_name && <p className="text-sm text-gray-600">&ldquo;{dog.dam.call_name}&rdquo;</p>}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Health Stamp */}
      {dog.status === "approved" && (
        <div className="flex items-center gap-4">
          <Link
            to={`/dogs/${dog.id}/health`}
            target="_blank"
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            View Public Health Stamp &rarr;
          </Link>
          {canManageClearances && (
            <Link
              to={`/health/${dog.id}`}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Manage Clearances &rarr;
            </Link>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
        {dog.notes ? (
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{dog.notes}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No notes.</p>
        )}
      </div>
    </div>
  );
}

// ─── Pedigree Tab ─────────────────────────────────────────────────────────────

function PedigreeTab({ dogId }: { dogId: string }) {
  const [depth, setDepth] = useState(3);
  const { data, isLoading } = useDogPedigree(dogId, depth);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Pedigree</h2>
        <select
          value={depth}
          onChange={(e) => setDepth(parseInt(e.target.value))}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} Generations
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}
      {data && <PedigreeChart pedigree={data.pedigree as any} depth={depth} />}
    </div>
  );
}

// ─── Health Records Tab ───────────────────────────────────────────────────────

function SortableHeader({
  field,
  label,
  current,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  current: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
}) {
  return (
    <th
      className="text-left py-2 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none"
      onClick={() => onSort(field)}
    >
      {label}
      {current === field && (
        <span className="ml-1">{order === "asc" ? "\u2191" : "\u2193"}</span>
      )}
    </th>
  );
}

function getTestType(c: DogHealthClearance) {
  return c.healthTestType || c.testType || c.health_test_type;
}

function HealthRecordsTab({
  dog,
  canManageClearances,
}: {
  dog: Dog;
  canManageClearances: boolean;
}) {
  const [sortField, setSortField] = useState<SortField>("category");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [viewingCert, setViewingCert] = useState<string | null>(null);

  const clearances = dog.health_clearances || dog.healthClearances || [];

  const sorted = [...clearances].sort((a, b) => {
    let cmp = 0;
    const aType = getTestType(a);
    const bType = getTestType(b);
    switch (sortField) {
      case "category":
        cmp = (aType?.category || "").localeCompare(bType?.category || "");
        break;
      case "test_name":
        cmp = (aType?.name || "").localeCompare(bType?.name || "");
        break;
      case "date":
        cmp = (a.test_date || "").localeCompare(b.test_date || "");
        break;
      case "result":
        cmp = a.result.localeCompare(b.result);
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Health Records</h2>
        {canManageClearances && (
          <Link
            to={`/health/${dog.id}`}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Manage Clearances &rarr;
          </Link>
        )}
      </div>

      {sorted.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <SortableHeader field="category" label="Category" current={sortField} order={sortOrder} onSort={toggleSort} />
                <SortableHeader field="test_name" label="Test" current={sortField} order={sortOrder} onSort={toggleSort} />
                <SortableHeader field="result" label="Result" current={sortField} order={sortOrder} onSort={toggleSort} />
                <th className="text-left py-2 px-2 font-medium text-gray-500">Org</th>
                <SortableHeader field="date" label="Date" current={sortField} order={sortOrder} onSort={toggleSort} />
                <SortableHeader field="status" label="Status" current={sortField} order={sortOrder} onSort={toggleSort} />
                <th className="text-left py-2 px-2 font-medium text-gray-500">Cert</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const testType = getTestType(c);
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-600 capitalize">
                      {testType?.category || "\u2014"}
                    </td>
                    <td className="py-2 px-2 font-medium">{testType?.name || "\u2014"}</td>
                    <td className="py-2 px-2">{c.result}</td>
                    <td className="py-2 px-2 text-gray-600">{c.organization?.name || "\u2014"}</td>
                    <td className="py-2 px-2 text-gray-600">
                      {c.test_date ? new Date(c.test_date).toLocaleDateString() : "\u2014"}
                    </td>
                    <td className="py-2 px-2">
                      {c.status === "approved" ? (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Verified</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">Pending</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {c.certificate_url ? (
                        <button
                          onClick={() => setViewingCert(c.certificate_url!)}
                          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                        >
                          View
                        </button>
                      ) : c.certificate_number ? (
                        <span className="text-xs text-gray-500">{c.certificate_number}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No health clearances submitted yet.</p>
      )}

      {viewingCert && (
        <CertificateModal url={viewingCert} onClose={() => setViewingCert(null)} />
      )}
    </div>
  );
}

// ─── Progeny Tab ──────────────────────────────────────────────────────────────

function ProgenyTab({ dogId }: { dogId: string }) {
  const [depth, setDepth] = useState(1);
  const { data, isLoading } = useDogProgeny(dogId, depth);

  const depthOptions = [
    { value: 1, label: "Generation 1 (Children)" },
    { value: 2, label: "Generations 1\u20132 (+ Grandchildren)" },
    { value: 3, label: "Generations 1\u20133 (+ Great-Grandchildren)" },
    { value: 4, label: "Generations 1\u20134" },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Progeny
          {data && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({data.totalCount} total)
            </span>
          )}
        </h2>
        <select
          value={depth}
          onChange={(e) => setDepth(parseInt(e.target.value))}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          {depthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {data && data.generations.length === 0 && (
        <p className="text-gray-500 text-sm">No recorded progeny.</p>
      )}

      {data &&
        data.generations.map((gen) => (
          <div key={gen.generation} className="mb-6 last:mb-0">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Generation {gen.generation}
              <span className="ml-1 text-gray-400 font-normal">
                ({gen.dogs.length} {gen.dogs.length === 1 ? "dog" : "dogs"})
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Name</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Sex</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">DOB</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Color</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {gen.dogs.map((progeny) => (
                    <tr key={progeny.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2">
                        <Link
                          to={`/dogs/${progeny.id}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {progeny.registered_name}
                        </Link>
                        {progeny.call_name && (
                          <span className="ml-1 text-gray-500 text-xs">
                            &ldquo;{progeny.call_name}&rdquo;
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 capitalize text-gray-600">
                        {progeny.sex || "\u2014"}
                      </td>
                      <td className="py-2 px-2 text-gray-600">
                        {progeny.date_of_birth
                          ? new Date(progeny.date_of_birth).toLocaleDateString()
                          : "\u2014"}
                      </td>
                      <td className="py-2 px-2 text-gray-600">
                        {progeny.color || "\u2014"}
                      </td>
                      <td className="py-2 px-2 text-gray-600">
                        {progeny.owner?.full_name || "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useDog(id);
  const { member } = useCurrentMember();
  const canEdit = member?.tier === "admin" || member?.can_approve_clearances;
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const adminUpdateMutation = useAdminUpdateDog();

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">Failed to load dog details.</p>
          <Link to="/registry" className="text-gray-700 hover:text-gray-900 underline">
            Back to Registry
          </Link>
        </div>
      </div>
    );
  }

  const { dog } = data;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back link */}
      <div className="mb-6">
        <Link to="/registry" className="text-gray-600 hover:text-gray-900 text-sm">
          &larr; Back to Registry
        </Link>
      </div>

      {/* Header - always visible */}
      <div className="flex items-start gap-6 mb-6">
        {dog.photo_url && (
          <img
            src={dog.photo_url}
            alt={dog.registered_name}
            className="w-32 h-32 object-cover rounded-lg"
          />
        )}
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{dog.registered_name}</h1>
              {dog.call_name && (
                <p className="text-xl text-gray-600 mt-1">&ldquo;{dog.call_name}&rdquo;</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {dog.status === "pending" && (
                  <span className="px-3 py-1 text-sm font-medium text-yellow-700 bg-yellow-100 rounded">
                    Pending Approval
                  </span>
                )}
                {dog.status === "rejected" && (
                  <span className="px-3 py-1 text-sm font-medium text-red-700 bg-red-100 rounded">
                    Rejected
                  </span>
                )}
                {dog.is_historical && (
                  <span className="px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 rounded">
                    Historical / Pedigree Only
                  </span>
                )}
                {data.pendingTransfer && (
                  <span className="px-3 py-1 text-sm font-medium text-orange-700 bg-orange-100 rounded">
                    Transfer Pending &rarr; {data.pendingTransfer.toOwner?.full_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {canEdit && dog.is_historical && (
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        "Convert this historical dog to a full registry dog? You should fill in owner, DOB, and other details via Edit."
                      )
                    ) {
                      await adminUpdateMutation.mutateAsync({
                        id: dog.id,
                        is_historical: false,
                      });
                    }
                  }}
                  disabled={adminUpdateMutation.isPending}
                  className="px-4 py-2 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                >
                  {adminUpdateMutation.isPending ? "Converting..." : "Convert to Registry Dog"}
                </button>
              )}
              {data.canManageClearances && !data.pendingTransfer && (
                <button
                  onClick={() => setShowTransferDialog(true)}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Transfer Ownership
                </button>
              )}
              {canEdit && (
                <Link
                  to={`/dogs/${id}/edit`}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  Edit Dog
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab dog={dog} canManageClearances={!!data.canManageClearances} />
      )}
      {activeTab === "pedigree" && id && dog.status === "approved" && (
        <PedigreeTab dogId={id} />
      )}
      {activeTab === "pedigree" && dog.status !== "approved" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm">Pedigree is available after the dog is approved.</p>
        </div>
      )}
      {activeTab === "health" && (
        <HealthRecordsTab dog={dog} canManageClearances={!!data.canManageClearances} />
      )}
      {activeTab === "progeny" && id && dog.status === "approved" && (
        <ProgenyTab dogId={id} />
      )}
      {activeTab === "progeny" && dog.status !== "approved" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm">Progeny is available after the dog is approved.</p>
        </div>
      )}

      {/* Transfer Dialog */}
      {showTransferDialog && id && (
        <TransferDialog
          dogId={id}
          onClose={() => setShowTransferDialog(false)}
          onSuccess={() => setShowTransferDialog(false)}
        />
      )}
    </div>
  );
}
