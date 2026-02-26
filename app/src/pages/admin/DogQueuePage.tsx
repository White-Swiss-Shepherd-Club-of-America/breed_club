/**
 * Admin page for approving/rejecting pending dogs.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { usePendingDogs, useApproveDog, useRejectDog } from "@/hooks/useDogs";
import type { Dog } from "@breed-club/shared";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getDocUrl(urlOrKey: string): string {
  return urlOrKey.startsWith("http") ? urlOrKey : `${API_BASE}/uploads/certificate/${urlOrKey}`;
}

function isImageKey(urlOrKey: string): boolean {
  return /\.(jpg|jpeg|png)$/i.test(urlOrKey);
}

function DogCard({ dog, onApprove, onReject }: { dog: Dog; onApprove: () => void; onReject: () => void }) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex items-start gap-4">
        {dog.photo_url && (
          <img src={dog.photo_url} alt={dog.registered_name} className="w-20 h-20 object-cover rounded" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{dog.registered_name}</h3>
            {dog.is_historical && (
              <span className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded">
                Historical
              </span>
            )}
          </div>
          {dog.call_name && <p className="text-sm text-gray-600">"{dog.call_name}"</p>}

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {dog.sex && (
              <div>
                <span className="text-gray-600">Sex:</span> <span className="capitalize">{dog.sex}</span>
              </div>
            )}
            {dog.date_of_birth && (
              <div>
                <span className="text-gray-600">DOB:</span>{" "}
                {new Date(dog.date_of_birth).toLocaleDateString()}
              </div>
            )}
            {dog.color && (
              <div>
                <span className="text-gray-600">Color:</span> {dog.color}
              </div>
            )}
            {dog.microchip_number && (
              <div>
                <span className="text-gray-600">Microchip:</span> {dog.microchip_number}
              </div>
            )}
          </div>

          {(dog.owner || dog.breeder) && (
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              {dog.owner && (
                <div>
                  <div className="text-xs text-gray-600">Owner</div>
                  <div className="font-medium">{dog.owner.full_name}</div>
                  {dog.owner.email && <div className="text-gray-600">{dog.owner.email}</div>}
                </div>
              )}
              {dog.breeder && (
                <div>
                  <div className="text-xs text-gray-600">Breeder</div>
                  <div className="font-medium">{dog.breeder.full_name}</div>
                  {dog.breeder.email && <div className="text-gray-600">{dog.breeder.email}</div>}
                </div>
              )}
            </div>
          )}

          {dog.registrations && dog.registrations.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1">Registrations</div>
              <div className="space-y-1">
                {dog.registrations.map((reg) => (
                  <div key={reg.id} className="text-sm">
                    <span className="font-medium">{reg.organization?.name}:</span> {reg.registration_number}
                    {reg.registration_url && (
                      <>
                        {isImageKey(reg.registration_url) ? (
                          <div className="mt-1">
                            <a
                              href={getDocUrl(reg.registration_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={getDocUrl(reg.registration_url)}
                                alt="Registration certificate"
                                className="max-w-xs max-h-40 rounded border object-contain"
                              />
                            </a>
                          </div>
                        ) : (
                          <a
                            href={getDocUrl(reg.registration_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-gray-600 hover:text-gray-900 underline"
                          >
                            {reg.registration_url.startsWith("http") ? "verify" : "view certificate (PDF)"}
                          </a>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(dog.sire || dog.dam) && (
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              {dog.sire && (
                <div>
                  <div className="text-xs text-gray-600">Sire</div>
                  <Link to={`/dogs/${dog.sire.id}`} className="font-medium hover:underline">
                    {dog.sire.registered_name}
                  </Link>
                </div>
              )}
              {dog.dam && (
                <div>
                  <div className="text-xs text-gray-600">Dam</div>
                  <Link to={`/dogs/${dog.dam.id}`} className="font-medium hover:underline">
                    {dog.dam.registered_name}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
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
        <Link
          to={`/dogs/${dog.id}`}
          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}

export function DogQueuePage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePendingDogs(page);
  const approveMutation = useApproveDog();
  const rejectMutation = useRejectDog();

  const dogs = data?.data || [];
  const meta = data?.meta;

  const handleApprove = async (id: string) => {
    await approveMutation.mutateAsync(id);
  };

  const handleReject = async (id: string) => {
    if (confirm("Are you sure you want to reject this dog?")) {
      await rejectMutation.mutateAsync(id);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dog Approval Queue</h1>
        <p className="text-gray-600 mt-1">Review and approve pending dog registrations.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : dogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No pending dog registrations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dogs.map((dog: Dog) => (
            <DogCard key={dog.id} dog={dog} onApprove={() => handleApprove(dog.id)} onReject={() => handleReject(dog.id)} />
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
