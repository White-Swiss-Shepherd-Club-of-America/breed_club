-- Deduplicate microchip numbers across dogs before adding global unique constraint.
-- Keeps the microchip row attached to the earliest-created dog and deletes the rest.
DELETE FROM dog_microchips WHERE id IN (
  SELECT id FROM (
    SELECT dm.id,
      ROW_NUMBER() OVER (
        PARTITION BY dm.microchip_number
        ORDER BY d.created_at ASC
      ) AS rn
    FROM dog_microchips dm
    JOIN dogs d ON d.id = dm.dog_id
  ) ranked
  WHERE rn > 1
);

-- Deduplicate registration numbers per organization across dogs (same logic).
DELETE FROM dog_registrations WHERE id IN (
  SELECT id FROM (
    SELECT dr.id,
      ROW_NUMBER() OVER (
        PARTITION BY dr.organization_id, dr.registration_number
        ORDER BY d.created_at ASC
      ) AS rn
    FROM dog_registrations dr
    JOIN dogs d ON d.id = dr.dog_id
  ) ranked
  WHERE rn > 1
);

-- Prevent duplicate registration numbers at the same organization across different dogs
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dog_registrations_org_number" ON "dog_registrations" ("organization_id", "registration_number");

-- Prevent the same microchip number being assigned to different dogs
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dog_microchips_number_global" ON "dog_microchips" ("microchip_number");
