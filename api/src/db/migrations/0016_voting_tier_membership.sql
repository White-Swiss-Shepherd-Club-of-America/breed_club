-- Link voting tiers to membership tiers for automatic point assignment.
-- When a member votes, their points come from the voting tier linked to their membership tier.
-- Manual member_voting_tiers assignments act as overrides.

ALTER TABLE "voting_tiers"
  ADD COLUMN "membership_tier_id" uuid REFERENCES "membership_tiers"("id") ON DELETE SET NULL;

CREATE INDEX "idx_voting_tiers_membership_tier" ON "voting_tiers" ("membership_tier_id");
