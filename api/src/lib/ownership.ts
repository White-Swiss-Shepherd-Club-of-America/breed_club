import type { AuthContext } from "@breed-club/shared";

/**
 * Core ownership rule, expressed over member primitives so it can be reused
 * where there is no request `AuthContext` — notably the Stripe webhook, which
 * is called by Stripe and must still re-check that the paying member may
 * attach a resource to the dog named in the payment metadata.
 */
export function memberOwnsDog(
  member: { contact_id: string | null; is_admin: boolean; can_approve_clearances: boolean },
  dog: { owner_id: string | null; submitted_by: string | null },
  clubSettings?: Record<string, unknown>
): boolean {
  if (member.is_admin) return true;
  if (member.can_approve_clearances) return true;
  if (dog.owner_id && member.contact_id === dog.owner_id) return true;
  if (!dog.owner_id && !dog.submitted_by && clubSettings?.allow_member_edit_unowned_dogs) return true;
  return false;
}

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
  return memberOwnsDog(
    {
      contact_id: auth.contactId,
      is_admin: auth.isAdmin,
      can_approve_clearances: auth.flags.can_approve_clearances,
    },
    dog,
    clubSettings
  );
}
