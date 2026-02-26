/**
 * Interactive 3-generation pedigree editor.
 * Renders a horizontal tree of 14 ancestor slots (2 parents + 4 grandparents + 8 great-grandparents).
 * Selecting an existing dog auto-fills its known ancestors (locked). Clearing cascades to descendants.
 */

import { useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DogTypeahead, type ParentRef } from "./DogTypeahead";
import { api } from "@/lib/api";

// --- Types ---

export interface PedigreeSlotData {
  /** UUID for existing dog, { registered_name } for new, undefined for empty */
  ref: ParentRef;
  /** Display name for the slot */
  displayName: string;
  /** True if auto-populated from an ancestor's pedigree (locked/read-only) */
  isFromAncestor: boolean;
  /** Expected sex for this position */
  sex: "male" | "female";
}

interface PedigreeDogData {
  id: string;
  registered_name: string;
  call_name?: string;
  sex?: string;
  date_of_birth?: string;
  sire_id?: string;
  dam_id?: string;
  sire?: PedigreeDogData | null;
  dam?: PedigreeDogData | null;
}

interface PedigreeEditorProps {
  slots: PedigreeSlotData[];
  onChange: (slots: PedigreeSlotData[]) => void;
  excludeId?: string;
}

// --- Slot indexing ---
// Flat array of 14: even = sire positions, odd = dam positions
// Parent at index i has sire-child at 2i+2, dam-child at 2i+3
// Gen 1 (parents): 0-1, Gen 2 (grandparents): 2-5, Gen 3 (great-grandparents): 6-13

const SLOT_LABELS: string[] = [
  "Sire",                        // 0
  "Dam",                         // 1
  "Sire's Sire",                 // 2
  "Sire's Dam",                  // 3
  "Dam's Sire",                  // 4
  "Dam's Dam",                   // 5
  "S.S. Sire",                   // 6
  "S.S. Dam",                    // 7
  "S.D. Sire",                   // 8
  "S.D. Dam",                    // 9
  "D.S. Sire",                   // 10
  "D.S. Dam",                    // 11
  "D.D. Sire",                   // 12
  "D.D. Dam",                    // 13
];

const GEN_LABELS = ["Parents", "Grandparents", "Great-Grandparents"];

/**
 * Returns the index of the parent slot for slot i, or null if i is a Gen 1 slot.
 * Gen 2 (indices 2-5): parent is a Gen 1 slot (0 or 1)
 * Gen 3 (indices 6-13): parent is a Gen 2 slot (2-5)
 */
function getParentSlotIndex(i: number): number | null {
  if (i < 2) return null;                          // Gen 1 — always enabled
  if (i < 6) return Math.floor((i - 2) / 2);      // Gen 2 → Gen 1 parent
  return Math.floor((i - 6) / 2) + 2;             // Gen 3 → Gen 2 parent
}

// --- Helper functions ---

export function createEmptySlots(): PedigreeSlotData[] {
  return Array.from({ length: 14 }, (_, i) => ({
    ref: undefined,
    displayName: "",
    isFromAncestor: false,
    sex: (i % 2 === 0 ? "male" : "female") as "male" | "female",
  }));
}

/** Convert flat slots array to the API pedigree tree object. */
export function slotsToTree(slots: PedigreeSlotData[]) {
  const hasAny = slots.some((s) => s.ref !== undefined);
  if (!hasAny) return undefined;

  const ref = (i: number) => slots[i].ref ?? null;

  return {
    sire: ref(0),
    dam: ref(1),
    sire_sire: ref(2),
    sire_dam: ref(3),
    dam_sire: ref(4),
    dam_dam: ref(5),
    sire_sire_sire: ref(6),
    sire_sire_dam: ref(7),
    sire_dam_sire: ref(8),
    sire_dam_dam: ref(9),
    dam_sire_sire: ref(10),
    dam_sire_dam: ref(11),
    dam_dam_sire: ref(12),
    dam_dam_dam: ref(13),
  };
}

/** Convert API pedigree response to flat slots array. */
export function pedigreeToSlots(pedigree: {
  dog: PedigreeDogData;
  sire: PedigreeDogData | null;
  dam: PedigreeDogData | null;
}): PedigreeSlotData[] {
  const slots = createEmptySlots();

  function populate(dog: PedigreeDogData | null | undefined, index: number) {
    if (!dog || index >= 14) return;
    slots[index] = {
      ref: dog.id,
      displayName: dog.registered_name,
      isFromAncestor: false,
      sex: (index % 2 === 0 ? "male" : "female") as "male" | "female",
    };
    populate(dog.sire, 2 * index + 2);
    populate(dog.dam, 2 * index + 3);
  }

  populate(pedigree.sire, 0);
  populate(pedigree.dam, 1);

  return slots;
}

