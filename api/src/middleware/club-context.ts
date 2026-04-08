import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import { createDb, type Database } from "../db/client.js";
import { clubs } from "../db/schema.js";

type ClubVariables = {
  clubId: string;
  club: typeof clubs.$inferSelect;
  db: Database;
};

/**
 * Club context middleware.
 *
 * Resolves the club from the CLUB_SLUG env var (single-club deployments)
 * or from a request header/subdomain (multi-club future).
 *
 * Also creates the DB client and attaches it to the context so routes
 * don't need to create their own connections.
 */
export const clubContext = createMiddleware<{
  Bindings: Env;
  Variables: ClubVariables;
}>(async (c, next) => {
  const db = await createDb(c.env.DATABASE_URL, c.env.USE_NEON_DRIVER === "true");
  c.set("db", db);

  const slug = c.env.CLUB_SLUG;
  if (!slug) {
    return c.json(
      { error: { code: "CONFIG_ERROR", message: "CLUB_SLUG not configured" } },
      500
    );
  }

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
  });

  if (!club) {
    return c.json(
      { error: { code: "NOT_FOUND", message: `Club "${slug}" not found` } },
      404
    );
  }

  c.set("clubId", club.id);
  c.set("club", club);
  return next();
});
