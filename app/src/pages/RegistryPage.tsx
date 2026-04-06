/**
 * Dog registry page — server-side filtered/sorted table of all approved dogs (member+ only).
 */

import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDogs, useDogFilterOptions } from "@/hooks/useDogs";
import type { BreedingStatus, Dog } from "@breed-club/shared";
import { formatDate } from "@/lib/utils";

type SortKey = "registered_name" | "sex" | "date_of_birth" | "health_score" | "breeder";
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

const RATING_COLOR_MAP: Record<string, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
};

const BREEDING_STATUS_LABELS: Record<BreedingStatus, string> = {
  not_published: "Not Published",
  breeding: "Breeding",
  retired: "Retired",
  altered: "Altered",
};

const BREEDING_STATUS_BADGE_CLASS: Record<BreedingStatus, string> = {
  not_published: "bg-gray-100 text-gray-700 border-gray-200",
  breeding: "bg-green-100 text-green-800 border-green-200",
  retired: "bg-amber-100 text-amber-800 border-amber-200",
  altered: "bg-blue-100 text-blue-800 border-blue-200",
};

const INPUT_CLASS = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent";

export function RegistryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from URL params
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") || "1"));
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  const [sexFilter, setSexFilter] = useState<"male" | "female" | "">(() => (searchParams.get("sex") as "male" | "female" | "") || "");
  const [breedingStatus, setBreedingStatus] = useState<BreedingStatus | "">(() => (searchParams.get("breeding_status") as BreedingStatus | "") || "");
  const [coatType, setCoatType] = useState(() => searchParams.get("coat_type") || "");
  const [color, setColor] = useState(() => searchParams.get("color") || "");
  const [dobFrom, setDobFrom] = useState(() => searchParams.get("dob_from") || "");
  const [dobTo, setDobTo] = useState(() => searchParams.get("dob_to") || "");
  const [breederInput, setBreederInput] = useState(() => searchParams.get("breeder") || "");
  const [debouncedBreeder, setDebouncedBreeder] = useState(breederInput);
  const [ownerInput, setOwnerInput] = useState(() => searchParams.get("owner") || "");
  const [debouncedOwner, setDebouncedOwner] = useState(ownerInput);
  const [healthMin, setHealthMin] = useState(() => searchParams.get("health_score_min") || "");
  const [healthMax, setHealthMax] = useState(() => searchParams.get("health_score_max") || "");
  const [sortKey, setSortKey] = useState<SortKey>(() => (searchParams.get("sort_by") as SortKey) || "registered_name");
  const [sortDir, setSortDir] = useState<SortDir>(() => (searchParams.get("sort_dir") as SortDir) || "asc");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Debounce text inputs
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBreeder(breederInput), 300);
    return () => clearTimeout(t);
  }, [breederInput]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedOwner(ownerInput), 300);
    return () => clearTimeout(t);
  }, [ownerInput]);

  // Sync state to URL
  useEffect(() => {
    const p = new URLSearchParams();
    if (page > 1) p.set("page", String(page));
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (sexFilter) p.set("sex", sexFilter);
    if (breedingStatus) p.set("breeding_status", breedingStatus);
    if (coatType) p.set("coat_type", coatType);
    if (color) p.set("color", color);
    if (dobFrom) p.set("dob_from", dobFrom);
    if (dobTo) p.set("dob_to", dobTo);
    if (debouncedBreeder) p.set("breeder", debouncedBreeder);
    if (debouncedOwner) p.set("owner", debouncedOwner);
    if (healthMin) p.set("health_score_min", healthMin);
    if (healthMax) p.set("health_score_max", healthMax);
    if (sortKey !== "registered_name") p.set("sort_by", sortKey);
    if (sortDir !== "asc") p.set("sort_dir", sortDir);
    setSearchParams(p, { replace: true });
  }, [page, debouncedSearch, sexFilter, breedingStatus, coatType, color, dobFrom, dobTo, debouncedBreeder, debouncedOwner, healthMin, healthMax, sortKey, sortDir, setSearchParams]);

  // Count active filters (excluding search, sort, and page)
  const activeFilterCount = [sexFilter, breedingStatus, coatType, color, dobFrom, dobTo, debouncedBreeder, debouncedOwner, healthMin, healthMax].filter(Boolean).length;

  // Auto-open filter panel if URL has active filters
  useEffect(() => {
    if (activeFilterCount > 0) setFiltersOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  const resetPage = useCallback(() => setPage(1), []);

  const { data, isLoading } = useDogs({
    page,
    search: debouncedSearch || undefined,
    sex: sexFilter || undefined,
    breedingStatus: breedingStatus || undefined,
    healthScoreMin: healthMin ? parseFloat(healthMin) : undefined,
    healthScoreMax: healthMax ? parseFloat(healthMax) : undefined,
    dobFrom: dobFrom || undefined,
    dobTo: dobTo || undefined,
    breeder: debouncedBreeder || undefined,
    owner: debouncedOwner || undefined,
    coatType: coatType || undefined,
    color: color || undefined,
    sortBy: sortKey,
    sortDir,
  });

  const { data: filterOptions } = useDogFilterOptions();

  const dogs = data?.data || [];
  const meta = data?.meta;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    resetPage();
  };

  const clearFilters = () => {
    setSexFilter("");
    setBreedingStatus("");
    setCoatType("");
    setColor("");
    setDobFrom("");
    setDobTo("");
    setBreederInput("");
    setDebouncedBreeder("");
    setOwnerInput("");
    setDebouncedOwner("");
    setHealthMin("");
    setHealthMax("");
    resetPage();
  };

  const hasAnyFilter = debouncedSearch || activeFilterCount > 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dog Registry</h1>
        <p className="text-gray-600 mt-1">Browse the complete dog registry</p>
      </div>

      {/* Search bar + Filters toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            resetPage();
          }}
          placeholder="Search by name..."
          className={`flex-1 ${INPUT_CLASS}`}
        />
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className={`px-4 py-2 border rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors ${
            filtersOpen
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-white text-gray-900 rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Expandable filter panel */}
      {filtersOpen && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Sex */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sex</label>
              <select
                value={sexFilter}
                onChange={(e) => { setSexFilter(e.target.value as "" | "male" | "female"); resetPage(); }}
                className={`w-full ${INPUT_CLASS}`}
              >
                <option value="">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            {/* Breeding Status */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Breeding Status</label>
              <select
                value={breedingStatus}
                onChange={(e) => { setBreedingStatus(e.target.value as BreedingStatus | ""); resetPage(); }}
                className={`w-full ${INPUT_CLASS}`}
              >
                <option value="">All</option>
                {filterOptions?.breeding_statuses.map((status) => (
                  <option key={status} value={status}>
                    {BREEDING_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            {/* Coat Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Coat Type</label>
              <select
                value={coatType}
                onChange={(e) => { setCoatType(e.target.value); resetPage(); }}
                className={`w-full ${INPUT_CLASS}`}
              >
                <option value="">All</option>
                {filterOptions?.coat_types.map((ct) => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>

            {/* Color */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Color</label>
              <select
                value={color}
                onChange={(e) => { setColor(e.target.value); resetPage(); }}
                className={`w-full ${INPUT_CLASS}`}
              >
                <option value="">All</option>
                {filterOptions?.colors.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* DOB From */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">DOB From</label>
              <input
                type="text"
                value={dobFrom}
                onChange={(e) => { setDobFrom(e.target.value); resetPage(); }}
                placeholder="YYYY-MM-DD"
                className={`w-full ${INPUT_CLASS}`}
              />
            </div>

            {/* DOB To */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">DOB To</label>
              <input
                type="text"
                value={dobTo}
                onChange={(e) => { setDobTo(e.target.value); resetPage(); }}
                placeholder="YYYY-MM-DD"
                className={`w-full ${INPUT_CLASS}`}
              />
            </div>

            {/* Breeder */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Breeder</label>
              <input
                type="text"
                value={breederInput}
                onChange={(e) => { setBreederInput(e.target.value); resetPage(); }}
                placeholder="Name or kennel..."
                className={`w-full ${INPUT_CLASS}`}
              />
            </div>

            {/* Owner */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
              <input
                type="text"
                value={ownerInput}
                onChange={(e) => { setOwnerInput(e.target.value); resetPage(); }}
                placeholder="Name or kennel..."
                className={`w-full ${INPUT_CLASS}`}
              />
            </div>

            {/* Health Score Range */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Health Score</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={healthMin}
                  onChange={(e) => { setHealthMin(e.target.value); resetPage(); }}
                  placeholder="Min"
                  className={`w-24 ${INPUT_CLASS}`}
                />
                <span className="text-gray-400">—</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={healthMax}
                  onChange={(e) => { setHealthMax(e.target.value); resetPage(); }}
                  placeholder="Max"
                  className={`w-24 ${INPUT_CLASS}`}
                />
              </div>
            </div>

            {/* Clear all */}
            <div className="flex items-end">
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-gray-500 hover:text-gray-900 underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : dogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">
            {hasAnyFilter
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
                  <SortHeader label="Sex" sortKey="sex" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortHeader label="DOB" sortKey="date_of_birth" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <th className="pb-3 font-medium text-left text-gray-500">Status</th>
                  <SortHeader label="Health" sortKey="health_score" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortHeader label="Breeder" sortKey="breeder" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dogs.map((dog: Dog) => {
                  const deceased = dog.is_deceased || !!dog.date_of_death;
                  const rowBg = deceased
                    ? "bg-gray-200 hover:bg-gray-300"
                    : dog.sex === "male"
                      ? "bg-blue-50 hover:bg-blue-100"
                      : dog.sex === "female"
                        ? "bg-pink-50 hover:bg-pink-100"
                        : "hover:bg-gray-50";

                  return (
                    <tr key={dog.id} className={rowBg}>
                      <td className="py-3 pl-4">
                        <Link
                          to={`/dogs/${dog.id}`}
                          className="text-gray-900 font-medium hover:underline"
                        >
                          {dog.registered_name}
                        </Link>
                      </td>
                      <td className="py-3 text-gray-600 capitalize hidden md:table-cell">{dog.sex || "—"}</td>
                      <td className="py-3 text-gray-600 hidden sm:table-cell">
                        {formatDate(dog.date_of_birth)}
                      </td>
                      <td className="py-3 text-gray-600">
                        {dog.breeding_status ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${BREEDING_STATUS_BADGE_CLASS[dog.breeding_status]}`}
                          >
                            {BREEDING_STATUS_LABELS[dog.breeding_status]}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-gray-600 hidden sm:table-cell">
                        {dog.health_rating ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${RATING_COLOR_MAP[dog.health_rating.color] || "bg-gray-400"}`} />
                            {Math.round(dog.health_rating.score)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-gray-600 hidden md:table-cell">{dog.breeder?.full_name || "—"}</td>
                    </tr>
                  );
                })}
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
