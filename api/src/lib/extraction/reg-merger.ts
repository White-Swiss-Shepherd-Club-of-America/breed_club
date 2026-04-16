/**
 * Multi-document merger — combines extractions from multiple registration
 * documents into a unified set of suggested fields, detects conflicts,
 * and matches registries to existing organizations.
 */

import { eq, and, ilike } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { organizations } from "../../db/schema.js";
import type { RegExtractionResult, RegVerificationFlag } from "./reg-types.js";
import type {
  RegDocExtraction,
  RegConflict,
  MergedRegistration,
  SuggestedDogFields,
  ExtractedPedigree,
  RegistrationExtractionResponse,
} from "@breed-club/shared";

// ─── Organization Matching ──────────────────────────────────────────────────

interface OrgMatch {
  organization_id: string | null;
  organization_name: string;
  organization_abbreviation: string;
  organization_country: string;
}

/**
 * Try to match an extracted registry to an existing organization in the DB.
 * Falls back to returning null org ID (caller should auto-create).
 */
async function matchOrganization(
  db: Database,
  clubId: string,
  abbreviation: string,
  name: string,
  country: string
): Promise<OrgMatch> {
  // Try exact abbreviation match first (case-insensitive)
  const [byAbbrev] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      and(
        eq(organizations.club_id, clubId),
        ilike(organizations.name, `%${abbreviation}%`),
        eq(organizations.type, "kennel_club")
      )
    )
    .limit(1);

  if (byAbbrev) {
    return {
      organization_id: byAbbrev.id,
      organization_name: name,
      organization_abbreviation: abbreviation,
      organization_country: country,
    };
  }

  // Try full name match
  const [byName] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      and(
        eq(organizations.club_id, clubId),
        ilike(organizations.name, `%${name}%`),
        eq(organizations.type, "kennel_club")
      )
    )
    .limit(1);

  if (byName) {
    return {
      organization_id: byName.id,
      organization_name: name,
      organization_abbreviation: abbreviation,
      organization_country: country,
    };
  }

  // No match — will need auto-creation
  return {
    organization_id: null,
    organization_name: name,
    organization_abbreviation: abbreviation,
    organization_country: country,
  };
}

// ─── Conflict Detection ─────────────────────────────────────────────────────

/**
 * Detect conflicts on a specific field across extractions.
 * Only creates a conflict if there are 2+ distinct non-null values.
 */
function detectConflict(
  field: string,
  values: { value: string | null; documentIndex: number; registry: string }[],
  normalize: (v: string) => string = (v) => v.toLowerCase().trim()
): RegConflict | null {
  const nonNull = values.filter((v) => v.value != null) as {
    value: string;
    documentIndex: number;
    registry: string;
  }[];

  if (nonNull.length < 2) return null;

  const uniqueNormalized = new Set(nonNull.map((v) => normalize(v.value)));
  if (uniqueNormalized.size <= 1) return null;

  return {
    field,
    values: nonNull.map((v) => ({
      value: v.value,
      source_document: v.documentIndex,
      registry: v.registry,
    })),
  };
}

// ─── Merge Logic ────────────────────────────────────────────────────────────

/**
 * Pick the "best" non-null value for a field across extractions.
 * Prefers higher confidence, breaks ties by preferring earlier documents.
 */
function pickBestValue(
  extractions: RegExtractionResult[],
  field: keyof RegExtractionResult,
  confField?: string
): string | null {
  let bestVal: string | null = null;
  let bestConf = -1;

  for (const ext of extractions) {
    const val = ext[field] as string | null;
    if (!val) continue;

    const conf = confField ? (ext.field_confidences[confField] ?? 0.5) : 0.5;
    if (conf > bestConf) {
      bestConf = conf;
      bestVal = val;
    }
  }

  return bestVal;
}

/**
 * Pick the deepest pedigree tree across extractions.
 */
