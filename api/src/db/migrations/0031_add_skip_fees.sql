-- Add skip_fees column to members table
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "skip_fees" boolean NOT NULL DEFAULT false;
