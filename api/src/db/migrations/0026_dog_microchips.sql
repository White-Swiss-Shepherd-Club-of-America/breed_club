-- Create dog_microchips table
CREATE TABLE IF NOT EXISTS "dog_microchips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dog_id" uuid NOT NULL,
  "microchip_number" varchar(50) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dog_microchips_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dog_microchips_dog" ON "dog_microchips" USING btree ("dog_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dog_microchips_unique" ON "dog_microchips" USING btree ("dog_id","microchip_number");
--> statement-breakpoint
-- Migrate existing microchip_number data from dogs table
INSERT INTO "dog_microchips" ("dog_id", "microchip_number")
SELECT "id", "microchip_number" FROM "dogs" WHERE "microchip_number" IS NOT NULL AND "microchip_number" != '';
--> statement-breakpoint
-- Drop the old column
ALTER TABLE "dogs" DROP COLUMN IF EXISTS "microchip_number";
