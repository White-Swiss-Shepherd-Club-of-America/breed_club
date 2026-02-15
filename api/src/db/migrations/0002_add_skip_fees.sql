-- Add skip_fees column to members table
ALTER TABLE "members" ADD COLUMN "skip_fees" boolean NOT NULL DEFAULT false;

-- Set admin users to skip fees by default
UPDATE "members" SET "skip_fees" = true WHERE "tier" = 'admin';