function pickBestPedigree(
  extractions: RegExtractionResult[]
): ExtractedPedigree | null {
  let best: ExtractedPedigree | null = null;
  let bestDepth = 0;

  for (const ext of extractions) {
    if (!ext.pedigree) continue;
    const depth = countPedigreeSlots(ext.pedigree);
    if (depth > bestDepth) {
      bestDepth = depth;
      best = ext.pedigree;
    }
  }

  return best;
}

function countPedigreeSlots(pedigree: ExtractedPedigree): number {
  const slots = [
    "sire", "dam",
    "sire_sire", "sire_dam", "dam_sire", "dam_dam",
    "sire_sire_sire", "sire_sire_dam", "sire_dam_sire", "sire_dam_dam",
    "dam_sire_sire", "dam_sire_dam", "dam_dam_sire", "dam_dam_dam",
  ] as const;

  let count = 0;
  for (const slot of slots) {
    if (pedigree[slot]) count++;
  }
  return count;
}

// ─── Main Merge Function ────────────────────────────────────────────────────

/**
 * Merge multiple extraction results into a unified response.
 *
 * @param extractions - Per-document extraction results
 * @param perDocFlags - Per-document verification flags
 * @param crossFlags - Cross-document verification flags
 * @param db - Database connection (for organization matching)
 * @param clubId - Club ID for organization matching
 * @param certificateUrls - R2 keys for stored original files
 */
export async function mergeRegExtractions(
  extractions: RegExtractionResult[],
  perDocFlags: RegVerificationFlag[][],
  crossFlags: RegVerificationFlag[],
  db: Database,
  clubId: string,
  certificateUrls: string[]
): Promise<RegistrationExtractionResponse> {
  if (extractions.length === 0) {
    return {
      documents: [],
      suggested: {
        registered_name: "",
        date_of_birth: null,
        sex: null,
        color: null,
        microchip_number: null,
        sire_name: null,
        sire_registration_number: null,
        dam_name: null,
        dam_registration_number: null,
        owner_name: null,
        breeder_name: null,
        pedigree: null,
      },
      conflicts: [],
      registrations: [],
      certificate_urls: certificateUrls,
      fallback_to_manual: true,
      fallback_reason: "No data could be extracted from the uploaded documents.",
    };
  }

  // ─── Build per-document extraction objects ────────────────────────
  const documents: RegDocExtraction[] = extractions.map((ext, i) => ({
    document_index: i,
    registry_name: ext.registry_name,
    registry_abbreviation: ext.registry_abbreviation,
    registry_country: ext.registry_country,
    document_type: ext.document_type,
    registered_name: ext.registered_name,
    registration_number: ext.registration_number,
    breed: ext.breed,
    sex: ext.sex,
    date_of_birth: ext.date_of_birth,
    color: ext.color,
    microchip_number: ext.microchip_number,
    tattoo: ext.tattoo,
    dna_number: ext.dna_number,
    sire_name: ext.sire_name,
    sire_registration_number: ext.sire_registration_number,
    dam_name: ext.dam_name,
    dam_registration_number: ext.dam_registration_number,
    owner_name: ext.owner_name,
    owner_address: ext.owner_address,
    breeder_name: ext.breeder_name,
    certificate_date: ext.certificate_date,
    cross_references: ext.cross_references,
    pedigree: ext.pedigree,
    field_confidences: ext.field_confidences,
    overall_confidence: ext.overall_confidence,
    model_used: ext.model_used,
    flags: [
      ...(perDocFlags[i] || []),
      ...(i === 0 ? crossFlags : []), // attach cross-doc flags to first doc
    ],
  }));

  // ─── Detect conflicts ─────────────────────────────────────────────
  const conflicts: RegConflict[] = [];

  const nameConflict = detectConflict(
    "registered_name",
    extractions.map((e, i) => ({
      value: e.registered_name,
      documentIndex: i,
      registry: e.registry_abbreviation,
    })),
    (v) => v.toLowerCase().replace(/\s+/g, " ").trim()
  );
  if (nameConflict) conflicts.push(nameConflict);

  const dobConflict = detectConflict(
    "date_of_birth",
    extractions.map((e, i) => ({
      value: e.date_of_birth,
      documentIndex: i,
      registry: e.registry_abbreviation,
    }))
  );
  if (dobConflict) conflicts.push(dobConflict);

  const sexConflict = detectConflict(
    "sex",
    extractions.map((e, i) => ({
      value: e.sex,
      documentIndex: i,
      registry: e.registry_abbreviation,
    }))
  );
  if (sexConflict) conflicts.push(sexConflict);

  const chipConflict = detectConflict(
    "microchip_number",
    extractions.map((e, i) => ({
      value: e.microchip_number,
      documentIndex: i,
      registry: e.registry_abbreviation,
    })),
    (v) => v.replace(/[\s\-]/g, "")
  );
  if (chipConflict) conflicts.push(chipConflict);

  // ─── Merge suggested fields ───────────────────────────────────────
  const suggested: SuggestedDogFields = {
    registered_name: pickBestValue(extractions, "registered_name", "registered_name") || "",
    date_of_birth: pickBestValue(extractions, "date_of_birth", "date_of_birth"),
    sex: (pickBestValue(extractions, "sex", "sex") as "male" | "female" | null),
    color: pickBestValue(extractions, "color", "color"),
    microchip_number: pickBestValue(extractions, "microchip_number", "microchip"),
    sire_name: pickBestValue(extractions, "sire_name"),
    sire_registration_number: pickBestValue(extractions, "sire_registration_number"),
    dam_name: pickBestValue(extractions, "dam_name"),
    dam_registration_number: pickBestValue(extractions, "dam_registration_number"),
    owner_name: pickBestValue(extractions, "owner_name"),
    breeder_name: pickBestValue(extractions, "breeder_name"),
    pedigree: pickBestPedigree(extractions),
  };

  // ─── Match organizations ──────────────────────────────────────────
  const registrations: MergedRegistration[] = [];
  for (let i = 0; i < extractions.length; i++) {
    const ext = extractions[i];
    if (!ext.registration_number) continue;

    const orgMatch = await matchOrganization(
      db,
      clubId,
      ext.registry_abbreviation,
      ext.registry_name,
      ext.registry_country
    );

    registrations.push({
      organization_id: orgMatch.organization_id,
      organization_name: orgMatch.organization_name,
      organization_abbreviation: orgMatch.organization_abbreviation,
      organization_country: orgMatch.organization_country,
      registration_number: ext.registration_number,
      document_index: i,
    });
  }

  return {
    documents,
    suggested,
    conflicts,
    registrations,
    certificate_urls: certificateUrls,
    fallback_to_manual: false,
  };
}

