/**
 * PedigreeTree component - visual pedigree display.
 * Shows multi-generation ancestry tree for a dog.
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

function DogNode({ dog, generation }: { dog: PedigreeDog | null; generation: number }) {
  if (!dog) {
    return (
      <div className="text-xs text-gray-400 italic p-2 border border-gray-200 rounded bg-gray-50">
        Unknown
      </div>
    );
  }

  const bgColor = dog.sex === "male" ? "bg-blue-50 border-blue-200" : "bg-pink-50 border-pink-200";

  return (
    <Link
      to={`/dogs/${dog.id}`}
      className={`block p-2 border rounded hover:shadow-md transition-shadow ${bgColor}`}
    >
      <div className="text-sm font-semibold text-gray-900 truncate">{dog.registered_name}</div>
      {dog.call_name && <div className="text-xs text-gray-600 truncate">"{dog.call_name}"</div>}
      {dog.date_of_birth && (
        <div className="text-xs text-gray-500 mt-1">
          {new Date(dog.date_of_birth).getFullYear()}
        </div>
      )}
    </Link>
  );
}

function Generation({
  ancestors,
  generation,
}: {
  ancestors: (PedigreeDog | null)[];
  generation: number;
}) {
  if (ancestors.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 min-w-[160px]">
      {ancestors.map((dog, idx) => (
        <DogNode key={idx} dog={dog} generation={generation} />
      ))}
    </div>
  );
}

/**
 * Build flat list of ancestors for each generation.
 */
function buildGenerations(pedigree: PedigreeData, maxDepth: number = 3) {
  const generations: (PedigreeDog | null)[][] = [];

  const traverse = (dog: PedigreeDog | null, depth: number) => {
    if (depth > maxDepth || !dog) {
      return;
    }

    if (!generations[depth]) {
      generations[depth] = [];
    }

    if (depth === 0) {
      generations[depth].push(dog);
    } else {
      traverse(dog.sire || null, depth + 1);
      traverse(dog.dam || null, depth + 1);
    }
  };

  // Start with sire line
  if (pedigree.sire) {
    traverse(pedigree.sire, 1);
  } else {
    if (!generations[1]) generations[1] = [];
    generations[1].push(null);
  }

  // Then dam line
  if (pedigree.dam) {
    traverse(pedigree.dam, 1);
  } else {
    if (!generations[1]) generations[1] = [];
    generations[1].push(null);
  }

  return generations;
}

/**
 * Recursively render pedigree tree using a tree structure.
 */
function TreeNode({ dog, depth, maxDepth }: { dog: PedigreeDog | null; depth: number; maxDepth: number }) {
  if (depth > maxDepth) return null;

  const hasSire = dog?.sire;
  const hasDam = dog?.dam;

  return (
    <div className="flex items-center gap-2">
      <DogNode dog={dog} generation={depth} />
      {depth < maxDepth && (hasSire || hasDam) && (
        <div className="relative flex flex-col gap-4">
          {/* Connecting line */}
          <div className="absolute left-0 top-1/2 w-4 h-px bg-gray-300 -translate-y-1/2"></div>

          {/* Sire branch */}
          <div className="pl-4 border-l-2 border-gray-300">
            <TreeNode dog={dog?.sire || null} depth={depth + 1} maxDepth={maxDepth} />
          </div>

          {/* Dam branch */}
          <div className="pl-4 border-l-2 border-gray-300">
            <TreeNode dog={dog?.dam || null} depth={depth + 1} maxDepth={maxDepth} />
          </div>
        </div>
      )}
    </div>
  );
}

export function PedigreeTree({ pedigree, depth = 3 }: PedigreeTreeProps) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="inline-block min-w-full">
        <div className="mb-6 p-4 border-2 border-gray-900 rounded-lg bg-white">
          <div className="text-lg font-bold text-gray-900">{pedigree.dog.registered_name}</div>
          {pedigree.dog.call_name && (
            <div className="text-sm text-gray-600">"{pedigree.dog.call_name}"</div>
          )}
          {pedigree.dog.date_of_birth && (
            <div className="text-sm text-gray-500 mt-1">
              Born {new Date(pedigree.dog.date_of_birth).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="flex items-start gap-6">
          <div className="flex flex-col gap-4">
            <div className="text-xs font-medium text-gray-500 uppercase mb-2">Sire Line</div>
            <TreeNode
              dog={pedigree.sire}
              depth={1}
              maxDepth={depth}
            />
          </div>

          <div className="flex flex-col gap-4">
            <div className="text-xs font-medium text-gray-500 uppercase mb-2">Dam Line</div>
            <TreeNode
              dog={pedigree.dam}
              depth={1}
              maxDepth={depth}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
