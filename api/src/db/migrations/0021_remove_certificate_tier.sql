-- Promote any members currently on the 'certificate' tier to 'member'.
UPDATE "members"
SET "tier" = 'member',
    "updated_at" = now()
WHERE "tier" = 'certificate';

-- Update any invitations that reference the certificate tier.
UPDATE "member_invitations"
SET "tier" = 'member'
WHERE "tier" = 'certificate';

-- Remove the certificate tier row from membership_tiers.
DELETE FROM "membership_tiers"
WHERE "slug" = 'certificate';

-- Update club fee settings: rename 'certificate' keys to 'non_member'.
-- This handles the JSON fee config stored in clubs.settings.
UPDATE "clubs"
SET "settings" = jsonb_set(
  jsonb_set(
    "settings"::jsonb,
    '{fees,create_dog}',
    (COALESCE("settings"::jsonb->'fees'->'create_dog', '{}'::jsonb) - 'certificate')
      || jsonb_build_object('non_member',
         COALESCE("settings"::jsonb->'fees'->'create_dog'->'certificate', '1500'::jsonb))
  ),
  '{fees,add_clearance}',
  (COALESCE("settings"::jsonb->'fees'->'add_clearance', '{}'::jsonb) - 'certificate')
    || jsonb_build_object('non_member',
       COALESCE("settings"::jsonb->'fees'->'add_clearance'->'certificate', '500'::jsonb))
)
WHERE "settings"::jsonb->'fees'->'create_dog' ? 'certificate'
   OR "settings"::jsonb->'fees'->'add_clearance' ? 'certificate';
