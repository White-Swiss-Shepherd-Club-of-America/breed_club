import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import { members, contacts } from "../db/schema.js";
import {
  type Tier,
  type AuthContext,
  type Permission,
  hasPermission,
  hasTier,
} from "@breed-club/shared";

type RbacVariables = {
  clerkUserId: string | null;
  clubId: string;
  db: Database;
  auth: AuthContext | null;
};

/**
 * Load member middleware.
 *
 * Looks up the member record by clerkUserId + clubId and attaches
 * the full AuthContext to the request. If no member record exists,
 * auth is null (the user is authenticated via Clerk but has no
 * member record yet).
 *
 * Must run AFTER requireAuth/optionalAuth and clubContext.
 */
export const loadMember = createMiddleware<{
  Bindings: Env;
  Variables: RbacVariables;
}>(async (c, next) => {
  const clerkUserId = c.get("clerkUserId");
  const clubId = c.get("clubId");
  const db = c.get("db");

  if (!clerkUserId) {
    c.set("auth", null);
    return next();
  }

  const member = await db.query.members.findFirst({
    where: and(eq(members.club_id, clubId), eq(members.clerk_user_id, clerkUserId)),
    with: {
      contact: true,
    },
  });

  if (!member) {
    c.set("auth", null);
    return next();
  }

  const authCtx: AuthContext = {
    tier: member.tier as Tier,
    flags: {
      is_breeder: member.is_breeder,
      can_approve_members: member.can_approve_members,
      can_approve_clearances: member.can_approve_clearances,
    },
    memberId: member.id,
    contactId: member.contact_id,
    clubId,
    member: {
      id: member.id,
      tier: member.tier as Tier,
      verified_breeder: member.verified_breeder,
      is_breeder: member.is_breeder,
      can_approve_members: member.can_approve_members,
      can_approve_clearances: member.can_approve_clearances,
    },
  };

  c.set("auth", authCtx);
  return next();
});

/**
 * Create a middleware that requires a specific permission.
 *
 * Usage:
 *   app.get("/dogs", requirePermission("dogs:read_all"), handler);
 */
export function requirePermission(permission: Permission) {
  return createMiddleware<{
    Bindings: Env;
    Variables: RbacVariables;
  }>(async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "No member record found. Please complete registration." } },
        403
      );
    }

    if (!hasPermission(auth, permission)) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "You do not have permission to perform this action" } },
        403
      );
    }

    return next();
  });
}

/**
 * Create a middleware that requires a minimum tier.
 *
 * Usage:
 *   app.get("/search", requireTier("member"), handler);
 */
export function requireTier(minTier: Tier) {
  return createMiddleware<{
    Bindings: Env;
    Variables: RbacVariables;
  }>(async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "No member record found. Please complete registration." } },
        403
      );
    }

    if (!hasTier(auth.tier, minTier)) {
      return c.json(
        { error: { code: "FORBIDDEN", message: `Requires ${minTier} tier or higher` } },
        403
      );
    }

    return next();
  });
}

/**
 * Create a middleware that requires a specific permission flag.
 *
 * Usage:
 *   app.post("/litters", requireFlag("is_breeder"), handler);
 */
export function requireFlag(flag: keyof AuthContext["flags"]) {
  return createMiddleware<{
    Bindings: Env;
    Variables: RbacVariables;
  }>(async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "No member record found. Please complete registration." } },
        403
      );
    }

    if (!auth.flags[flag]) {
      return c.json(
        { error: { code: "FORBIDDEN", message: `Requires ${flag} permission` } },
        403
      );
    }

    return next();
  });
}
