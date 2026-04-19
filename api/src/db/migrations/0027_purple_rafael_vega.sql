CREATE TABLE "litter_ad_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "litter_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"image_url" varchar(500),
	"contact_url" varchar(500),
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"price_cents" integer,
	"payment_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"revision_notes" text,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"impression_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_post_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"ad_id" uuid NOT NULL,
	"platform" varchar(30) NOT NULL,
	"external_post_id" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "can_approve_ads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "litter_ad_events" ADD CONSTRAINT "litter_ad_events_ad_id_litter_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."litter_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter_ads" ADD CONSTRAINT "litter_ads_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter_ads" ADD CONSTRAINT "litter_ads_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter_ads" ADD CONSTRAINT "litter_ads_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter_ads" ADD CONSTRAINT "litter_ads_approved_by_members_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_log" ADD CONSTRAINT "social_post_log_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_log" ADD CONSTRAINT "social_post_log_ad_id_litter_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."litter_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_litter_ad_events_ad" ON "litter_ad_events" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "idx_litter_ad_events_type_date" ON "litter_ad_events" USING btree ("ad_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_litter_ads_club_status" ON "litter_ads" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "idx_litter_ads_member" ON "litter_ads" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_litter_ads_expires" ON "litter_ads" USING btree ("club_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_social_post_log_ad" ON "social_post_log" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "idx_social_post_log_club_platform" ON "social_post_log" USING btree ("club_id","platform");