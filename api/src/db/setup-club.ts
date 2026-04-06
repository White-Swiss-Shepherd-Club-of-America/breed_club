/**
 * Setup script: creates a new club record.
 *
 * This must run before the seed script, which loads reference data into an existing club.
 *
 * Usage: DATABASE_URL=... npx tsx src/db/setup-club.ts \
 *   --name "White Swiss Shepherd Club of America" \
 *   --slug wssca \
 *   --breed "White Swiss Shepherd Dog"
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { clubs, membershipTiers } from "./schema.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--") && i + 1 < args.length) {
      const key = arg.slice(2);
      parsed[key] = args[++i]!;
    }
  }

  return parsed;
}

const args = parseArgs();

if (!args.name || !args.slug || !args.breed) {
  console.error("Usage: npx tsx src/db/setup-club.ts --name <name> --slug <slug> --breed <breed>");
  console.error("");
  console.error("  --name     Club display name (e.g., 'White Swiss Shepherd Club of America')");
  console.error("  --slug     URL slug (e.g., 'wssca')");
  console.error("  --breed    Breed name (e.g., 'White Swiss Shepherd Dog')");
  console.error("  --color    Primary color hex (optional, default: #655e7a)");
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function setup() {
  console.log(`Creating club: ${args.name} (${args.slug})\n`);

  const [club] = await db
    .insert(clubs)
    .values({
      name: args.name!,
      slug: args.slug!,
      breed_name: args.breed!,
      primary_color: args.color || "#655e7a",
      settings: {
        fees: {
          create_dog: { certificate: 1500, member: 500 },
          add_clearance: { certificate: 500, member: 0 },
        },
      },
    })
    .onConflictDoNothing()
    .returning();

  if (!club) {
    console.log(`Club with slug "${args.slug}" already exists.`);
  } else {
    console.log(`Created club: ${club.name}`);
    console.log(`  ID:    ${club.id}`);
    console.log(`  Slug:  ${club.slug}`);
    console.log(`  Breed: ${club.breed_name}`);

    // Seed default membership tiers
    const defaultTiers = [
      { slug: "public", label: "Public", level: 0, sort_order: 0 },
      { slug: "non_member", label: "Non-Member", level: 1, is_default: true, sort_order: 1 },
      { slug: "certificate", label: "Certificate", level: 10, sort_order: 2 },
      { slug: "member", label: "Member", level: 20, sort_order: 3 },
      { slug: "admin", label: "Admin", level: 100, is_system: true, sort_order: 4 },
    ];

    await db.insert(membershipTiers).values(
      defaultTiers.map((t) => ({
        club_id: club.id,
        ...t,
      }))
    );
    console.log(`  Seeded ${defaultTiers.length} default membership tiers`);
  }

  console.log("\nDone. You can now run the seed script:");
  console.log(`  DATABASE_URL=... CLUB_SLUG=${args.slug} npx tsx src/db/seed.ts`);

  await client.end();
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