/** Recursively clear a slot and all its descendants. */
function clearSlotAndDescendants(slots: PedigreeSlotData[], index: number) {
  slots[index] = {
    ref: undefined,
    displayName: "",
    isFromAncestor: false,
    sex: slots[index].sex,
  };
  const sireChild = 2 * index + 2;
  const damChild = 2 * index + 3;
  if (sireChild < 14) clearSlotAndDescendants(slots, sireChild);
  if (damChild < 14) clearSlotAndDescendants(slots, damChild);
}

/** Populate descendant slots from fetched pedigree data. */
function populateDescendants(
  slots: PedigreeSlotData[],
  parentIndex: number,
  dog: PedigreeDogData,
) {
  const sireChild = 2 * parentIndex + 2;
  const damChild = 2 * parentIndex + 3;

  if (dog.sire && sireChild < 14) {
    slots[sireChild] = {
      ref: dog.sire.id,
      displayName: dog.sire.registered_name,
      isFromAncestor: true,
      sex: "male",
    };
    populateDescendants(slots, sireChild, dog.sire);
  }

  if (dog.dam && damChild < 14) {
    slots[damChild] = {
      ref: dog.dam.id,
      displayName: dog.dam.registered_name,
      isFromAncestor: true,
      sex: "female",
    };
    populateDescendants(slots, damChild, dog.dam);
  }
}

// --- Component ---

