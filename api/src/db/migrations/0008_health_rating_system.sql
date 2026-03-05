CREATE TABLE "health_rating_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"category_weights" jsonb NOT NULL,
	"critical_categories" jsonb NOT NULL,
	"score_thresholds" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_rating_configs_club_id_unique" UNIQUE("club_id")
);
--> statement-breakpoint
ALTER TABLE "health_test_types" RENAME COLUMN "is_required_for_chic" TO "is_required";--> statement-breakpoint
ALTER TABLE "dogs" ADD COLUMN "health_rating" jsonb;--> statement-breakpoint
ALTER TABLE "health_test_type_orgs" ADD COLUMN "thresholds" jsonb;--> statement-breakpoint
ALTER TABLE "health_test_types" ADD COLUMN "rating_category" varchar(30);--> statement-breakpoint
ALTER TABLE "health_rating_configs" ADD CONSTRAINT "health_rating_configs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;