CREATE TABLE "health_cert_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"version_name" varchar(100) NOT NULL,
	"effective_date" date NOT NULL,
	"required_test_type_ids" jsonb NOT NULL,
	"category_weights" jsonb NOT NULL,
	"critical_categories" jsonb NOT NULL,
	"score_thresholds" jsonb NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_cert_versions" ADD CONSTRAINT "health_cert_versions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cert_versions_club_date" ON "health_cert_versions" USING btree ("club_id","effective_date");