function PedigreeSlotCell({
  slot,
  slotIndex,
  label,
  onSelect,
  onClear,
  excludeId,
  loading,
  disabled,
}: {
  slot: PedigreeSlotData;
  slotIndex: number;
  label: string;
  onSelect: (ref: ParentRef, dogId?: string) => void;
  onClear: () => void;
  excludeId?: string;
  loading: boolean;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const isEmpty = slot.ref === undefined;
  const isNew = slot.ref && typeof slot.ref === "object";
  const bgColor = slot.sex === "male" ? "bg-blue-50 border-blue-200" : "bg-pink-50 border-pink-200";
  const lockedBg = slot.sex === "male" ? "bg-blue-50/60 border-blue-200" : "bg-pink-50/60 border-pink-200";

  if (loading) {
    return (
      <div className="px-2 py-1.5 border border-dashed border-gray-300 rounded bg-gray-50 text-center min-h-[40px] flex items-center justify-center">
        <div className="text-xs text-gray-400 animate-pulse">Loading...</div>
      </div>
    );
  }

  // Disabled — parent slot is empty, must fill parent first
  if (disabled) {
    return (
      <div
        className="px-2 py-1.5 border border-dashed border-gray-200 rounded bg-gray-50/50 min-h-[40px] flex items-center justify-center"
        title="Fill in the parent slot first"
      >
        <div className="text-[10px] text-gray-300 select-none">{label}</div>
      </div>
    );
  }

  // Locked (auto-populated from ancestor)
  if (slot.isFromAncestor && !isEmpty) {
    return (
      <div className={`px-2 py-1.5 border rounded ${lockedBg} min-h-[40px]`}>
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-xs font-medium text-gray-700 truncate" title={slot.displayName}>
            {slot.displayName}
          </span>
        </div>
      </div>
    );
  }

  // Filled (user-selected)
  if (!isEmpty && !editing) {
    return (
      <div className={`px-2 py-1.5 border rounded ${bgColor} min-h-[40px]`}>
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium text-gray-900 truncate" title={slot.displayName}>
            {slot.displayName}
            {isNew && (
              <span className="ml-1 text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded">
                new
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            title="Clear"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Empty or editing
  if (editing) {
    return (
      <div className="min-h-[40px]">
        <DogTypeahead
          value={slot.ref}
          onChange={(ref) => {
            if (ref) {
              const dogId = typeof ref === "string" ? ref : undefined;
              onSelect(ref, dogId);
            } else {
              onClear();
            }
            setEditing(false);
          }}
          label={label}
          excludeId={excludeId}
          sex={slot.sex}
          compact
        />
      </div>
    );
  }

  // Empty — show prompt
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full px-2 py-1.5 border border-dashed border-gray-300 rounded bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-colors min-h-[40px] text-center"
    >
      <div className="text-[10px] text-gray-400">{label}</div>
    </button>
  );
}

export function PedigreeEditor({ slots, onChange, excludeId }: PedigreeEditorProps) {
  const { getToken } = useAuth();
  const [loadingSlots, setLoadingSlots] = useState<Set<number>>(new Set());

  const handleSelect = useCallback(
    async (slotIndex: number, ref: ParentRef, dogId?: string) => {
      const newSlots = [...slots];
      const displayName =
        typeof ref === "string"
          ? "" // Will be resolved from search results
          : typeof ref === "object" && ref
            ? ref.registered_name
            : "";

      newSlots[slotIndex] = {
        ref,
        displayName,
        isFromAncestor: false,
        sex: slots[slotIndex].sex,
      };

      // Clear descendants first (in case user is replacing)
      const sireChild = 2 * slotIndex + 2;
      const damChild = 2 * slotIndex + 3;
      if (sireChild < 14) clearSlotAndDescendants(newSlots, sireChild);
      if (damChild < 14) clearSlotAndDescendants(newSlots, damChild);

      onChange(newSlots);

      // If existing dog selected, fetch its pedigree to auto-populate descendants
      if (dogId && typeof ref === "string") {
        const generation = slotIndex < 2 ? 1 : slotIndex < 6 ? 2 : 3;
        const remainingDepth = 3 - generation;

        if (remainingDepth > 0) {
          // Mark descendant slots as loading
          const loadingSet = new Set<number>();
          function markLoading(idx: number, depth: number) {
            if (depth <= 0 || idx >= 14) return;
            const sc = 2 * idx + 2;
            const dc = 2 * idx + 3;
            if (sc < 14) { loadingSet.add(sc); markLoading(sc, depth - 1); }
            if (dc < 14) { loadingSet.add(dc); markLoading(dc, depth - 1); }
          }
          markLoading(slotIndex, remainingDepth);
          setLoadingSlots(loadingSet);

          try {
            const token = await getToken();
            const result = await api.get<{
              pedigree: { dog: PedigreeDogData; sire: PedigreeDogData | null; dam: PedigreeDogData | null };
            }>(`/dogs/${dogId}/pedigree`, {
              token,
              params: { depth: remainingDepth },
            });

            const updatedSlots = [...newSlots];
            // Update the display name for the selected dog
            updatedSlots[slotIndex] = {
              ...updatedSlots[slotIndex],
              displayName: result.pedigree.dog.registered_name,
            };

            // Build a pseudo-dog with sire/dam from the pedigree response
            const dogData: PedigreeDogData = {
              id: dogId,
              registered_name: result.pedigree.dog.registered_name,
              sire: result.pedigree.sire,
              dam: result.pedigree.dam,
            };
            populateDescendants(updatedSlots, slotIndex, dogData);

            onChange(updatedSlots);
          } catch {
            // If fetch fails, just keep the selected dog without auto-populating
            // Update display name from the basic info we have
          }

          setLoadingSlots(new Set());
        } else {
          // Leaf node — just update display name
          try {
            const token = await getToken();
            const result = await api.get<{
              pedigree: { dog: PedigreeDogData; sire: PedigreeDogData | null; dam: PedigreeDogData | null };
            }>(`/dogs/${dogId}/pedigree`, {
              token,
              params: { depth: 0 },
            });
            const updatedSlots = [...slots];
            updatedSlots[slotIndex] = {
              ...newSlots[slotIndex],
              displayName: result.pedigree.dog.registered_name,
            };
            onChange(updatedSlots);
          } catch {
            // Display name stays empty, will use the ID
          }
        }
      }
    },
    [slots, onChange, getToken],
  );

  const handleClear = useCallback(
    (slotIndex: number) => {
      const newSlots = [...slots];
      clearSlotAndDescendants(newSlots, slotIndex);
      onChange(newSlots);
    },
    [slots, onChange],
  );

  // Group slots by generation
  const generations = [
    { label: GEN_LABELS[0], indices: [0, 1] },
    { label: GEN_LABELS[1], indices: [2, 3, 4, 5] },
    { label: GEN_LABELS[2], indices: [6, 7, 8, 9, 10, 11, 12, 13] },
  ];

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-2 min-w-[600px]">
        {generations.map((gen, genIdx) => (
          <div
            key={genIdx}
            className="flex flex-col flex-shrink-0"
            style={{ width: genIdx === 0 ? 180 : genIdx === 1 ? 170 : 160 }}
          >
            <div className="text-[10px] text-gray-400 font-medium text-center mb-1 uppercase tracking-wide">
              {gen.label}
            </div>
            <div className="flex flex-col justify-around flex-1 gap-1">
              {gen.indices.map((slotIdx) => {
                const parentIdx = getParentSlotIndex(slotIdx);
                const isDisabled = parentIdx !== null && slots[parentIdx].ref === undefined;
                return (
                  <PedigreeSlotCell
                    key={slotIdx}
                    slot={slots[slotIdx]}
                    slotIndex={slotIdx}
                    label={SLOT_LABELS[slotIdx]}
                    onSelect={(ref, dogId) => handleSelect(slotIdx, ref, dogId)}
                    onClear={() => handleClear(slotIdx)}
                    excludeId={excludeId}
                    loading={loadingSlots.has(slotIdx)}
                    disabled={isDisabled}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
