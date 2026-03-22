/**
 * Seed script: populates organizations and health test types for a club.
 *
 * The club must already exist (created via setup script or admin UI).
 * This script loads reference data under that club.
 *
 * Usage: DATABASE_URL=... CLUB_SLUG=wssca npx tsx src/db/seed.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { clubs, organizations, healthTestTypes, healthTestTypeOrgs, healthRatingConfigs, type ResultSchema, type RatingThresholds } from "./schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
const CLUB_SLUG = process.env.CLUB_SLUG;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!CLUB_SLUG) {
  console.error("CLUB_SLUG is required (the slug of the club to seed data into)");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client);

async function seed() {
  console.log(`Seeding reference data for club: ${CLUB_SLUG}\n`);

  // ─── Look up existing club ────────────────────────────────────────────

  const club = await db.select().from(clubs).where(eq(clubs.slug, CLUB_SLUG!)).limit(1);
  if (club.length === 0) {
    console.error(`Club "${CLUB_SLUG}" not found. Create it first with the setup script.`);
    process.exit(1);
  }
  const clubId = club[0]!.id;
  console.log(`Found club: ${club[0]!.name} (${clubId})`);

  // ─── Organizations ────────────────────────────────────────────────────

  const orgData = [
    // Health testing orgs
    { name: "OFA", type: "health_testing", country: "US", website_url: "https://ofa.org", description: "Orthopedic Foundation for Animals", sort_order: 1 },
    { name: "PennHIP", type: "health_testing", country: "US", website_url: "https://antechimagingservices.com/pennhip/", description: "University of Pennsylvania Hip Improvement Program", sort_order: 2 },
    { name: "CAER", type: "health_testing", country: "US", website_url: "https://www.ofa.org/diseases/eye-certification", description: "Companion Animal Eye Registry", sort_order: 3 },
    { name: "CHIC", type: "health_testing", country: "US", website_url: "https://www.ofa.org/about/chic-program", description: "Canine Health Information Center", sort_order: 4 },
    { name: "Embark", type: "health_testing", country: "US", website_url: "https://embarkvet.com", description: "Embark Veterinary DNA testing", sort_order: 5 },
    { name: "Wisdom Panel", type: "health_testing", country: "US", website_url: "https://www.wisdompanel.com", description: "Mars Veterinary DNA testing", sort_order: 6 },
    { name: "Animal Genetics", type: "health_testing", country: "US", website_url: "https://www.animalgenetics.us", description: "Animal Genetics DNA testing lab", sort_order: 7 },
    { name: "UC Davis VGL", type: "health_testing", country: "US", website_url: "https://vgl.ucdavis.edu", description: "UC Davis Veterinary Genetics Lab", sort_order: 8 },

    // Grading bodies (non-US hip/elbow schemes)
    { name: "BVA/KC", type: "grading_body", country: "GB", website_url: "https://www.bva.co.uk", description: "British Veterinary Association / Kennel Club hip & elbow scheme", sort_order: 20 },
    { name: "SV", type: "grading_body", country: "DE", website_url: "https://www.schaeferhunde.de", description: "Verein fur Deutsche Schaferhunde (German a-stamp)", sort_order: 21 },

    // Kennel clubs
    { name: "AKC", type: "kennel_club", country: "US", website_url: "https://www.akc.org", description: "American Kennel Club", sort_order: 30 },
    { name: "UKC", type: "kennel_club", country: "US", website_url: "https://www.ukcdogs.com", description: "United Kennel Club", sort_order: 31 },
    { name: "FCI", type: "kennel_club", country: null, website_url: "https://www.fci.be", description: "Federation Cynologique Internationale", sort_order: 32 },
    { name: "CKC", type: "kennel_club", country: "CA", website_url: "https://www.ckc.ca", description: "Canadian Kennel Club", sort_order: 33 },
    { name: "KC", type: "kennel_club", country: "GB", website_url: "https://www.thekennelclub.org.uk", description: "The Kennel Club (UK)", sort_order: 34 },
    { name: "SKG", type: "kennel_club", country: "CH", website_url: "https://www.skg.ch", description: "Schweizerische Kynologische Gesellschaft (Swiss)", sort_order: 35 },
    { name: "VDH", type: "kennel_club", country: "DE", website_url: "https://www.vdh.de", description: "Verband fur das Deutsche Hundewesen (German)", sort_order: 36 },
    { name: "SCC", type: "kennel_club", country: "FR", website_url: "https://www.centrale-canine.fr", description: "Societe Centrale Canine (France)", sort_order: 37 },

    // Pedigree databases
    { name: "Pedigree Database", type: "pedigree_database", country: null, website_url: "https://www.pedigreedatabase.com", description: "International pedigree database", sort_order: 50 },
    { name: "K9Data", type: "pedigree_database", country: null, website_url: "https://www.k9data.com", description: "K9 pedigree database", sort_order: 51 },
  ] as const;

  const insertedOrgs = await db
    .insert(organizations)
    .values(orgData.map((o) => ({ ...o, club_id: clubId })))
    .onConflictDoNothing()
    .returning();

  // Build a name→id lookup from whatever is in the DB for this club
  const allOrgs = await db.select().from(organizations).where(eq(organizations.club_id, clubId));
  const orgByName: Record<string, string> = {};
  for (const o of allOrgs) {
    orgByName[o.name] = o.id;
  }
  console.log(`Organizations: ${insertedOrgs.length} inserted, ${allOrgs.length} total`);

  // ─── Health Test Types ────────────────────────────────────────────────

  // ─── Result Schema Presets (with score_config) ─────────────────────

  const OFA_HIPS_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Excellent", "Good", "Fair", "Borderline", "Mild", "Moderate", "Severe"],
    score_config: {
      score_map: { "Excellent": 100, "Good": 90, "Fair": 70, "Borderline": 50, "Mild": 30, "Moderate": 15, "Severe": 0 },
    },
  };

  const PENNHIP_SCHEMA: ResultSchema = {
    type: "numeric_lr",
    fields: [{ label: "Distraction Index", key: "di", min: 0, max: 1, step: 0.01 }],
    score_config: {
      field: "di",
      ranges: [
        { max: 0.30, score: 100 },
        { max: 0.40, score: 80 },
        { max: 0.50, score: 60 },
        { max: 0.60, score: 40 },
        { max: 0.70, score: 20 },
        { max: 1.00, score: 0 },
      ],
    },
  };

  const BVA_HIPS_SCHEMA: ResultSchema = {
    type: "point_score_lr",
    subcategories: [
      { label: "Norberg Angle", key: "norberg_angle", max: 6 },
      { label: "Subluxation", key: "subluxation", max: 6 },
      { label: "Cranial acetabular edge", key: "cranial_acetabular_edge", max: 6 },
      { label: "Dorsal acetabular edge", key: "dorsal_acetabular_edge", max: 6 },
      { label: "Cranial effect acetabular rim", key: "cranial_effect_acetabular_rim", max: 6 },
      { label: "Acetabular fossa", key: "acetabular_fossa", max: 6 },
      { label: "Caudal acetabular edge", key: "caudal_acetabular_edge", max: 5 },
      { label: "Femoral head/neck exostosis", key: "femoral_head_neck_exostosis", max: 6 },
      { label: "Femoral head re-contouring", key: "femoral_head_recontouring", max: 6 },
    ],
    score_config: {
      ranges: [
        { max: 5, score: 100 },
        { max: 10, score: 90 },
        { max: 15, score: 75 },
        { max: 25, score: 50 },
        { max: 35, score: 25 },
        { max: 53, score: 0 },
      ],
    },
  };

  const SV_HIPS_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Normal (a1)", "Fast Normal (a2)", "Noch Zugelassen (a3)", "Leicht (a4)", "Mittel (a5)", "Schwer (a6)"],
    score_config: {
      score_map: {
        "Normal (a1)": 100, "Fast Normal (a2)": 85, "Noch Zugelassen (a3)": 60,
        "Leicht (a4)": 35, "Mittel (a5)": 15, "Schwer (a6)": 0,
      },
    },
  };

  const FCI_HIPS_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2", "E1", "E2"],
    score_config: {
      score_map: { "A1": 100, "A2": 90, "B1": 80, "B2": 70, "C1": 50, "C2": 40, "D1": 20, "D2": 10, "E1": 5, "E2": 0 },
    },
  };

  const OFA_ELBOWS_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Normal", "DJD1", "DJD2", "DJD3"],
    score_config: {
      score_map: { "Normal": 100, "DJD1": 66, "DJD2": 33, "DJD3": 0 },
    },
  };

  const BVA_ELBOWS_SCHEMA: ResultSchema = {
    type: "elbow_lr",
    score_config: {
      score_map: { "0": 100, "1": 66, "2": 33, "3": 0 },
    },
  };

  // ─── Shared enum schemas for simple pass/fail and genetic tests ───

  const NORMAL_ABNORMAL_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Normal", "Abnormal"],
    score_config: {
      score_map: { "Normal": 100, "Abnormal": 0 },
    },
  };

  const EYE_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Normal", "Normal w/Breeder Option", "Abnormal"],
    score_config: {
      score_map: { "Normal": 100, "Normal w/Breeder Option": 75, "Abnormal": 0 },
    },
  };

  const GENETIC_CLEAR_CARRIER_AFFECTED: ResultSchema = {
    type: "enum",
    options: ["Clear", "Carrier", "Affected"],
    score_config: {
      score_map: { "Clear": 100, "Carrier": 50, "Affected": 0 },
    },
  };

  const DM_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Normal/Clear", "Carrier", "At Risk/Affected"],
    score_config: {
      score_map: { "Normal/Clear": 100, "Carrier": 50, "At Risk/Affected": 0 },
    },
  };

  const MDR1_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Normal/Normal", "Normal/Mutant", "Mutant/Mutant"],
    score_config: {
      score_map: { "Normal/Normal": 100, "Normal/Mutant": 50, "Mutant/Mutant": 0 },
    },
  };

  const DENTITION_SCHEMA: ResultSchema = {
    type: "enum",
    options: ["Full", "Missing Teeth"],
    score_config: {
      score_map: { "Full": 100, "Missing Teeth": 30 },
    },
  };

  // ─── Test Type Definitions ────────────────────────────────────────

  const testTypeData: Array<{
    name: string;
    short_name: string;
    category: string;
    rating_category: string;
    result_options: string[];
    is_required: boolean;
    description: string;
    sort_order: number;
    grading_orgs: Array<{ name: string; result_schema: ResultSchema | null; confidence: number | null; thresholds: RatingThresholds | null }>;
  }> = [
    {
      name: "Hip Dysplasia",
      short_name: "Hips",
      category: "orthopedic",
      rating_category: "hips",
      result_options: ["Excellent", "Good", "Fair", "Borderline", "Mild", "Moderate", "Severe"],
      is_required: true,
      description: "Hip joint evaluation. OFA uses radiographic grading; PennHIP uses distraction index measurement; BVA/KC uses point scoring.",
      sort_order: 1,
      grading_orgs: [
        { name: "OFA", result_schema: OFA_HIPS_SCHEMA, confidence: 4, thresholds: { auto_dq: 15, poor: 30, fair: 50, good: 70 } },
        { name: "PennHIP", result_schema: PENNHIP_SCHEMA, confidence: 9, thresholds: { auto_dq: 20, poor: 40, fair: 60, good: 80 } },
        { name: "BVA/KC", result_schema: BVA_HIPS_SCHEMA, confidence: 8, thresholds: { auto_dq: 0, poor: 25, fair: 50, good: 75 } },
        { name: "SV", result_schema: SV_HIPS_SCHEMA, confidence: 7, thresholds: { auto_dq: 15, poor: 35, fair: 60, good: 85 } },
        { name: "FCI", result_schema: FCI_HIPS_SCHEMA, confidence: 7, thresholds: { auto_dq: 10, poor: 40, fair: 70, good: 90 } },
      ],
    },
    {
      name: "Elbow Dysplasia",
      short_name: "Elbows",
      category: "orthopedic",
      rating_category: "elbows",
      result_options: ["Normal", "DJD1", "DJD2", "DJD3"],
      is_required: true,
      description: "Elbow joint evaluation for degenerative joint disease.",
      sort_order: 2,
      grading_orgs: [
        { name: "OFA", result_schema: OFA_ELBOWS_SCHEMA, confidence: 4, thresholds: { auto_dq: 0, poor: 33, fair: 66, good: 90 } },
        { name: "BVA/KC", result_schema: BVA_ELBOWS_SCHEMA, confidence: 8, thresholds: { auto_dq: 0, poor: 33, fair: 66, good: 90 } },
      ],
    },
    {
      name: "Patellar Luxation",
      short_name: "Patellas",
      category: "orthopedic",
      rating_category: "patella",
      result_options: ["Normal", "Abnormal"],
      is_required: false,
      description: "Kneecap evaluation for luxation tendency.",
      sort_order: 3,
      grading_orgs: [{ name: "OFA", result_schema: NORMAL_ABNORMAL_SCHEMA, confidence: 7, thresholds: { auto_dq: 0, poor: 0, fair: 50, good: 90 } }],
    },
    {
      name: "Cardiac",
      short_name: "Cardiac",
      category: "cardiac",
      rating_category: "cardiac",
      result_options: ["Normal", "Abnormal"],
      is_required: true,
      description: "Basic cardiac examination or echocardiogram by veterinary cardiologist.",
      sort_order: 4,
      grading_orgs: [{ name: "OFA", result_schema: NORMAL_ABNORMAL_SCHEMA, confidence: 8, thresholds: { auto_dq: 0, poor: 0, fair: 50, good: 90 } }],
    },
    {
      name: "Eye Examination",
      short_name: "Eyes",
      category: "vision",
      rating_category: "vision",
      result_options: ["Normal", "Normal w/Breeder Option", "Abnormal"],
      is_required: true,
      description: "Companion Animal Eye Registry (CAER) exam by veterinary ophthalmologist.",
      sort_order: 5,
      grading_orgs: [
        { name: "CAER", result_schema: EYE_SCHEMA, confidence: 8, thresholds: { auto_dq: 0, poor: 0, fair: 50, good: 90 } },
        { name: "OFA", result_schema: EYE_SCHEMA, confidence: 8, thresholds: { auto_dq: 0, poor: 0, fair: 50, good: 90 } },
      ],
    },
    {
      name: "Thyroid",
      short_name: "Thyroid",
      category: "thyroid",
      rating_category: "other",
      result_options: ["Normal", "Abnormal"],
      is_required: false,
      description: "Thyroid function blood test (T4, free T4, TSH, TgAA).",
      sort_order: 6,
      grading_orgs: [{ name: "OFA", result_schema: NORMAL_ABNORMAL_SCHEMA, confidence: 8, thresholds: { auto_dq: 0, poor: 0, fair: 50, good: 90 } }],
    },
    {
      name: "Degenerative Myelopathy (DM)",
      short_name: "DM",
      category: "genetic",
      rating_category: "genetics",
      result_options: ["Normal/Clear", "Carrier", "At Risk/Affected"],
      is_required: true,
      description: "DNA test for SOD1 mutation. Progressive spinal cord disease, typical onset 8-14 years. Note: test reliability is limited.",
      sort_order: 7,
      grading_orgs: [
        { name: "OFA", result_schema: DM_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Embark", result_schema: DM_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Animal Genetics", result_schema: DM_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "UC Davis VGL", result_schema: DM_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Wisdom Panel", result_schema: DM_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
      ],
    },
    {
      name: "Multi-Drug Resistance 1 (MDR1)",
      short_name: "MDR1",
      category: "genetic",
      rating_category: "genetics",
      result_options: ["Normal/Normal", "Normal/Mutant", "Mutant/Mutant"],
      is_required: true,
      description: "DNA test for ABCB1 (MDR1) gene mutation. Affects ability to process certain drugs including ivermectin, loperamide, acepromazine.",
      sort_order: 8,
      grading_orgs: [
        { name: "OFA", result_schema: MDR1_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Embark", result_schema: MDR1_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Animal Genetics", result_schema: MDR1_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "UC Davis VGL", result_schema: MDR1_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Wisdom Panel", result_schema: MDR1_SCHEMA, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
      ],
    },
    {
      name: "Von Willebrand's Disease (vWD)",
      short_name: "vWD",
      category: "genetic",
      rating_category: "genetics",
      result_options: ["Clear", "Carrier", "Affected"],
      is_required: false,
      description: "DNA test for inherited bleeding disorder. Encouraged due to GSD ancestry.",
      sort_order: 9,
      grading_orgs: [
        { name: "OFA", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Embark", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Animal Genetics", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "UC Davis VGL", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
      ],
    },
    {
      name: "Hemophilia A",
      short_name: "Hemo A",
      category: "genetic",
      rating_category: "genetics",
      result_options: ["Clear", "Carrier", "Affected"],
      is_required: false,
      description: "DNA test for Factor VIII deficiency. Sex-linked bleeding disorder recommended due to GSD ancestry.",
      sort_order: 10,
      grading_orgs: [
        { name: "OFA", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Embark", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Animal Genetics", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "UC Davis VGL", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
      ],
    },
    {
      name: "Leukocyte Adhesion Deficiency (LAD)",
      short_name: "LAD",
      category: "genetic",
      rating_category: "genetics",
      result_options: ["Clear", "Carrier", "Affected"],
      is_required: false,
      description: "DNA test for immune system deficiency.",
      sort_order: 11,
      grading_orgs: [
        { name: "OFA", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Embark", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
        { name: "Animal Genetics", result_schema: GENETIC_CLEAR_CARRIER_AFFECTED, confidence: 10, thresholds: { auto_dq: 0, poor: 0, fair: 25, good: 75 } },
      ],
    },
    {
      name: "Dentition",
      short_name: "Dentition",
      category: "dental",
      rating_category: "dentition",
      result_options: ["Full", "Missing Teeth"],
      is_required: false,
      description: "Veterinary examination of teeth for completeness.",
      sort_order: 12,
      grading_orgs: [{ name: "OFA", result_schema: DENTITION_SCHEMA, confidence: 7, thresholds: { auto_dq: 0, poor: 0, fair: 15, good: 80 } }],
    },
  ];

  // Build a short_name → id lookup of existing test types for this club
  // (no unique constraint on short_name, so we query and take the first match)
  const existingTestTypes = await db
    .select({ id: healthTestTypes.id, short_name: healthTestTypes.short_name })
    .from(healthTestTypes)
    .where(eq(healthTestTypes.club_id, clubId));
  const testTypeIdByShortName: Record<string, string> = {};
  for (const existing of existingTestTypes) {
    testTypeIdByShortName[existing.short_name] = existing.id;
  }

  let insertedCount = 0;
  for (const tt of testTypeData) {
    const { grading_orgs, ...data } = tt;

    // Use existing test type if found, otherwise insert
    let testTypeId = testTypeIdByShortName[tt.short_name];
    if (!testTypeId) {
      const [testType] = await db
        .insert(healthTestTypes)
        .values({ ...data, club_id: clubId })
        .returning();
      testTypeId = testType!.id;
      insertedCount++;
    }

    // Upsert org links — always update result_schema and confidence so score_config lands
    const orgLinks = grading_orgs
      .map((org) => {
        const orgId = orgByName[org.name];
        if (!orgId) {
          console.warn(`  Warning: org "${org.name}" not found for test "${tt.name}"`);
          return null;
        }
        return {
          health_test_type_id: testTypeId,
          organization_id: orgId,
          result_schema: org.result_schema,
          confidence: org.confidence,
          thresholds: org.thresholds,
        };
      })
      .filter(Boolean) as Array<{ health_test_type_id: string; organization_id: string; result_schema: ResultSchema | null; confidence: number | null; thresholds: RatingThresholds | null }>;

    if (orgLinks.length > 0) {
      await db
        .insert(healthTestTypeOrgs)
        .values(orgLinks)
        .onConflictDoUpdate({
          target: [healthTestTypeOrgs.health_test_type_id, healthTestTypeOrgs.organization_id],
          set: {
            result_schema: sql`EXCLUDED.result_schema`,
            confidence: sql`EXCLUDED.confidence`,
            thresholds: sql`EXCLUDED.thresholds`,
          },
        });
    }

    console.log(`  ${tt.short_name} → ${orgLinks.length} grading orgs (upserted)`);
  }

  console.log(`\nHealth test types: ${insertedCount} inserted, ${existingTestTypes.length} already existed`);

  // ─── Health Rating Config ──────────────────────────────────────────

  const [ratingConfig] = await db
    .insert(healthRatingConfigs)
    .values({
      club_id: clubId,
      category_weights: {
        hips: 20,
        genetics: 20,
        elbows: 15,
        vision: 12,
        spine: 10,
        cardiac: 8,
        patella: 5,
        dentition: 3,
        temperament: 5,
        other: 2,
      },
      critical_categories: ["hips", "genetics", "elbows"],
      score_thresholds: { red: 20, orange: 40, yellow: 60, green: 95 },
    })
    .onConflictDoNothing()
    .returning();

  if (ratingConfig) {
    console.log("Health rating config: created");
  } else {
    console.log("Health rating config: already exists");
  }

  console.log("Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
