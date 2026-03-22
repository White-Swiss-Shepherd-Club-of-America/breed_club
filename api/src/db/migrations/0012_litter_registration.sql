-- Litter registration: add litter_name, num_males/num_females, sire approval fields
-- Remove expected_date, num_puppies_born, num_puppies_survived

ALTER TABLE "litters" ADD COLUMN "litter_name" varchar(100);
ALTER TABLE "litters" ADD COLUMN "num_males" integer;
ALTER TABLE "litters" ADD COLUMN "num_females" integer;
ALTER TABLE "litters" ADD COLUMN "sire_approval_status" varchar(20) NOT NULL DEFAULT 'not_required';
ALTER TABLE "litters" ADD COLUMN "sire_approval_by" uuid REFERENCES "members"("id");
ALTER TABLE "litters" ADD COLUMN "sire_approval_at" timestamp with time zone;

ALTER TABLE "litters" DROP COLUMN IF EXISTS "expected_date";
ALTER TABLE "litters" DROP COLUMN IF EXISTS "num_puppies_born";
ALTER TABLE "litters" DROP COLUMN IF EXISTS "num_puppies_survived";
ALTER TABLE "litters" DROP COLUMN IF EXISTS "status";
