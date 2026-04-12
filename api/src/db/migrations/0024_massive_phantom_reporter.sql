DROP INDEX "idx_clearances_dog_test_org_date";--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD COLUMN "is_preliminary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD COLUMN "application_number" varchar(100);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_clearances_dog_test_org_date" ON "dog_health_clearances" USING btree ("dog_id","health_test_type_id","organization_id","test_date","is_preliminary");