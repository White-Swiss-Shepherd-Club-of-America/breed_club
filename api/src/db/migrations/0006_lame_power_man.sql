CREATE TABLE "membership_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"field_key" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"field_type" varchar(30) NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "form_data" jsonb;--> statement-breakpoint
ALTER TABLE "membership_form_fields" ADD CONSTRAINT "membership_form_fields_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_form_fields_club_key" ON "membership_form_fields" USING btree ("club_id","field_key");--> statement-breakpoint
CREATE INDEX "idx_form_fields_club_active" ON "membership_form_fields" USING btree ("club_id","is_active");