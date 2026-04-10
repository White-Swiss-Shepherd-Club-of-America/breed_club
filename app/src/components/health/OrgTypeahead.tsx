import { useState } from "react";
import type { GradingOrg } from "./ResultForms";

interface OrgTypeaheadProps {
  organizations: GradingOrg[];
  value: GradingOrg | null;
  onChange: (org: GradingOrg | null) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function OrgTypeahead({
  organizations,
  value,
  onChange,
  isLoading = false,
  placeholder = "Search labs/organizations...",
}: OrgTypeaheadProps) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = search
    ? organizations.filter((org) =>
        org.name.toLowerCase().includes(search.toLowerCase())
      )
    : organizations;

  const displayValue = search || value?.name || "";

  const showList = showDropdown && (!value || search);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Lab / Organization *
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={displayValue}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
              if (!e.target.value) {
                onChange(null);
              }
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              setTimeout(() => setShowDropdown(false), 200);
            }}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setSearch("");
            }}
            className="px-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {showList && (
        <div className="mt-1 w-full bg-white border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-500">Loading labs...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              {search ? `No results for "${search}"` : "No labs available for this category"}
            </div>
          ) : (
            filtered.map((org) => (
              <button
                type="button"
                key={org.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(org);
                  setSearch("");
                  setShowDropdown(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 text-sm border-b border-gray-100 last:border-0"
              >
                <div className="font-medium">{org.name}</div>
                {org.country && (
                  <span className="text-xs text-gray-500">{org.country}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
