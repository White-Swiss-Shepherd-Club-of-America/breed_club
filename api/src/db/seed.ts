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
import { eq } from "drizzle-orm";
import { clubs, organizations, healthTestTypes, healthTestTypeOrgs } from "./schema.js";

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

  const testTypeData: Array<{
    name: string;
    short_name: string;
    category: string;
    result_options: string[];
    is_required_for_chic: boolean;
    description: string;
    sort_order: number;
    grading_orgs: string[];
  }> = [
    {
      name: "Hip Dysplasia",
      short_name: "Hips",
      category: "orthopedic",
      result_options: ["Excellent", "Good", "Fair", "Borderline", "Mild", "Moderate", "Severe"],
      is_required_for_chic: true,
      description: "Hip joint evaluation. OFA uses radiographic grading; PennHIP uses distraction index measurement.",
      sort_order: 1,
      grading_orgs: ["OFA", "PennHIP", "BVA/KC", "SV"],
    },
    {
      name: "Elbow Dysplasia",
      short_name: "Elbows",
      category: "orthopedic",
      result_options: ["Normal", "DJD1", "DJD2", "DJD3"],
      is_required_for_chic: true,
      description: "Elbow joint evaluation for degenerative joint disease.",
      sort_order: 2,
      grading_orgs: ["OFA", "BVA/KC"],
    },
    {
      name: "Patellar Luxation",
      short_name: "Patellas",
      category: "orthopedic",
      result_options: ["Normal", "Abnormal"],
      is_required_for_chic: false,
      description: "Kneecap evaluation for luxation tendency.",
      sort_order: 3,
      grading_orgs: ["OFA"],
    },
    {
      name: "Cardiac",
      short_name: "Cardiac",
      category: "cardiac",
      result_options: ["Normal", "Abnormal"],
      is_required_for_chic: true,
      description: "Basic cardiac examination or echocardiogram by veterinary cardiologist.",
      sort_order: 4,
      grading_orgs: ["OFA"],
    },
    {
      name: "Eye Examination",
      short_name: "Eyes",
      category: "vision",
      result_options: ["Normal", "Normal w/Breeder Option", "Abnormal"],
      is_required_for_chic: true,
      description: "Companion Animal Eye Registry (CAER) exam by veterinary ophthalmologist.",
      sort_order: 5,
      grading_orgs: ["CAER", "OFA"],
    },
    {
      name: "Thyroid",
      short_name: "Thyroid",
      category: "thyroid",
      result_options: ["Normal", "Abnormal"],
      is_required_for_chic: false,
      description: "Thyroid function blood test (T4, free T4, TSH, TgAA).",
      sort_order: 6,
      grading_orgs: ["OFA"],
    },
    {
      name: "Degenerative Myelopathy (DM)",
      short_name: "DM",
      category: "genetic",
      result_options: ["Normal/Clear", "Carrier", "At Risk/Affected"],
      is_required_for_chic: true,
      description: "DNA test for SOD1 mutation. Progressive spinal cord disease, typical onset 8-14 years. Note: test reliability is limited.",
      sort_order: 7,
      grading_orgs: ["OFA", "Embark", "Animal Genetics", "UC Davis VGL", "Wisdom Panel"],
    },
    {
      name: "Multi-Drug Resistance 1 (MDR1)",
      short_name: "MDR1",
      category: "genetic",
      result_options: ["Normal/Normal", "Normal/Mutant", "Mutant/Mutant"],
      is_required_for_chic: true,
      description: "DNA test for ABCB1 (MDR1) gene mutation. Affects ability to process certain drugs including ivermectin, loperamide, acepromazine.",
      sort_order: 8,
      grading_orgs: ["OFA", "Embark", "Animal Genetics", "UC Davis VGL", "Wisdom Panel"],
    },
    {
      name: "Von Willebrand's Disease (vWD)",
      short_name: "vWD",
      category: "genetic",
      result_options: ["Clear", "Carrier", "Affected"],
      is_required_for_chic: false,
      description: "DNA test for inherited bleeding disorder. Encouraged due to GSD ancestry.",
      sort_order: 9,
      grading_orgs: ["OFA", "Embark", "Animal Genetics", "UC Davis VGL"],
    },
    {
      name: "Hemophilia A",
      short_name: "Hemo A",
      category: "genetic",
      result_options: ["Clear", "Carrier", "Affected"],
      is_required_for_chic: false,
      description: "DNA test for Factor VIII deficiency. Sex-linked bleeding disorder recommended due to GSD ancestry.",
      sort_order: 10,
      grading_orgs: ["OFA", "Embark", "Animal Genetics", "UC Davis VGL"],
    },
    {
      name: "Leukocyte Adhesion Deficiency (LAD)",
      short_name: "LAD",
      category: "genetic",
      result_options: ["Clear", "Carrier", "Affected"],
      is_required_for_chic: false,
      description: "DNA test for immune system deficiency.",
      sort_order: 11,
      grading_orgs: ["OFA", "Embark", "Animal Genetics"],
    },
    {
      name: "Dentition",
      short_name: "Dentition",
      category: "dental",
      result_options: ["Full", "Missing Teeth"],
      is_required_for_chic: false,
      description: "Veterinary examination of teeth for completeness.",
      sort_order: 12,
      grading_orgs: ["OFA"],
    },
  ];

  let insertedCount = 0;
  for (const tt of testTypeData) {
    const { grading_orgs, ...data } = tt;

    const [testType] = await db
      .insert(healthTestTypes)
      .values({ ...data, club_id: clubId })
      .onConflictDoNothing()
      .returning();

    if (!testType) continue; // already exists
    insertedCount++;

    // Link grading organizations
    const orgLinks = grading_orgs
      .map((orgName) => {
        const orgId = orgByName[orgName];
        if (!orgId) {
          console.warn(`  Warning: org "${orgName}" not found for test "${tt.name}"`);
          return null;
        }
        return {
          health_test_type_id: testType.id,
          organization_id: orgId,
        };
      })
      .filter(Boolean) as Array<{ health_test_type_id: string; organization_id: string }>;

    if (orgLinks.length > 0) {
      await db.insert(healthTestTypeOrgs).values(orgLinks).onConflictDoNothing();
    }

    console.log(`  ${tt.short_name} → ${orgLinks.length} grading orgs`);
  }

  console.log(`\nHealth test types: ${insertedCount} inserted`);
  console.log("Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
