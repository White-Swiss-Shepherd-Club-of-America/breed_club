DROP INDEX "idx_clearances_dog_test";--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ALTER COLUMN "test_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD COLUMN "result_data" jsonb;--> statement-breakpoint
ALTER TABLE "health_test_type_orgs" ADD COLUMN "result_schema" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_clearances_dog_test_org_date" ON "dog_health_clearances" USING btree ("dog_id","health_test_type_id","organization_id","test_date");