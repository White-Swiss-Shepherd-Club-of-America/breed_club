ALTER TABLE "dog_audit_logs" ALTER COLUMN "dog_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "dog_audit_logs" DROP CONSTRAINT "dog_audit_logs_dog_id_fkey";
--> statement-breakpoint
ALTER TABLE "dog_audit_logs" ADD CONSTRAINT "dog_audit_logs_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE set null ON UPDATE no action;
