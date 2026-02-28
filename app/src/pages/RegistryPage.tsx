/**
 * Dog registry page — sortable table of all approved dogs (member+ only).
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDogs } from "@/hooks/useDogs";
import type { Dog } from "@breed-club/shared";

type SortKey = "registered_name" | "call_name" | "sex" | "date_of_birth" | "color" | "owner" | "breeder";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <th
      className={`pb-3 font-medium cursor-pointer select-none hover:text-gray-900 ${className || ""}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            {currentDir === "asc" ? (
              <path d="M6 2L10 8H2L6 2Z" />
            ) : (
              <path d="M6 10L2 4H10L6 10Z" />
            )}
          </svg>
        )}
      </span>
    </th>
  );
}

export function RegistryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sexFilter, setSexFilter] = useState<"male" | "female" | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("registered_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data, isLoading } = useDogs(
    page,
    search || undefined,
    sexFilter || undefined,
  );

  const dogs = data?.data || [];
  const meta = data?.meta;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedDogs = useMemo(() => {
    const sorted = [...dogs].sort((a, b) => {
      let aVal: string;
      let bVal: string;

      switch (sortKey) {
        case "owner":
          aVal = a.owner?.full_name || "";
          bVal = b.owner?.full_name || "";
          break;
        case "breeder":
          aVal = a.breeder?.full_name || "";
          bVal = b.breeder?.full_name || "";
          break;
        default:
          aVal = (a[sortKey] as string) || "";
          bVal = (b[sortKey] as string) || "";
      }

      return aVal.localeCompare(bVal);
    });

    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [dogs, sortKey, sortDir]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dog Registry</h1>
        <p className="text-gray-600 mt-1">Browse the complete dog registry</p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <select
          value={sexFilter}
          onChange={(e) => {
            setSexFilter(e.target.value as "" | "male" | "female");
            setPage(1);
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="">All sexes</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : sortedDogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">
            {search || sexFilter
              ? "No dogs found matching your criteria."
              : "No dogs in the registry yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-500 mb-3">
            {meta?.total || 0} dog{meta?.total !== 1 ? "s" : ""} found
          </div>

          <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <SortHeader label="Registered Name" sortKey="registered_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="pl-4" />
                  <SortHeader label="Call Name" sortKey="call_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Sex" sortKey="sex" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortHeader label="DOB" sortKey="date_of_birth" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortHeader label="Color" sortKey="color" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortHeader label="Owner" sortKey="owner" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortHeader label="Breeder" sortKey="breeder" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedDogs.map((dog: Dog) => (
                  <tr key={dog.id} className="hover:bg-gray-50">
                    <td className="py-3 pl-4">
                      <Link
                        to={`/dogs/${dog.id}`}
                        className="text-gray-900 font-medium hover:underline"
                      >
                        {dog.registered_name}
                      </Link>
                    </td>
                    <td className="py-3 text-gray-600">{dog.call_name || "—"}</td>
                    <td className="py-3 text-gray-600 capitalize hidden md:table-cell">{dog.sex || "—"}</td>
                    <td className="py-3 text-gray-600 hidden sm:table-cell">
                      {dog.date_of_birth
                        ? new Date(dog.date_of_birth).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 text-gray-600 hidden lg:table-cell">{dog.color || "—"}</td>
                    <td className="py-3 text-gray-600 hidden md:table-cell">{dog.owner?.full_name || "—"}</td>
                    <td className="py-3 text-gray-600 hidden lg:table-cell">{dog.breeder?.full_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
        </>
      )}
    </div>
  );
}
