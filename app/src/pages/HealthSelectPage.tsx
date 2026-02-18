/**
 * HealthSelectPage - Pick a dog to add health clearances for.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useDogs } from "@/hooks/useDogs";
import { HeartPulse } from "lucide-react";
import type { Dog } from "@breed-club/shared";

export function HealthSelectPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useDogs(page, search || undefined, undefined, true);
  const dogs = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Add Health Clearance</h1>
      <p className="text-gray-600 mb-6">Select a dog to submit a health clearance for.</p>

      <input
        type="text"
        placeholder="Search by name..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
      />

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {!isLoading && dogs.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No dogs found. <Link to="/dogs/register" className="text-gray-900 underline">Register a dog</Link> first.
        </p>
      )}

      <div className="space-y-2">
        {dogs.map((dog: Dog) => (
          <Link
            key={dog.id}
            to={`/health/${dog.id}`}
            className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <div>
              <div className="font-medium text-gray-900">{dog.registered_name}</div>
              {dog.call_name && (
                <div className="text-sm text-gray-500">"{dog.call_name}"</div>
              )}
            </div>
            <HeartPulse className="h-5 w-5 text-gray-400" />
          </Link>
        ))}
      </div>

      {meta && meta.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            Page {page} of {meta.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
            disabled={page >= meta.pages}
            className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
