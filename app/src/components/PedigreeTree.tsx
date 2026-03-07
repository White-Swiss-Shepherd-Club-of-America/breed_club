/**
 * PedigreeChart component - horizontal column-based pedigree display.
 * Shows multi-generation ancestry tree with each generation as a column.
 * Gen 0 (subject) on the left, ancestors expanding to the right.
 * Includes health score icons and a context menu on click.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ratingToHex, RATING_COLORS, RATING_LABELS, type HealthRatingColor } from "@/lib/health-colors";
import type { HealthRating } from "@breed-club/shared";

interface PedigreeDog {
  id: string;
  registered_name: string;
  call_name?: string;
  sex: "male" | "female";
  date_of_birth?: string;
  sire_id?: string;
  dam_id?: string;
  health_rating?: HealthRating | null;
  sire?: PedigreeDog | null;
  dam?: PedigreeDog | null;
}

interface PedigreeData {
  dog: {
    id: string;
    registered_name: string;
    call_name?: string;
    sex: "male" | "female";
    date_of_birth?: string;
    health_rating?: HealthRating | null;
  };
  sire: PedigreeDog | null;
  dam: PedigreeDog | null;
}

interface PedigreeTreeProps {
  pedigree: PedigreeData;
  depth?: number;
}

const GENERATION_LABELS = [
  "Subject",
  "Parents",
  "Grandparents",
  "Great-Grandparents",
  "Gen 4",
  "Gen 5",
  "Gen 6",
];

/**
 * Flatten nested pedigree data into a 2D array.
 * Each generation[i] has 2^i entries.
 * For each parent pair, sire is always at even index, dam at odd index.
 */
function flattenPedigree(
  pedigree: PedigreeData,
  maxDepth: number
): (PedigreeDog | null)[][] {
  // Gen 0: the subject dog
  const subjectDog: PedigreeDog = {
    ...pedigree.dog,
    sire: pedigree.sire,
    dam: pedigree.dam,
  };
  const generations: (PedigreeDog | null)[][] = [[subjectDog]];

  for (let gen = 1; gen <= maxDepth; gen++) {
    const prevGen = generations[gen - 1];
    const thisGen: (PedigreeDog | null)[] = [];

    for (const parent of prevGen) {
      thisGen.push(parent?.sire || null);
      thisGen.push(parent?.dam || null);
    }

    generations.push(thisGen);
  }

  return generations;
}

// ─── Health Summary Popup ────────────────────────────────────────────────────

function HealthSummaryPopup({ rating, onClose }: { rating: HealthRating; onClose: () => void }) {
  const categories = rating.category_scores ? Object.entries(rating.category_scores) : [];

  return (
    <div className="absolute z-50 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl p-3 min-w-[200px] max-w-[280px]">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold"
          style={{ backgroundColor: ratingToHex(rating) }}
        >
          {rating.score}
        </span>
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {RATING_LABELS[rating.color as HealthRatingColor] || rating.color}
          </div>
          <div className="text-[10px] text-gray-500">
            {rating.saturation}% tested
            {rating.cert_version_name && ` \u00b7 ${rating.cert_version_name}`}
          </div>
        </div>
      </div>
      {categories.length > 0 && (
        <div className="space-y-1 border-t border-gray-100 pt-2">
          {categories.map(([cat, data]) => (
            <div key={cat} className="flex items-center justify-between text-xs">
              <span className="text-gray-600 capitalize">{cat}</span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: RATING_COLORS[data.color as HealthRatingColor] || RATING_COLORS.gray }}
                />
                <span className="font-medium">{data.score}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="mt-2 text-[10px] text-gray-400 hover:text-gray-600"
      >
        Close
      </button>
    </div>
  );
}

// ─── Context Menu ────────────────────────────────────────────────────────────

function PedigreeCellMenu({
  dog,
  onClose,
}: {
  dog: PedigreeDog;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [showHealth, setShowHealth] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  if (showHealth && dog.health_rating) {
    return (
      <div ref={menuRef}>
        <HealthSummaryPopup
          rating={dog.health_rating}
          onClose={() => setShowHealth(false)}
        />
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="absolute z-50 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl py-1 min-w-[140px]"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/dogs/${dog.id}`);
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
      >
        View Dog Details
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (dog.health_rating) {
            setShowHealth(true);
          }
        }}
        disabled={!dog.health_rating}
        className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        Health Summary
      </button>
    </div>
  );
}

// ─── Pedigree Cell ───────────────────────────────────────────────────────────

function PedigreeCell({
  dog,
  generation,
}: {
  dog: PedigreeDog | null;
  generation: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!dog) {
    return (
      <div className="mx-0.5 my-px px-1.5 py-1 text-xs text-gray-400 italic border border-dashed border-gray-200 rounded bg-gray-50 text-center flex items-center justify-center min-h-0">
        Unknown
      </div>
    );
  }

  const bgColor =
    dog.sex === "male"
      ? "bg-blue-50 border-blue-200"
      : "bg-pink-50 border-pink-200";

  const fontSize =
    generation >= 5
      ? "text-[9px] leading-tight"
      : generation >= 4
        ? "text-[10px] leading-tight"
        : generation >= 3
          ? "text-xs"
          : "text-sm";

  const healthColor = ratingToHex(dog.health_rating);
  const showScore = generation < 5;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className={`block w-full text-left mx-0.5 my-px px-1.5 py-1 border rounded hover:shadow-md transition-shadow ${bgColor} min-h-0 cursor-pointer`}
        title={dog.registered_name}
      >
        <div className="flex items-center gap-1">
          <div className={`font-semibold text-gray-900 truncate flex-1 ${fontSize}`}>
            {dog.registered_name}
          </div>
          {/* Health dot */}
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/60"
            style={{ backgroundColor: healthColor }}
            title={dog.health_rating ? `Score: ${dog.health_rating.score}` : "Not rated"}
          />
        </div>
        {generation < 4 && dog.call_name && (
          <div className="text-[10px] text-gray-600 truncate">
            &ldquo;{dog.call_name}&rdquo;
          </div>
        )}
        {dog.date_of_birth && (
          <div className="text-[10px] text-gray-500">
            {new Date(dog.date_of_birth).getFullYear()}
          </div>
        )}
      </button>
      {menuOpen && (
        <PedigreeCellMenu
          dog={dog}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

export function PedigreeTree({ pedigree, depth = 3 }: PedigreeTreeProps) {
  const generations = flattenPedigree(pedigree, depth);

  // Column width shrinks at deeper generations
  const getColumnWidth = (gen: number): number => {
    if (gen === 0) return 200;
    if (depth <= 4) return 170;
    if (depth === 5) return 150;
    return 140; // depth 6
  };

  const totalWidth = generations.reduce(
    (sum, _, i) => sum + getColumnWidth(i) + 8,
    0
  );

  return (
    <div className="overflow-x-auto pb-4">
      <div
        className="flex items-stretch gap-2"
        style={{ minWidth: `${totalWidth}px` }}
      >
        {generations.map((gen, genIdx) => (
          <div
            key={genIdx}
            className="flex flex-col flex-shrink-0"
            style={{ width: getColumnWidth(genIdx) }}
          >
            {/* Column header */}
            <div className="text-[10px] text-gray-400 font-medium text-center mb-1 uppercase tracking-wide">
              {GENERATION_LABELS[genIdx] || `Gen ${genIdx}`}
            </div>

            {/* Cells - evenly distributed vertically */}
            <div className="flex flex-col justify-around flex-1 gap-px">
              {gen.map((dog, idx) => (
                <PedigreeCell key={idx} dog={dog} generation={genIdx} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
