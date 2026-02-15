/**
 * Dog registry page - list of dogs (own dogs for certificate+, all approved for member+).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useDogs } from "@/hooks/useDogs";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import type { Dog } from "@breed-club/shared";

function DogCard({ dog }: { dog: Dog }) {
  return (
    <Link
      to={`/dogs/${dog.id}`}
      className="block p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-4">
        {dog.photo_url && (
          <img src={dog.photo_url} alt={dog.registered_name} className="w-20 h-20 object-cover rounded" />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{dog.registered_name}</h3>
          {dog.call_name && <p className="text-sm text-gray-600">"{dog.call_name}"</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-700">
            {dog.sex && <span className="capitalize">{dog.sex}</span>}
            {dog.date_of_birth && <span>Born {new Date(dog.date_of_birth).toLocaleDateString()}</span>}
            {dog.color && <span>{dog.color}</span>}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {dog.owner?.full_name && <div>Owner: {dog.owner.full_name}</div>}
            {dog.breeder?.full_name && <div>Breeder: {dog.breeder.full_name}</div>}
          </div>
          {dog.status === "pending" && (
            <span className="inline-block mt-2 px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded">
              Pending Approval
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function RegistryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useDogs(page, search);
  const { member } = useCurrentMember();

  const dogs = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dog Registry</h1>
          <p className="text-gray-600 mt-1">
            {member?.tier === "certificate"
              ? "Your registered dogs"
              : "Browse the complete dog registry"}
          </p>
        </div>
        <Link
          to="/dogs/register"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Register a Dog
        </Link>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : dogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">
            {search ? "No dogs found matching your search." : "No dogs registered yet."}
          </p>
          {member?.tier === "certificate" && !search && (
            <Link
              to="/dogs/register"
              className="inline-block px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Register Your First Dog
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {dogs.map((dog: Dog) => (
            <DogCard key={dog.id} dog={dog} />
          ))}

          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {meta.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page === meta.pages}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
