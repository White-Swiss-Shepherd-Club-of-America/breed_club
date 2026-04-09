import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import { members, membershipTiers } from "../db/schema.js";
import {
  type AuthContext,
  type Permission,
  hasPermission,
  hasTierLevel,
  SYSTEM_LEVELS,
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
 * Looks up the member record by clerkUserId + clubId, resolves the
 * tier's numeric level from membership_tiers, and attaches the full
 * AuthContext to the request. If no member record exists, auth is null.
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

  // Resolve the tier's numeric level
  const tierRow = await db.query.membershipTiers.findFirst({
    where: and(
      eq(membershipTiers.club_id, clubId),
      eq(membershipTiers.slug, member.tier)
    ),
    columns: { level: true },
  });
  const tierLevel = tierRow?.level ?? 0;
  const isAdmin = tierLevel >= SYSTEM_LEVELS.ADMIN || member.is_admin === true;

  const authCtx: AuthContext = {
    tier: member.tier,
    tierLevel,
    isAdmin,
    flags: {
      is_breeder: member.is_breeder,
      can_approve_members: member.can_approve_members,
      can_approve_clearances: member.can_approve_clearances,
      can_manage_registry: member.can_manage_registry,
    },
    memberId: member.id,
    contactId: member.contact_id,
    clubId,
    member: {
      id: member.id,
      tier: member.tier,
      tierLevel,
      is_admin: member.is_admin,
      verified_breeder: member.verified_breeder,
      is_breeder: member.is_breeder,
      can_approve_members: member.can_approve_members,
      can_approve_clearances: member.can_approve_clearances,
      can_manage_registry: member.can_manage_registry,
      skip_fees: member.skip_fees,
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
 * Create a middleware that requires a minimum tier level.
 *
 * Usage:
 *   app.get("/search", requireLevel(20), handler);  // member+
 *   app.get("/admin", requireLevel(100), handler);   // admin only
 */
export function requireLevel(minLevel: number) {
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

    // The is_admin flag grants admin-equivalent access, so it satisfies any
    // level check at or below ADMIN.
    const meetsLevel =
      hasTierLevel(auth.tierLevel, minLevel) ||
      (auth.isAdmin && minLevel <= SYSTEM_LEVELS.ADMIN);
    if (!meetsLevel) {
      return c.json(
        { error: { code: "FORBIDDEN", message: `Requires tier level ${minLevel} or higher` } },
        403
      );
    }

    return next();
  });
}

/**
 * @deprecated Use requireLevel() instead.
 */
export function requireTier(minTier: string) {
  const levelMap: Record<string, number> = {
    public: 0,
    non_member: 1,
    member: 20,
    admin: SYSTEM_LEVELS.ADMIN,
  };
  return requireLevel(levelMap[minTier] ?? 0);
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

    if (!auth.flags[flag] && !auth.isAdmin) {
      return c.json(
        { error: { code: "FORBIDDEN", message: `Requires ${flag} permission` } },
        403
      );
    }

    return next();
  });
}
