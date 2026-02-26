/**
 * PedigreeChart component - horizontal column-based pedigree display.
 * Shows multi-generation ancestry tree with each generation as a column.
 * Gen 0 (subject) on the left, ancestors expanding to the right.
 */

import { Link } from "react-router-dom";

interface PedigreeDog {
  id: string;
  registered_name: string;
  call_name?: string;
  sex: "male" | "female";
  date_of_birth?: string;
  sire_id?: string;
  dam_id?: string;
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

function PedigreeCell({
  dog,
  generation,
}: {
  dog: PedigreeDog | null;
  generation: number;
}) {
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

  return (
    <Link
      to={`/dogs/${dog.id}`}
      className={`block mx-0.5 my-px px-1.5 py-1 border rounded hover:shadow-md transition-shadow ${bgColor} min-h-0`}
      title={dog.registered_name}
    >
      <div className={`font-semibold text-gray-900 truncate ${fontSize}`}>
        {dog.registered_name}
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
    </Link>
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
