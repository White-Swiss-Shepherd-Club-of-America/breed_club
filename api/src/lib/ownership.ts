import type { AuthContext } from "@breed-club/shared";

/**
 * Check if the authenticated user is considered the "owner" of a dog.
 * Returns true if:
 * - User is admin tier
 * - User has can_approve_clearances flag
 * - User's contactId matches dog.owner_id
 * - Dog has no owner and club allows member editing of unowned dogs
 */
export function isDogOwner(
  auth: AuthContext,
  dog: { owner_id: string | null; submitted_by: string | null },
  clubSettings?: Record<string, unknown>
): boolean {
  if (auth.tierLevel >= 100) return true;
  if (auth.flags.can_approve_clearances) return true;
  if (dog.owner_id && auth.contactId === dog.owner_id) return true;
  if (!dog.owner_id && !dog.submitted_by && clubSettings?.allow_member_edit_unowned_dogs) return true;
  return false;
}
