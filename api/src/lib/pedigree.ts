/**
 * Resolves a 3-generation pedigree tree into real dog IDs.
 * Creates historical stub dogs for new ancestors and fills gaps
 * on existing dogs' parent links.
 */

import { eq } from "drizzle-orm";
import { dogs } from "../db/schema.js";
import type { Database } from "../db/client.js";

type AncestorRef = string | { registered_name: string } | null | undefined;

export interface PedigreeTree {
  sire?: AncestorRef;
  dam?: AncestorRef;
  sire_sire?: AncestorRef;
  sire_dam?: AncestorRef;
  dam_sire?: AncestorRef;
  dam_dam?: AncestorRef;
  sire_sire_sire?: AncestorRef;
  sire_sire_dam?: AncestorRef;
  sire_dam_sire?: AncestorRef;
  sire_dam_dam?: AncestorRef;
  dam_sire_sire?: AncestorRef;
  dam_sire_dam?: AncestorRef;
  dam_dam_sire?: AncestorRef;
  dam_dam_dam?: AncestorRef;
}

interface ResolvedPedigree {
  sire_id: string | null;
  dam_id: string | null;
}

/**
 * Resolve a single ancestor ref to a dog ID.
 * - UUID string → return as-is, optionally fill null parent gaps on the existing dog
 * - { registered_name } → create a historical stub dog with the given parents
 * - null/undefined → return null
 */
async function resolveRef(
  db: Database,
  clubId: string,
  ref: AncestorRef,
  sex: "male" | "female",
  sireId: string | null,
  damId: string | null,
  submittedBy: string | null,
): Promise<string | null> {
  if (!ref) return null;

  if (typeof ref === "string") {
    // Existing dog — fill parent gaps if we have resolved children
    if (sireId !== null || damId !== null) {
      const existing = await db.query.dogs.findFirst({
        where: eq(dogs.id, ref),
        columns: { id: true, sire_id: true, dam_id: true },
      });
      if (existing) {
        const updates: Record<string, unknown> = {};
        if (existing.sire_id === null && sireId !== null) {
          updates.sire_id = sireId;
        }
        if (existing.dam_id === null && damId !== null) {
          updates.dam_id = damId;
        }
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          await db.update(dogs).set(updates).where(eq(dogs.id, ref));
        }
      }
    }
    return ref;
  }

  // New dog — create historical stub with parents already linked
  const [stub] = await db
    .insert(dogs)
    .values({
      registered_name: ref.registered_name,
      sex,
      club_id: clubId,
      status: "pending",
      owner_id: null,
      submitted_by: submittedBy,
      is_public: false,
      is_historical: true,
      sire_id: sireId,
      dam_id: damId,
    })
    .returning();
  return stub.id;
}

/**
 * Resolve a full 3-generation pedigree tree into dog IDs.
 * Works bottom-up: great-grandparents → grandparents → parents.
 * Returns { sire_id, dam_id } for the subject dog.
 */
export async function resolvePedigreeTree(
  db: Database,
  clubId: string,
  pedigree: PedigreeTree,
  submittedBy: string | null,
): Promise<ResolvedPedigree> {
  // Gen 3: Great-grandparents (leaf nodes, no children to link)
  const sss = await resolveRef(db, clubId, pedigree.sire_sire_sire, "male", null, null, submittedBy);
  const ssd = await resolveRef(db, clubId, pedigree.sire_sire_dam, "female", null, null, submittedBy);
  const sds = await resolveRef(db, clubId, pedigree.sire_dam_sire, "male", null, null, submittedBy);
  const sdd = await resolveRef(db, clubId, pedigree.sire_dam_dam, "female", null, null, submittedBy);
  const dss = await resolveRef(db, clubId, pedigree.dam_sire_sire, "male", null, null, submittedBy);
  const dsd = await resolveRef(db, clubId, pedigree.dam_sire_dam, "female", null, null, submittedBy);
  const dds = await resolveRef(db, clubId, pedigree.dam_dam_sire, "male", null, null, submittedBy);
  const ddd = await resolveRef(db, clubId, pedigree.dam_dam_dam, "female", null, null, submittedBy);

  // Gen 2: Grandparents (link to great-grandparents)
  const ss = await resolveRef(db, clubId, pedigree.sire_sire, "male", sss, ssd, submittedBy);
  const sd = await resolveRef(db, clubId, pedigree.sire_dam, "female", sds, sdd, submittedBy);
  const ds = await resolveRef(db, clubId, pedigree.dam_sire, "male", dss, dsd, submittedBy);
  const dd = await resolveRef(db, clubId, pedigree.dam_dam, "female", dds, ddd, submittedBy);

  // Gen 1: Parents (link to grandparents)
  const sire_id = await resolveRef(db, clubId, pedigree.sire, "male", ss, sd, submittedBy);
  const dam_id = await resolveRef(db, clubId, pedigree.dam, "female", ds, dd, submittedBy);

  return { sire_id, dam_id };
}