// ─── Auto-Create Organizations ──────────────────────────────────────────────

/**
 * Auto-create missing organizations that were identified by the LLM
 * but don't exist in the DB yet.
 *
 * @returns Updated registrations with organization_id filled in.
 */
export async function autoCreateMissingOrgs(
  db: Database,
  clubId: string,
  registrations: MergedRegistration[]
): Promise<MergedRegistration[]> {
  const updated = [...registrations];

  for (let i = 0; i < updated.length; i++) {
    const reg = updated[i];
    if (reg.organization_id) continue; // already matched

    // Check if another registration in this batch already created this org
    const alreadyCreated = updated
      .slice(0, i)
      .find(
        (r) =>
          r.organization_id &&
          r.organization_abbreviation === reg.organization_abbreviation
      );

    if (alreadyCreated) {
      updated[i] = { ...reg, organization_id: alreadyCreated.organization_id };
      continue;
    }

    // Create new organization
    const [newOrg] = await db
      .insert(organizations)
      .values({
        club_id: clubId,
        name: `${reg.organization_name} (${reg.organization_abbreviation})`,
        type: "kennel_club",
        country: reg.organization_country,
        is_active: true,
        sort_order: 100, // put at end, admin can reorder
      })
      .returning({ id: organizations.id });

    if (newOrg) {
      console.log(
        `[reg-merger] Auto-created organization: ${reg.organization_abbreviation} (${reg.organization_name}) → ${newOrg.id}`
      );
      updated[i] = { ...reg, organization_id: newOrg.id };
    }
  }

  return updated;
}
