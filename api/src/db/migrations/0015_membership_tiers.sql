-- Configurable membership tiers per club

CREATE TABLE IF NOT EXISTS "membership_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id"),
  "slug" varchar(50) NOT NULL,
  "label" varchar(100) NOT NULL,
  "level" integer NOT NULL,
  "color" varchar(7),
  "is_system" boolean NOT NULL DEFAULT false,
  "is_default" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_membership_tiers_club_slug" ON "membership_tiers" ("club_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_membership_tiers_club_level" ON "membership_tiers" ("club_id", "level");
CREATE INDEX IF NOT EXISTS "idx_membership_tiers_club" ON "membership_tiers" ("club_id");

-- Seed default tiers for all existing clubs
INSERT INTO "membership_tiers" ("club_id", "slug", "label", "level", "color", "is_system", "is_default", "sort_order")
SELECT id, 'public',      'Public',             0,   NULL,      false, false, 0 FROM "clubs"
UNION ALL
SELECT id, 'non_member',  'Non-Member',         1,   '#6b7280', false, true,  1 FROM "clubs"
UNION ALL
SELECT id, 'certificate', 'Certificate Member', 10,  '#3b82f6', false, false, 2 FROM "clubs"
UNION ALL
SELECT id, 'member',      'Full Member',        20,  '#10b981', false, false, 3 FROM "clubs"
UNION ALL
SELECT id, 'admin',       'Administrator',      100, '#ef4444', true,  false, 4 FROM "clubs"
ON CONFLICT DO NOTHING;
