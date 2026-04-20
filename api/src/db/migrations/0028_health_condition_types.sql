CREATE TABLE "health_condition_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(30) NOT NULL,
	"description" text,
	"is_hereditary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_conditions" ADD COLUMN "condition_type_id" uuid;--> statement-breakpoint
ALTER TABLE "health_conditions" ADD COLUMN "medical_severity" varchar(20);--> statement-breakpoint
ALTER TABLE "health_conditions" ADD COLUMN "breeding_impact" varchar(20);--> statement-breakpoint
ALTER TABLE "health_conditions" ADD COLUMN "status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "health_condition_types" ADD CONSTRAINT "health_condition_types_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_health_condition_types_club" ON "health_condition_types" USING btree ("club_id");--> statement-breakpoint
ALTER TABLE "health_conditions" ADD CONSTRAINT "health_conditions_condition_type_id_health_condition_types_id_fk" FOREIGN KEY ("condition_type_id") REFERENCES "public"."health_condition_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_health_conditions_status" ON "health_conditions" USING btree ("status");