/**
 * Shared DogTypeahead component for searching and selecting dogs.
 * Used in pedigree editor, dog create/edit forms, etc.
 */

import { useState } from "react";
import { useDogs } from "@/hooks/useDogs";

export type ParentRef = string | { registered_name: string } | undefined;

interface DogTypeaheadProps {
  value?: ParentRef;
  onChange: (ref: ParentRef) => void;
  label: string;
  excludeId?: string;
  sex?: "male" | "female";
  initialLabel?: string;
  disabled?: boolean;
  /** Smaller text/padding for use inside pedigree cells */
  compact?: boolean;
  /** Called when an existing dog (UUID) is selected */
  onExistingDogSelected?: (dogId: string) => void;
}

export function DogTypeahead({
  value,
  onChange,
  label,
  excludeId,
  sex,
  initialLabel,
  disabled,
  compact,
  onExistingDogSelected,
}: DogTypeaheadProps) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSelected, setHasSelected] = useState(!!value);
  const { data: dogsData } = useDogs(1, search, sex, undefined, true);
  const dogs = dogsData?.data || [];

  const selectedId = typeof value === "string" ? value : undefined;
  const newName = value && typeof value === "object" ? value.registered_name : undefined;
  const selectedDog = selectedId ? dogs.find((d) => d.id === selectedId) : undefined;

  const filteredDogs = dogs.filter((dog) => dog.id !== excludeId);
  const showCreateNew =
    search.length >= 2 &&
    !filteredDogs.some((d) => d.registered_name.toLowerCase() === search.toLowerCase());

  const displayValue =
    search || selectedDog?.registered_name || newName || (hasSelected ? initialLabel : "") || "";

  const inputClass = compact
    ? "w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-gray-900 focus:border-transparent"
    : "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent";

  return (
    <div className="relative">
      {!compact && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} <span className="text-gray-400">(optional)</span>
        </label>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={displayValue}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
              if (!e.target.value) {
                onChange(undefined);
                setHasSelected(false);
              }
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              // Delay hide so click on dropdown items registers
              setTimeout(() => setShowDropdown(false), 200);
            }}
            placeholder={compact ? "Search..." : "Search by registered name..."}
            disabled={disabled}
            className={inputClass}
          />
          {newName && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
              new
            </span>
          )}
        </div>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setSearch("");
              setHasSelected(false);
            }}
            className="px-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>
      {showDropdown && search && (filteredDogs.length > 0 || showCreateNew) && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredDogs.map((dog) => (
            <button
              type="button"
              key={dog.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(dog.id);
                setSearch("");
                setShowDropdown(false);
                setHasSelected(true);
                onExistingDogSelected?.(dog.id);
              }}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100"
            >
              <div className="font-medium">
                {dog.registered_name}
                {dog.is_historical && (
                  <span className="ml-1 text-xs text-blue-600">(historical)</span>
                )}
              </div>
              {dog.call_name && (
                <div className="text-sm text-gray-600">{dog.call_name}</div>
              )}
            </button>
          ))}
          {showCreateNew && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ registered_name: search });
                setSearch("");
                setShowDropdown(false);
                setHasSelected(true);
              }}
              className="w-full px-3 py-2 text-left hover:bg-yellow-50 focus:bg-yellow-50 border-t border-gray-200"
            >
              <div className="font-medium text-yellow-700">
                + Create "{search}" as new {label.toLowerCase()}
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
