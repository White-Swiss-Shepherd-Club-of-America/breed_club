/**
 * Advanced dog search page with filters (member+ only).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import type { Dog } from "@breed-club/shared";

interface SearchFilters {
  q: string;
  sex?: "male" | "female";
  sire_id?: string;
  dam_id?: string;
}

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
          <div className="mt-2">
            <div className="text-xs text-gray-600">
              {dog.sire && <span>Sire: {dog.sire.registered_name}</span>}
              {dog.sire && dog.dam && <span className="mx-2">•</span>}
              {dog.dam && <span>Dam: {dog.dam.registered_name}</span>}
            </div>
          </div>
          {dog.health_clearances && dog.health_clearances.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {dog.health_clearances.slice(0, 5).map((clearance: any) => (
                <span
                  key={clearance.id}
                  className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded"
                  title={`${clearance.testType.name}: ${clearance.result}`}
                >
                  {clearance.testType.short_name || clearance.testType.name}
                </span>
              ))}
              {dog.health_clearances.length > 5 && (
                <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                  +{dog.health_clearances.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function SearchPage() {
  const { getToken, isSignedIn } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SearchFilters>({
    q: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dogs", "search", page, filters],
    queryFn: async () => {
      const token = await getToken();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      if (filters.q) params.set("q", filters.q);
      if (filters.sex) params.set("sex", filters.sex);
      if (filters.sire_id) params.set("sire_id", filters.sire_id);
      if (filters.dam_id) params.set("dam_id", filters.dam_id);

      return api.get<{ data: Dog[]; meta: { total: number; pages: number } }>(`/dogs/search?${params}`, { token });
    },
    enabled: isSignedIn === true,
  });

  const dogs = data?.data || [];
  const meta = data?.meta;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ q: "" });
    setPage(1);
  };

  const activeFilterCount = [filters.sex, filters.sire_id, filters.dam_id].filter(Boolean).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search Dogs</h1>
        <p className="text-gray-600 mt-1">Search the complete registry with advanced filters</p>
      </div>

      <form onSubmit={handleSearch} className="mb-6 space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search by name..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-gray-900 text-white rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            Search
          </button>
        </div>

        {showFilters && (
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
                <select
                  value={filters.sex || ""}
                  onChange={(e) =>
                    setFilters({ ...filters, sex: e.target.value as "male" | "female" | undefined })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">Any</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </form>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : dogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No dogs found matching your search criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 mb-4">
            Found {meta?.total || 0} dog{meta?.total !== 1 ? "s" : ""}
          </div>

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
