/**
 * Dog detail page with registrations, clearances, and pedigree links.
 */

import { useParams, Link } from "react-router-dom";
import { useDog, useDogPedigree } from "@/hooks/useDogs";
import { PedigreeTree as PedigreeTreeComponent } from "@/components/PedigreeTree";
import type { Dog, DogRegistration } from "@breed-club/shared";

function PedigreeSection({ dogId }: { dogId: string }) {
  const { data, isLoading } = useDogPedigree(dogId, 3);

  if (isLoading) return <div className="text-gray-600">Loading pedigree...</div>;
  if (!data) return null;

  const { pedigree } = data;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Pedigree</h2>
      <PedigreeTreeComponent pedigree={pedigree} depth={3} />
    </div>
  );
}

export function DogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useDog(id);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12 text-gray-600">Loading dog details...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto">
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/registry" className="text-gray-600 hover:text-gray-900 text-sm">
          ← Back to Registry
        </Link>
      </div>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-6">
          {dog.photo_url && (
            <img src={dog.photo_url} alt={dog.registered_name} className="w-32 h-32 object-cover rounded-lg" />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{dog.registered_name}</h1>
            {dog.call_name && <p className="text-xl text-gray-600 mt-1">"{dog.call_name}"</p>}
            {dog.status === "pending" && (
              <span className="inline-block mt-2 px-3 py-1 text-sm font-medium text-yellow-700 bg-yellow-100 rounded">
                Pending Approval
              </span>
            )}
            {dog.status === "rejected" && (
              <span className="inline-block mt-2 px-3 py-1 text-sm font-medium text-red-700 bg-red-100 rounded">
                Rejected
              </span>
            )}
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
          {dog.sex && (
            <div>
              <span className="text-sm text-gray-600">Sex</span>
              <p className="font-medium capitalize">{dog.sex}</p>
            </div>
          )}
          {dog.date_of_birth && (
            <div>
              <span className="text-sm text-gray-600">Date of Birth</span>
              <p className="font-medium">{new Date(dog.date_of_birth).toLocaleDateString()}</p>
            </div>
          )}
          {dog.color && (
            <div>
              <span className="text-sm text-gray-600">Color</span>
              <p className="font-medium">{dog.color}</p>
            </div>
          )}
          {dog.coat_type && (
            <div>
              <span className="text-sm text-gray-600">Coat Type</span>
              <p className="font-medium">{dog.coat_type}</p>
            </div>
          )}
          {dog.microchip_number && (
            <div>
              <span className="text-sm text-gray-600">Microchip</span>
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
            <h2 className="text-lg font-semibold text-gray-900 mb-3">External Registrations</h2>
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
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Parents</h2>
            <div className="grid grid-cols-2 gap-4">
              {dog.sire && (
                <Link to={`/dogs/${dog.sire.id}`} className="p-4 border border-gray-200 rounded-lg hover:shadow">
                  <h3 className="text-sm text-gray-600 mb-1">Sire</h3>
                  <p className="font-medium">{dog.sire.registered_name}</p>
                  {dog.sire.call_name && <p className="text-sm text-gray-600">"{dog.sire.call_name}"</p>}
                </Link>
              )}
              {dog.dam && (
                <Link to={`/dogs/${dog.dam.id}`} className="p-4 border border-gray-200 rounded-lg hover:shadow">
                  <h3 className="text-sm text-gray-600 mb-1">Dam</h3>
                  <p className="font-medium">{dog.dam.registered_name}</p>
                  {dog.dam.call_name && <p className="text-sm text-gray-600">"{dog.dam.call_name}"</p>}
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Pedigree Tree */}
        {id && dog.status === "approved" && <PedigreeSection dogId={id} />}

        {/* Health Clearances */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Health Clearances</h2>
            <Link
              to={`/app/health/${id}`}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Manage Clearances →
            </Link>
          </div>
          {dog.healthClearances && dog.healthClearances.length > 0 ? (
            <div className="space-y-2">
              {dog.healthClearances.map((clearance) => (
                <div key={clearance.id} className="p-3 bg-gray-50 rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{clearance.testType?.name}</span>
                      <span className="ml-3 text-gray-700">{clearance.result}</span>
                    </div>
                    {clearance.status === "approved" ? (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Verified</span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">Pending</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {clearance.organization?.name}
                    {clearance.test_date && ` • ${new Date(clearance.test_date).toLocaleDateString()}`}
                    {clearance.certificate_number && ` • ${clearance.certificate_number}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No health clearances submitted yet.</p>
          )}
          {dog.status === "approved" && id && (
            <div className="mt-4">
              <Link
                to={`/dogs/${id}/health`}
                target="_blank"
                className="text-sm text-purple-600 hover:text-purple-700"
              >
                View Public Health Stamp →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
