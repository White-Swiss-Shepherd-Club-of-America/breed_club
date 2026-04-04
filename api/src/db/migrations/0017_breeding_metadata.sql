-- Add breeding metadata columns to dogs table
ALTER TABLE "dogs" ADD COLUMN "breeding_status" varchar(20) DEFAULT 'not_published' NOT NULL;
ALTER TABLE "dogs" ADD COLUMN "stud_service_available" boolean DEFAULT false NOT NULL;
ALTER TABLE "dogs" ADD COLUMN "frozen_semen_available" boolean DEFAULT false NOT NULL;
