-- Add is_admin flag to members. Grants admin-equivalent access without
-- changing the user's membership tier.
ALTER TABLE "members" ADD COLUMN "is_admin" boolean NOT NULL DEFAULT false;
