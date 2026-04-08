import * as schema from "./schema.js";
import * as relations from "./relations.js";

const schemaObj = { ...schema, ...relations };

async function createPostgresDb(connectionString: string) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(connectionString, {
    idle_timeout: 20,
    max_lifetime: 60 * 5,
  });
  return drizzle(client, { schema: schemaObj });
}

async function createNeonDb(connectionString: string) {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const sql = neon(connectionString);
  return drizzle(sql, { schema: schemaObj });
}

export async function createDb(connectionString: string, useNeon = false) {
  const db = useNeon
    ? await createNeonDb(connectionString)
    : await createPostgresDb(connectionString);
  return db as Awaited<ReturnType<typeof createPostgresDb>>;
}

export type Database = Awaited<ReturnType<typeof createPostgresDb>>;

export async function getDb(envOrDb: any): Promise<Database> {
  if (envOrDb && typeof envOrDb.select === "function") {
    return envOrDb;
  }
  return createDb(envOrDb.DATABASE_URL, envOrDb.USE_NEON_DRIVER === "true");
}
