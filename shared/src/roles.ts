/**
 * RBAC: Level-based tier system + permission flags
 *
 * Membership tiers are configurable per club (stored in membership_tiers table).
 * Each tier has a numeric level used for access control comparisons.
 * Permission flags are additive booleans on top of the tier level.
 */

/** System-reserved level for admin (always highest, cannot be deleted) */
export const SYSTEM_LEVELS = {
  ADMIN: 100,
} as const;

/** Default levels used when seeding a new club */
export const DEFAULT_LEVELS = {
  public: 0,
  non_member: 1,
  member: 20,
  admin: 100,
} as const;

/**
 * @deprecated Use level-based checks instead. Kept for transition.
 */
export const TIERS = ["public", "non_member", "member", "admin"] as const;

/**
 * @deprecated Use `string` instead. Tier slugs are now club-configurable.
 */
export type Tier = string;

/**
 * @deprecated Use DEFAULT_LEVELS instead.
 */
export const TIER_LEVEL: Record<string, number> = {
  public: 0,
  non_member: 1,
  member: 3,
  admin: 4,
};

/** Permission flags (additive booleans on members table) */
export interface PermissionFlags {
  is_breeder: boolean;
  can_approve_members: boolean;
  can_approve_clearances: boolean;
  can_manage_registry: boolean;
}

/** Full authorization context for a request */
export interface AuthContext {
  tier: string;
  tierLevel: number;
  flags: PermissionFlags;
  memberId: string;
  contactId: string;
  clubId: string;
  /** Full member record (optional, for convenience) */
  member?: {
    id: string;
    tier: string;
    tierLevel: number;
    verified_breeder: boolean;
    is_breeder: boolean;
    can_approve_members: boolean;
    can_approve_clearances: boolean;
    can_manage_registry: boolean;
    skip_fees: boolean;
  };
}

/**
 * Check if a tier level meets a minimum requirement.
 */
export function hasTierLevel(actualLevel: number, requiredLevel: number): boolean {
  return actualLevel >= requiredLevel;
}

/**
 * @deprecated Use hasTierLevel() instead.
 */
export function hasTier(actual: string, required: string): boolean {
  const actualLevel = TIER_LEVEL[actual] ?? 0;
  const requiredLevel = TIER_LEVEL[required] ?? 0;
  return actualLevel >= requiredLevel;
}

/**
 * Permission definitions: what level + flags are needed for each action.
 */
export const PERMISSIONS = {
  // Dogs
  "dogs:create": { minLevel: 1 },           // non_member+
  "dogs:read_own": { minLevel: 1 },
  "dogs:read_all": { minLevel: 20 },         // member+
  "dogs:approve": { minLevel: 20, flag: "can_approve_clearances" as const },
  "dogs:edit": { minLevel: 20, flag: "can_manage_registry" as const },

  // Health clearances
  "health:create": { minLevel: 1 },
  "health:read_own": { minLevel: 1 },
  "health:read_all": { minLevel: 20 },
  "health:verify": { minLevel: 20, flag: "can_approve_clearances" as const },

  // Litters
  "litters:create": { minLevel: 20, flag: "is_breeder" as const },
  "litters:read_own": { minLevel: 20 },
  "litters:read_all": { minLevel: 20 },

  // Members
  "members:read_directory": { minLevel: 1 },
  "members:approve": { minLevel: 20, flag: "can_approve_members" as const },
  "members:manage": { minLevel: SYSTEM_LEVELS.ADMIN },

  // Search / research
  "research:access": { minLevel: 20 },

  // Admin
  "settings:manage": { minLevel: SYSTEM_LEVELS.ADMIN },
  "orgs:manage": { minLevel: SYSTEM_LEVELS.ADMIN },
  "test_types:manage": { minLevel: SYSTEM_LEVELS.ADMIN },

  // Elections / Voting
  "elections:manage": { minLevel: SYSTEM_LEVELS.ADMIN },
  "elections:vote": { minLevel: 20 },
  "elections:view": { minLevel: 20 },
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Check if an auth context satisfies a permission requirement.
 */
export function hasPermission(auth: AuthContext, permission: Permission): boolean {
  // Admin always has access
  if (auth.tierLevel >= SYSTEM_LEVELS.ADMIN) return true;

  const req = PERMISSIONS[permission];
  if (auth.tierLevel < req.minLevel) return false;

  if ("flag" in req && req.flag) {
    return auth.flags[req.flag] === true;
  }

  return true;
}
