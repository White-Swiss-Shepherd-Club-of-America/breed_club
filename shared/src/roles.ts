/**
 * RBAC: Composable tier + permission flags
 *
 * Base tier represents access/payment level.
 * Permission flags are additive booleans on top of the tier.
 */

export const TIERS = ["public", "non_member", "certificate", "member", "admin"] as const;
export type Tier = (typeof TIERS)[number];

/** Numeric hierarchy for tier comparison */
export const TIER_LEVEL: Record<Tier, number> = {
  public: 0,
  non_member: 1,
  certificate: 2,
  member: 3,
  admin: 4,
};

/** Permission flags (additive booleans on members table) */
export interface PermissionFlags {
  is_breeder: boolean;
  can_approve_members: boolean;
  can_approve_clearances: boolean;
}

/** Full authorization context for a request */
export interface AuthContext {
  tier: Tier;
  flags: PermissionFlags;
  memberId: string;
  contactId: string;
  clubId: string;
  /** Full member record (optional, for convenience) */
  member?: {
    id: string;
    tier: Tier;
    verified_breeder: boolean;
    is_breeder: boolean;
    can_approve_members: boolean;
    can_approve_clearances: boolean;
  };
}

/**
 * Check if a tier meets a minimum requirement.
 * e.g., hasTier("member", "certificate") => true
 */
export function hasTier(actual: Tier, required: Tier): boolean {
  return TIER_LEVEL[actual] >= TIER_LEVEL[required];
}

/**
 * Permission definitions: what tier + flags are needed for each action.
 */
export const PERMISSIONS = {
  // Dogs
  "dogs:create": { minTier: "certificate" as Tier },
  "dogs:read_own": { minTier: "certificate" as Tier },
  "dogs:read_all": { minTier: "member" as Tier },
  "dogs:approve": { minTier: "member" as Tier, flag: "can_approve_clearances" as const },

  // Health clearances
  "health:create": { minTier: "certificate" as Tier },
  "health:read_own": { minTier: "certificate" as Tier },
  "health:read_all": { minTier: "member" as Tier },
  "health:verify": { minTier: "member" as Tier, flag: "can_approve_clearances" as const },

  // Litters
  "litters:create": { minTier: "certificate" as Tier, flag: "is_breeder" as const },
  "litters:read_own": { minTier: "certificate" as Tier },
  "litters:read_all": { minTier: "member" as Tier },

  // Members
  "members:read_directory": { minTier: "non_member" as Tier },
  "members:approve": { minTier: "member" as Tier, flag: "can_approve_members" as const },
  "members:manage": { minTier: "admin" as Tier },

  // Search / research
  "research:access": { minTier: "member" as Tier },

  // Admin
  "settings:manage": { minTier: "admin" as Tier },
  "orgs:manage": { minTier: "admin" as Tier },
  "test_types:manage": { minTier: "admin" as Tier },
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Check if an auth context satisfies a permission requirement.
 */
export function hasPermission(auth: AuthContext, permission: Permission): boolean {
  // Admin always has access
  if (auth.tier === "admin") return true;

  const req = PERMISSIONS[permission];
  if (!hasTier(auth.tier, req.minTier)) return false;

  if ("flag" in req && req.flag) {
    return auth.flags[req.flag] === true;
  }

  return true;
}
